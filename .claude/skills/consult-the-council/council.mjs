#!/usr/bin/env node

/**
 * Consult the Council — Hit multiple frontier models in parallel for cross-model review.
 *
 * Usage: node council.mjs <input-file> [--low|--medium|--high] [--models openai,grok,gemini,perplexity] [--force]
 *        node council.mjs --check [--effort …]   (one tiny call per member: confirms keys + model ids)
 *
 * Reads a problem/spec from <input-file>, sends it to every council member,
 * collects their feedback, and writes structured output to stdout, ending with a cost table.
 *
 * Effort levels (which to use when: SKILL.md, "When it is required, and at which level"):
 *   low    — fast, cheap. Quick sanity check.
 *   medium — balanced. Every round after the first, and all routine work (the default).
 *   high   — max reasoning. Only the first round on key work, or the round after a REJECT.
 *
 * Budget guards:
 *   - Input over INPUT_CHAR_CAP characters is refused; --force sends it anyway, with a warning.
 *   - Grok is skipped when the input is over GROK_MAX_INPUT_CHARS (it times out there, and xAI bills the
 *     abandoned generation anyway).
 *   - Every run ends with input/output tokens and $ per member, plus a total.
 *
 * Keys (first match wins per key): process env → this checkout's .env → the main checkout's .env (when run
 * from a git worktree, which has no .env) → $COUNCIL_ENV_FILE → ~/dev/ul-langgraph/.env.
 *   OPENAI_API_KEY · XAI_API_KEY · GEMINI_API_KEY · PERPLEXITY_API_KEY
 *
 * Model ids: override one member for every effort with COUNCIL_MODEL_<MEMBER> (e.g. COUNCIL_MODEL_OPENAI).
 * Last verified against the live model lists on 2026-10-18; run --check after changing them.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_RESPONSES = 2;

// --- Budget guards (UNI-309) ---
// Refuse input files longer than this unless --force: send the diff and the relevant excerpts, not whole files.
const INPUT_CHAR_CAP = 30_000;
// Skip Grok when the input file (not counting the ~1.4k-char review prompt) is over this. Evidence and caveats:
// SKILL.md, the "Grok is skipped on inputs over 10,000 characters" note under "The Council".
const GROK_MAX_INPUT_CHARS = 10_000;

// --- Prices, USD per 1M tokens, list prices as of PRICES_AS_OF ---
// Used only when the provider doesn't report the call's cost itself (xAI and Perplexity do; OpenAI and
// Gemini don't). Reasoning/thinking tokens are billed as output by every provider here. A model missing
// from this table prints "$?" and the total is marked incomplete: add it here.
const PRICES_AS_OF = '2026-11-01';
// Long-context tiers (OpenAI > 272k, Gemini/xAI > 200k tokens) are far above INPUT_CHAR_CAP, so not modelled.
// Sources: developers.openai.com/api/docs/pricing · docs.x.ai/docs/models · ai.google.dev/gemini-api/docs/pricing
const PRICES = {
  'gpt-6-astra':            { input: 10.00, output: 50.00 },
  'gpt-6.1-sol':            { input: 2.00,  output: 10.00 },
  'grok-4.7':               { input: 2.00,  output: 6.00 },   // xAI reports its own cost; this is the backup
  'gemini-3.1-pro-preview': { input: 2.00,  output: 12.00 },
  // The alias pointed at gemini-3.8-flash on 2026-11-01: $0.75/$3.75 intro price until 2026-12-31, then
  // $1.50/$7.50. The table uses the later price so the estimate never runs low.
  'gemini-flash-latest':    { input: 1.50,  output: 7.50 },
  // Perplexity reports its own cost (incl. the request fee); no table entry, so a missing report shows "$?".
};

// --- Load .env files without dependencies; earlier files win, real env beats all ---
function parseEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function mainCheckoutRoot() {
  // In a worktree, --git-common-dir points at the main checkout's .git; its parent is the main checkout.
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: __dirname, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return dirname(commonDir);
  } catch {
    return null;
  }
}

function loadEnv() {
  const repoRoot = resolve(__dirname, '..', '..', '..');
  const mainRoot = mainCheckoutRoot();
  const candidates = [
    resolve(repoRoot, '.env'),
    mainRoot && resolve(mainRoot, '.env'),
    process.env.COUNCIL_ENV_FILE,
    resolve(homedir(), 'dev', 'ul-langgraph', '.env'),
  ].filter(Boolean);
  const seen = new Set();
  for (const p of candidates) {
    if (seen.has(p) || !existsSync(p)) continue;
    seen.add(p);
    for (const [key, val] of Object.entries(parseEnvFile(p))) {
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

// --- Members and their models per effort level ---
const EFFORT = {
  openai: {
    low:    { model: 'gpt-6.1-sol', reasoning_effort: 'low' },
    medium: { model: 'gpt-6.1-sol', reasoning_effort: 'medium' },
    high:   { model: 'gpt-6-astra', reasoning_effort: 'high' },
  },
  grok: {
    // grok-4.7 reasons by default; there is no effort knob on chat completions.
    low:    { model: 'grok-4.7' },
    medium: { model: 'grok-4.7' },
    high:   { model: 'grok-4.7' },
  },
  gemini: {
    low:    { model: 'gemini-flash-latest', thinking: 'low' },
    medium: { model: 'gemini-3.1-pro-preview', thinking: 'low' },
    high:   { model: 'gemini-3.1-pro-preview', thinking: 'high' },
    // Pro needs a billed Gemini project; on a quota error the run says so and uses Flash instead.
    quotaFallback: { model: 'gemini-flash-latest', thinking: 'high' },
  },
  perplexity: {
    // The web-grounded member: checks claims against current docs and how others solve it.
    low:    { model: 'sonar-pro' },
    medium: { model: 'sonar-reasoning-pro' },
    high:   { model: 'sonar-reasoning-pro' },
  },
};

function modelFor(member, effort) {
  const cfg = { ...EFFORT[member][effort] };
  const override = process.env[`COUNCIL_MODEL_${member.toUpperCase()}`];
  if (override) cfg.model = override;
  return cfg;
}

function chatCompletionsText(data) {
  if (data.choices && data.choices[0]) {
    return data.choices[0].message?.content || JSON.stringify(data.choices[0]);
  }
  return JSON.stringify(data);
}

// --- Usage: each member maps its API's usage field to { input, output, usd } ---
// output includes reasoning/thinking tokens; usd is the provider's own figure, or null when it gives none.
const num = (v) => (Number.isFinite(v) ? v : 0);

function estimateUsd(model, usage) {
  const p = PRICES[model];
  if (!p) return null;
  return (usage.input * p.input + usage.output * p.output) / 1e6;
}

function costOf(model, usage) {
  if (!usage) return { usd: null, source: 'no usage in response' };
  if (usage.usd != null) return { usd: usage.usd, source: 'reported' };
  const usd = estimateUsd(model, usage);
  return usd == null ? { usd: null, source: `no price for ${model}` } : { usd, source: 'est.' };
}

function buildMembers(effort) {
  return {
    openai: {
      label: 'OpenAI',
      key: process.env.OPENAI_API_KEY || process.env.api_key2,
      keyName: 'OPENAI_API_KEY',
      request(prompt, cfg) {
        return {
          url: 'https://api.openai.com/v1/responses',
          headers: { 'Authorization': `Bearer ${this.key}` },
          body: { model: cfg.model, reasoning: { effort: cfg.reasoning_effort }, input: [{ role: 'user', content: prompt }] },
        };
      },
      parse(data) {
        const msg = data.output?.find(o => o.type === 'message');
        if (msg?.content) return msg.content.map(c => c.text).join('\n');
        return JSON.stringify(data);
      },
      // Responses API: output_tokens already includes reasoning_tokens.
      usage(data) {
        const u = data.usage;
        return u ? { input: num(u.input_tokens), output: num(u.output_tokens), usd: null } : null;
      },
    },

    grok: {
      label: 'Grok',
      key: process.env.XAI_API_KEY,
      keyName: 'XAI_API_KEY',
      request(prompt, cfg) {
        return {
          url: 'https://api.x.ai/v1/chat/completions',
          headers: { 'Authorization': `Bearer ${this.key}` },
          body: { model: cfg.model, messages: [{ role: 'user', content: prompt }] },
        };
      },
      parse: chatCompletionsText,
      // completion_tokens excludes reasoning_tokens (total_tokens = prompt + completion + reasoning).
      // cost_in_usd_ticks is xAI's own charge for the call; 1 tick = 1e-10 USD.
      usage(data) {
        const u = data.usage;
        if (!u) return null;
        const ticks = u.cost_in_usd_ticks;
        return {
          input: num(u.prompt_tokens),
          output: num(u.completion_tokens) + num(u.completion_tokens_details?.reasoning_tokens),
          usd: Number.isFinite(ticks) ? ticks / 1e10 : null,
        };
      },
    },

    gemini: {
      label: 'Gemini',
      key: process.env.GEMINI_API_KEY,
      keyName: 'GEMINI_API_KEY',
      request(prompt, cfg) {
        return {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`,
          headers: { 'x-goog-api-key': this.key },
          body: {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { thinkingConfig: { thinkingLevel: cfg.thinking } },
          },
        };
      },
      parse(data) {
        const parts = data.candidates?.[0]?.content?.parts;
        if (parts) return parts.filter(p => !p.thought).map(p => p.text).join('\n');
        return JSON.stringify(data);
      },
      // candidatesTokenCount excludes thoughtsTokenCount; both are billed as output.
      usage(data) {
        const u = data.usageMetadata;
        if (!u) return null;
        return { input: num(u.promptTokenCount), output: num(u.candidatesTokenCount) + num(u.thoughtsTokenCount), usd: null };
      },
      fallback: EFFORT.gemini.quotaFallback,
    },

    perplexity: {
      label: 'Perplexity',
      key: process.env.PERPLEXITY_API_KEY || process.env.Perplexity_api,
      keyName: 'PERPLEXITY_API_KEY',
      request(prompt, cfg) {
        return {
          url: 'https://api.perplexity.ai/chat/completions',
          headers: { 'Authorization': `Bearer ${this.key}` },
          body: { model: cfg.model, messages: [{ role: 'user', content: prompt }] },
        };
      },
      parse: chatCompletionsText,
      // usage.cost.total_cost is Perplexity's own charge, including the per-request search fee.
      usage(data) {
        const u = data.usage;
        if (!u) return null;
        const total = u.cost?.total_cost;
        return { input: num(u.prompt_tokens), output: num(u.completion_tokens), usd: Number.isFinite(total) ? total : null };
      },
    },
  };
}

// --- System prompt for council members ---
const SYSTEM_CONTEXT = `You are reviewing a technical spec, implementation plan, code change or debugging problem written by another AI (Claude) for a production SaaS product. Be a critical, expert reviewer: find what the author got wrong or missed.

Hold it to a production bar:
- Flag every band-aid or workaround (special-casing, swallowed errors, retries around a bug, fixing the symptom instead of the cause, dummy data) and say what the root-cause fix is.
- Check security, tenant isolation, data integrity, migrations and failure modes.
- Compare the approach with established best practice and with how leading products or well-known open-source projects solve the same problem. Name them.
- Point out decisions that are hard to reverse.

Be specific and actionable. Structure your review as:

## Issues Found
- Concrete problems (bugs, security holes, architectural mistakes, missing edge cases, band-aids)

## Suggestions
- Specific improvements with reasoning, and the best-practice reference where one exists

## Verdict
- APPROVE: No blocking issues, good to proceed
- REVISE: Has issues that should be fixed before proceeding
- REJECT: Fundamental problems that require rethinking the approach

Keep it concise. No filler.`;

// --- One member call (with Gemini's quota fallback) ---
function isQuotaError(status, data) {
  const text = JSON.stringify(data?.error || data || '');
  return status === 429 || /RESOURCE_EXHAUSTED|insufficient_quota|exceeded your current quota/i.test(text);
}

async function post(member, cfg, prompt) {
  const req = member.request(prompt, cfg);
  const response = await fetch(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...req.headers },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // Read the body as text first: a timeout while reading propagates (it's a failure, not an empty answer), and an
  // unparseable 200 (e.g. a proxy's HTML page) is an error, never counted as a response.
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (response.ok) throw new Error(`HTTP ${response.status} with a body that isn't JSON: ${text.slice(0, 200)}`);
    data = { raw: text.slice(0, 300) };
  }
  return { ok: response.ok, status: response.status, data };
}

// Never throws: every member ends as one outcome, so the cost table has a row for each.
//   { label, model, note, status: 'ok' | 'failed' | 'skipped', elapsed, review?, error?, usage?, cost }
async function consult(memberKey, member, effort, prompt, skipReason) {
  let cfg = modelFor(memberKey, effort);
  const base = { label: member.label, model: cfg.model, note: '', elapsed: '0.0' };
  if (skipReason) return { ...base, status: 'skipped', error: skipReason, cost: { usd: 0, source: 'not sent' } };
  if (!member.key) {
    return { ...base, status: 'failed', error: `no API key (set ${member.keyName}).`, cost: { usd: 0, source: 'not sent' } };
  }

  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
  let note = '';
  try {
    let res = await post(member, cfg, prompt);
    if (!res.ok && member.fallback && isQuotaError(res.status, res.data) && cfg.model !== member.fallback.model) {
      note = ` — FALLBACK: ${cfg.model} is out of quota (needs a billed project)`;
      cfg = member.fallback;
      res = await post(member, cfg, prompt);
    }
    if (!res.ok) {
      const hint = isQuotaError(res.status, res.data) ? ' — out of credit/quota: top up the provider account' : '';
      return {
        ...base, model: cfg.model, note, status: 'failed', elapsed: elapsed(),
        error: `HTTP ${res.status}${hint}: ${JSON.stringify(res.data.error || res.data).slice(0, 300)}`,
        // A 4xx is refused before any generation. A 5xx/gateway timeout can come after the provider generated (and
        // billed) an answer, so its cost is unknown.
        cost: res.status < 500
          ? { usd: 0, source: 'request refused' }
          : { usd: null, source: 'unknown: server error, the provider may still bill' },
      };
    }
    const usage = member.usage(res.data);
    return {
      ...base, model: cfg.model, note, status: 'ok', elapsed: elapsed(),
      review: member.parse(res.data), usage, cost: costOf(cfg.model, usage),
    };
  } catch (err) {
    // Aborting only closes our side: the provider may finish generating and bill it, so the cost is unknown.
    const timedOut = err?.name === 'TimeoutError';
    return {
      ...base, model: cfg.model, note, status: 'failed', elapsed: elapsed(),
      error: timedOut ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : `${err?.name || 'Error'}: ${err?.message || err}`,
      cost: { usd: null, source: 'unknown: the provider may still bill the abandoned call' },
    };
  }
}

// --- Output ---
const fmtInt = (n) => n.toLocaleString('en-US');
function fmtUsd(usd) {
  if (usd == null) return '$?';
  if (usd > 0 && usd < 0.0001) return '<$0.0001';
  return `$${usd > 0 && usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
}

function costTable(outcomes) {
  const rows = outcomes.map((o) => {
    const tokens = o.usage ? `${fmtInt(o.usage.input)} in / ${fmtInt(o.usage.output)} out` : '—';
    return `  ${`${o.label} (${o.model})`.padEnd(38)} ${o.status.padEnd(7)} ${tokens.padEnd(26)} ${fmtUsd(o.cost.usd).padStart(8)}  ${o.cost.source} · ${o.elapsed}s`;
  });
  const total = outcomes.reduce((sum, o) => sum + (o.cost.usd ?? 0), 0);
  const unknown = outcomes.filter((o) => o.cost.usd == null).map((o) => o.label);
  const totalLine = `  TOTAL ${fmtUsd(total)}${unknown.length ? ` + unknown for ${unknown.join(', ')} (incomplete)` : ''}`;
  return [`  COST (prices as of ${PRICES_AS_OF}; "reported" = the provider's own figure)`, ...rows, totalLine].join('\n');
}

// --- Arguments ---
const VALUE_FLAGS = new Set(['--effort', '--models']);
const BOOL_FLAGS = new Set(['--low', '--medium', '--high', '--check', '--force', '--help']);

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail(`${a} needs a value.`);
      values[a] = argv[++i];
    } else if (BOOL_FLAGS.has(a)) {
      flags.add(a);
    } else if (a.startsWith('--')) {
      fail(`Unknown option ${a}. Run with --help.`);
    } else {
      positional.push(a);
    }
  }
  return { flags, values, positional };
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// --- Main ---
async function main() {
  const argv = process.argv.slice(2);
  const { flags, values, positional } = parseArgs(argv);

  if (argv.length === 0 || flags.has('--help')) {
    const m = (e) => Object.keys(EFFORT).map(k => modelFor(k, e).model).join(' + ');
    console.log('Usage: node council.mjs <input-file> [--low|--medium|--high] [--models openai,grok,gemini,perplexity] [--force]');
    console.log('       node council.mjs --check [--low|--medium|--high]');
    console.log('');
    console.log(`  low    → ${m('low')}`);
    console.log(`  medium → ${m('medium')}  (default)`);
    console.log(`  high   → ${m('high')}  (first round on key work, or after a REJECT)`);
    console.log('');
    console.log(`  Input over ${fmtInt(INPUT_CHAR_CAP)} chars is refused (--force overrides); Grok is skipped over ${fmtInt(GROK_MAX_INPUT_CHARS)}.`);
    process.exit(0);
  }

  const levels = ['--low', '--medium', '--high'].filter(f => flags.has(f));
  if (levels.length > 1 || (levels.length && values['--effort'])) fail('Give one effort level.');
  let effort = values['--effort'] !== undefined ? values['--effort'].toLowerCase() : (levels[0]?.slice(2) || 'medium');
  if (!['low', 'medium', 'high'].includes(effort)) fail(`Invalid effort level "${effort}". Use low, medium, or high.`);

  const MEMBERS = buildMembers(effort);
  let selected = Object.keys(MEMBERS);
  if (values['--models'] !== undefined) {
    selected = [...new Set(values['--models'].split(',').map(m => m.trim().toLowerCase()).filter(Boolean))];
    const unknown = selected.filter(m => !MEMBERS[m]);
    if (unknown.length || !selected.length) {
      fail(`Unknown member(s): ${unknown.join(', ') || '(none given)'}. Choose from ${Object.keys(MEMBERS).join(', ')}.`);
    }
  }

  const check = flags.has('--check');
  let prompt;
  let inputChars = 0;
  if (check) {
    if (positional.length) fail('--check takes no input file (it sends a one-word test prompt).');
    prompt = 'Reply with the single word: ok';
  } else {
    if (positional.length !== 1) fail('Give exactly one input file. Run with --help.');
    const inputFile = positional[0];
    if (!existsSync(inputFile)) fail(`Input file not found: ${inputFile}`);
    const input = readFileSync(inputFile, 'utf-8');
    if (!input.trim()) fail('Input file is empty');
    inputChars = input.length;
    if (inputChars > INPUT_CHAR_CAP && !flags.has('--force')) {
      fail(`Input is ${fmtInt(inputChars)} chars, over the ${fmtInt(INPUT_CHAR_CAP)}-char cap. Trim it to the diff and the ` +
        'relevant excerpts (on a re-check: only what changed, plus the previous REVISE points). --force sends it anyway.');
    }
    prompt = `${SYSTEM_CONTEXT}\n\n---\n\nHere is the content to review:\n\n${input}`;
  }

  // Grok times out on big inputs and xAI bills the abandoned generation, so don't send it (SKILL.md).
  const skipReason = (k) => (k === 'grok' && inputChars > GROK_MAX_INPUT_CHARS
    ? `input too large for Grok (${fmtInt(inputChars)} > ${fmtInt(GROK_MAX_INPUT_CHARS)} chars)`
    : null);

  // Don't pay for calls that can't make a valid review: fail before sending anything.
  const needed = check ? selected.length : Math.min(MIN_RESPONSES, selected.length);
  const toSend = selected.filter(k => !skipReason(k));
  if (toSend.length < needed) {
    fail(`Only ${toSend.length} member(s) would be sent (${selected.filter(k => skipReason(k)).map(k => `${MEMBERS[k].label}: ${skipReason(k)}`).join('; ')}), ` +
      `and a review needs ${needed}. Add members with --models, or trim the input.`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${check ? 'COUNCIL CHECK' : 'CONSULTING THE COUNCIL'} · effort ${effort.toUpperCase()}`);
  console.log(`  Members: ${selected.map(k => `${MEMBERS[k].label} (${skipReason(k) ? 'SKIPPED' : modelFor(k, effort).model})`).join(', ')}`);
  if (!check) console.log(`  Input: ${fmtInt(inputChars)} chars (cap ${fmtInt(INPUT_CHAR_CAP)}; Grok skipped over ${fmtInt(GROK_MAX_INPUT_CHARS)})`);
  if (inputChars > INPUT_CHAR_CAP) {
    console.log(`  WARNING: --force: sending ${fmtInt(inputChars)} chars, over the ${fmtInt(INPUT_CHAR_CAP)}-char cap. Expect slow, costly answers and timeouts.`);
  }
  console.log(`${'='.repeat(60)}\n`);

  const outcomes = await Promise.all(selected.map(k => consult(k, MEMBERS[k], effort, prompt, skipReason(k))));

  let output = '';
  for (const o of outcomes) {
    output += `\n${'─'.repeat(60)}\n`;
    if (o.status === 'ok') {
      output += `## ${o.label} (${o.model}${o.note}) (${o.elapsed}s)\n${'─'.repeat(60)}\n\n${check ? o.review.trim().slice(0, 40) : o.review}\n`;
    } else if (o.status === 'skipped') {
      output += `## ${o.label} — SKIPPED: ${o.error}\n`;
    } else {
      output += `## ${o.label} (${o.model}${o.note}) — FAILED (${o.elapsed}s)\n${'─'.repeat(60)}\n\n${o.error}\n`;
    }
  }

  const responded = outcomes.filter(o => o.status === 'ok').length;
  const sent = outcomes.filter(o => o.status !== 'skipped').length;
  output += `\n${'='.repeat(60)}\n  ${responded}/${outcomes.length} members responded` +
    `${sent < outcomes.length ? ` (${outcomes.length - sent} skipped)` : ''}\n${costTable(outcomes)}\n${'='.repeat(60)}\n`;
  console.log(output);

  // A review needs at least two independent opinions; a check needs every selected member.
  if (responded < needed) process.exit(1);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
