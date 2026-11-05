#!/usr/bin/env node

/**
 * Consult the Council — Hit multiple frontier models in parallel for cross-model review.
 *
 * Usage: node council.mjs <input-file> [--low|--medium|--high] [--models openai,grok,perplexity,gemini]
 *                         [--force --reason "<why>"] [--force-size --reason "<why>"]
 *        node council.mjs --check [--effort …]   (one tiny call per member: confirms keys + model ids)
 *        node council.mjs --spend [--day YYYY-MM-DD]   (a day's council spend by member and issue; no calls)
 *
 * Reads a problem/spec from <input-file>, sends it to every council member,
 * collects their feedback, and writes structured output to stdout, ending with a cost table.
 *
 * Members (UNI-673): openai, grok and perplexity by default. Gemini joins only when COUNCIL_GEMINI_API_KEY is set
 * (a separate key: production's GEMINI_API_KEY is never used, it serves the /aeo engine).
 *
 * Effort levels (which to use when: SKILL.md, "When it is required, and at which level"):
 *   low    — fast, cheap. Quick sanity check.
 *   medium — balanced. Every round after the first, and all routine work (the default).
 *   high   — max reasoning. Only the first round on key work, or the round after a REJECT.
 *
 * Budget guards:
 *   - Input over INPUT_CHAR_CAP characters is refused; --force-size --reason "<why>" sends it anyway, with a warning.
 *   - Grok is skipped when the input is over GROK_MAX_INPUT_CHARS (it times out there, and xAI bills the
 *     abandoned generation anyway).
 *   - Every run ends with input/output tokens and $ per member, plus a total.
 *   - Every run is logged to ~/.ul-dispatch/council-spend.jsonl (or $COUNCIL_SPEND_LOG): a `started` line with its
 *     estimated cost before any call, a `ran` line with the real cost after; a refusal at the cap logs `refused_cap`.
 *   - A daily cap (COUNCIL_DAILY_CAP_USD, default $10, per UTC day) is checked against that log before a run;
 *     at or over it the run is refused (exit 3). --force --reason "<why>" overrides it, and the reason is logged.
 *
 * Keys (first match wins per variable): process env → $COUNCIL_ENV_FILE (default ~/.ul-dispatch/council.env) →
 * this checkout's .env → the main checkout's .env (when run from a git worktree, which has no .env) →
 * ~/dev/ul-langgraph/.env.
 *   Each member reads its council key first: COUNCIL_OPENAI_API_KEY · COUNCIL_GROK_API_KEY ·
 *   COUNCIL_PERPLEXITY_API_KEY · COUNCIL_GEMINI_API_KEY. Without one, OpenAI, Grok and Perplexity fall back to a
 *   shared repo .env key (OPENAI_API_KEY · XAI_API_KEY · PERPLEXITY_API_KEY; the xAI and Perplexity ones are the
 *   Lambda's own) and the output says so; Gemini doesn't run. Production-only keys (GEMINI_API_KEY, api_key2) are
 *   never read.
 *   Council keys belong in council.env, never in ul-langgraph's .env (its Settings refuse unknown variables).
 *
 * Model ids: override one member for every effort with COUNCIL_MODEL_<MEMBER> (e.g. COUNCIL_MODEL_OPENAI).
 * Last verified against the live model lists on 2026-10-18; run --check after changing them.
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_RESPONSES = 2;

// --- Budget guards (UNI-309) ---
// Refuse input files longer than this unless --force-size: send the diff and the relevant excerpts, not whole files.
const INPUT_CHAR_CAP = 30_000;
// Skip Grok when the input file (not counting the ~1.4k-char review prompt) is over this. Evidence and caveats:
// SKILL.md, the "Grok is skipped on inputs over 10,000 characters" note under "The Council".
const GROK_MAX_INPUT_CHARS = 10_000;

// --- Spend log and daily cap (UNI-673) ---
const SPEND_LOG_DEFAULT = resolve(homedir(), '.ul-dispatch', 'council-spend.jsonl');
const DEFAULT_DAILY_CAP_USD = 10;
const SPEND_LOG_VERSION = 1;
// A call whose cost we don't learn (timed out, 5xx, still running in another session) is counted at an estimate:
// the whole prompt at ~3 characters per token (code and Markdown run denser than prose's ~4) plus this many output
// tokens. It is an estimate, not a hard bound: no request caps its output, since a cap would cut reasoning reviews
// short. It is also what a run reserves while in flight, so it stays near a long real review (2–10k output tokens),
// not the worst case, or a few parallel runs would hold the whole cap.
const UNKNOWN_CALL_CHARS_PER_TOKEN = 3;
const UNKNOWN_CALL_OUTPUT_TOKENS = 16_000;

// --- Prices, USD per 1M tokens, list prices as of PRICES_AS_OF ---
// Used only when the provider doesn't report the call's cost itself (xAI and Perplexity do; OpenAI and
// Gemini don't). Reasoning/thinking tokens are billed as output by every provider here. A model missing
// from this table is counted at the dearest listed price (FALLBACK_PRICE) with a WARNING: add it here.
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
  // Perplexity reports its own cost (incl. the per-request search fee), so these token prices are only the
  // backup and the estimate for a call that didn't finish. Source: docs.perplexity.ai/getting-started/pricing
  'sonar-pro':              { input: 3.00,  output: 15.00 },
  'sonar-reasoning-pro':    { input: 2.00,  output: 8.00 },
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

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// In a worktree, --git-common-dir points at the main checkout's .git; its parent is the main checkout.
function mainCheckoutRoot(cwd) {
  const commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  return commonDir ? dirname(commonDir) : null;
}

function loadEnv() {
  const repoRoot = resolve(__dirname, '..', '..', '..');
  const mainRoot = mainCheckoutRoot(__dirname);
  const candidates = [
    // The council's own keys and settings: a file of its own, so no repo's .env needs council variables.
    process.env.COUNCIL_ENV_FILE || resolve(homedir(), '.ul-dispatch', 'council.env'),
    resolve(repoRoot, '.env'),
    mainRoot && resolve(mainRoot, '.env'),
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
    // Only with COUNCIL_GEMINI_API_KEY (UNI-673). Flash except at --high: Pro at medium drained a $20 top-up in a
    // night of ~20 workers.
    low:    { model: 'gemini-flash-latest', thinking: 'low' },
    medium: { model: 'gemini-flash-latest', thinking: 'high' },
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

// --- Keys (UNI-673): the council's own key first; a shared key only where the member allows it ---
//   shared: repo .env variables the council may fall back to, in order. They are keys a person or the Lambda also
//           uses (on 2026-11-01 the xAI and Perplexity ones were the Lambda's own; UNI-325), so a run on one is
//           labelled "shared key".
//   avoid:  production variables the council never reads. A council key holding one of their values is refused.
// Gemini has no fallback: production's GEMINI_API_KEY serves the /aeo engine, and the council drained it. OpenAI's
// api_key2 is the Lambda's key (UNI-325); the council's OPENAI_API_KEY is a different key (the "Personal" org).
const KEYS = {
  openai:     { council: 'COUNCIL_OPENAI_API_KEY',     shared: ['OPENAI_API_KEY'],                       avoid: ['api_key2'] },
  grok:       { council: 'COUNCIL_GROK_API_KEY',       shared: ['XAI_API_KEY'],                          avoid: [] },
  perplexity: { council: 'COUNCIL_PERPLEXITY_API_KEY', shared: ['PERPLEXITY_API_KEY', 'Perplexity_api'], avoid: [] },
  gemini:     { council: 'COUNCIL_GEMINI_API_KEY',     shared: [],                                       avoid: ['GEMINI_API_KEY'] },
};
const DEFAULT_MEMBERS = ['openai', 'grok', 'perplexity'];

// → { key, keySource: 'council' | 'shared' | null, missing }
//   missing (only when there's no usable key) says what to fix, phrased to follow "no API key: ".
function resolveKey(memberKey) {
  const spec = KEYS[memberKey];
  const valuesOf = (names) => names.map((n) => process.env[n]).filter(Boolean);
  const sharedValues = valuesOf(spec.shared);
  const avoided = spec.avoid.find((n) => process.env[n] && process.env[n] === process.env[spec.council]);
  const own = process.env[spec.council];
  if (avoided) {
    return { key: null, keySource: null, missing: `${spec.council} holds production's ${avoided}; give the council a key of its own` };
  }
  // A "council" key that is really a shared key is a shared key, whatever its name.
  if (own && !sharedValues.includes(own)) return { key: own, keySource: 'council' };
  if (sharedValues.length) return { key: sharedValues[0], keySource: 'shared' };
  return { key: null, keySource: null, missing: `set ${spec.shared.length ? `${spec.council} (or ${spec.shared[0]})` : spec.council}` };
}

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

// A model missing from PRICES (a COUNCIL_MODEL_* override, a moved alias) is priced at the dearest listed input and
// output price, so it can never count as $0 toward the cap. Add its real price to PRICES.
const FALLBACK_PRICE = {
  input: Math.max(...Object.values(PRICES).map((p) => p.input)),
  output: Math.max(...Object.values(PRICES).map((p) => p.output)),
};
const isPriced = (model) => Boolean(PRICES[model]);

function estimateUsd(model, usage) {
  const p = PRICES[model] || FALLBACK_PRICE;
  return (usage.input * p.input + usage.output * p.output) / 1e6;
}

// An estimate (not a hard bound: no request caps its output) of what a call can cost when we don't learn its real
// cost: the whole prompt read, plus a long answer. The reservation before a run and an unfinished call both use it.
function unfinishedUsd(model, promptChars) {
  return estimateUsd(model, {
    input: Math.ceil(promptChars / UNKNOWN_CALL_CHARS_PER_TOKEN),
    output: UNKNOWN_CALL_OUTPUT_TOKENS,
  });
}

const priceNote = (model) => (isPriced(model) ? '' : `; no price for ${model}, counted at the dearest listed price`);

// Cost objects: { usd, source } when known; { usd: null, est, source } when the call's real cost is unknown.
function costOf(model, usage, promptChars) {
  if (!usage) return { usd: null, est: unfinishedUsd(model, promptChars), source: `no usage in response${priceNote(model)}` };
  if (usage.usd != null) return { usd: usage.usd, source: 'reported' };
  return { usd: estimateUsd(model, usage), source: `est.${priceNote(model)}` };
}

// What a cost counts for in totals and against the cap: the known figure, else its estimate.
const countedUsd = (cost) => cost.usd ?? cost.est ?? 0;

function buildMembers() {
  const key = (k) => resolveKey(k);
  return {
    openai: {
      label: 'OpenAI',
      ...key('openai'),
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
      ...key('grok'),
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
      ...key('gemini'),
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
      ...key('perplexity'),
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
//   { member, label, model, keySource, note, status: 'ok' | 'failed' | 'skipped', elapsed, review?, error?, usage?, cost }
async function consult(memberKey, member, effort, prompt, skipReason) {
  let cfg = modelFor(memberKey, effort);
  const base = { member: memberKey, label: member.label, model: cfg.model, keySource: member.keySource, note: '', elapsed: '0.0' };
  if (skipReason) return { ...base, status: 'skipped', error: skipReason, cost: { usd: 0, source: 'not sent' } };
  if (!member.key) {
    return { ...base, status: 'failed', error: `no API key: ${member.missing}.`, cost: { usd: 0, source: 'not sent' } };
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
          : { usd: null, est: unfinishedUsd(cfg.model, prompt.length), source: 'unknown: server error, the provider may still bill' },
      };
    }
    const usage = member.usage(res.data);
    return {
      ...base, model: cfg.model, note, status: 'ok', elapsed: elapsed(),
      review: member.parse(res.data), usage, cost: costOf(cfg.model, usage, prompt.length),
    };
  } catch (err) {
    // Aborting only closes our side: the provider may finish generating and bill it, so the cost is unknown.
    const timedOut = err?.name === 'TimeoutError';
    return {
      ...base, model: cfg.model, note, status: 'failed', elapsed: elapsed(),
      error: timedOut ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : `${err?.name || 'Error'}: ${err?.message || err}`,
      cost: { usd: null, est: unfinishedUsd(cfg.model, prompt.length), source: 'unknown: the provider may still bill the abandoned call' },
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
// A cost as shown: the figure, or "~$x" for the estimate of a call whose real cost is unknown.
const fmtCost = (cost) => (cost.usd == null && cost.est != null ? `~${fmtUsd(cost.est)}` : fmtUsd(cost.usd));

function costTable(outcomes) {
  const rows = outcomes.map((o) => {
    const tokens = o.usage ? `${fmtInt(o.usage.input)} in / ${fmtInt(o.usage.output)} out` : '—';
    const key = o.keySource === 'shared' ? ' · shared key' : '';
    return `  ${`${o.label} (${o.model})`.padEnd(38)} ${o.status.padEnd(7)} ${tokens.padEnd(26)} ${fmtCost(o.cost).padStart(9)}  ${o.cost.source}${key} · ${o.elapsed}s`;
  });
  const total = outcomes.reduce((sum, o) => sum + countedUsd(o.cost), 0);
  const estimated = outcomes.some((o) => o.cost.usd == null && o.cost.est != null);
  const totalLine = `  TOTAL ${fmtUsd(total)}${estimated ? ' (counting the "~" estimates for calls whose cost is unknown)' : ''}`;
  return [`  COST (prices as of ${PRICES_AS_OF}; "reported" = the provider's own figure)`, ...rows, totalLine].join('\n');
}

// --- Spend log (UNI-673): one JSON line per run, the record the daily cap and --spend read ---
// A line is a few hundred bytes, written with one O_APPEND write, so parallel workers' lines don't interleave.
const spendLogPath = () => process.env.COUNCIL_SPEND_LOG || SPEND_LOG_DEFAULT;
const utcDay = (date) => date.toISOString().slice(0, 10);

function dailyCapUsd() {
  const raw = process.env.COUNCIL_DAILY_CAP_USD;
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_CAP_USD;
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap < 0) fail(`COUNCIL_DAILY_CAP_USD must be a number of dollars ≥ 0, not "${raw}".`);
  return cap;
}

// Fail before sending anything when the log can't be written: a run that can't be logged can't be capped.
function ensureSpendLogWritable() {
  const path = spendLogPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, '');
  } catch (err) {
    fail(`Can't write the council spend log ${path} (${err.code || err.message}). Nothing was sent. ` +
      'Fix the path or its permissions, or point COUNCIL_SPEND_LOG at a writable file.');
  }
}

function appendSpend(entry) {
  appendFileSync(spendLogPath(), `${JSON.stringify(entry)}\n`);
}

// The log holds three kinds of line, joined by run_id:
//   started      written before any call, with reserved_usd: the run's estimated cost (unfinishedUsd per member)
//   ran          written after the calls, with total_usd: what the run actually cost
//   refused_cap  a run the cap stopped; it cost nothing
// A started line with no ran line is a run still in flight, or one that was killed (a Bash timeout, a closed session)
// after its calls were billed. It counts at its reservation, so neither a killed run nor a parallel one is missed.
// Lines from before run_id existed (ran only) count at their total.
//
// → { entries: the day's lines, malformed, totalUsd, open: the day's started lines with no ran line }
function readSpend(day) {
  const path = spendLogPath();
  const all = [];
  let malformed = 0;
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        malformed++;
        continue;
      }
      if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.ts !== 'string') {
        malformed++;
        continue;
      }
      all.push(e);
    }
  }
  // A run's ran line can fall on the next UTC day (a run across midnight): look for it in the whole log.
  const finished = new Set(all.filter((e) => e.outcome === 'ran' && e.run_id).map((e) => e.run_id));
  const entries = all.filter((e) => e.ts.slice(0, 10) === day);
  const open = entries.filter((e) => e.outcome === 'started' && !finished.has(e.run_id));
  const totalUsd = entries.reduce((sum, e) => sum + entryUsd(e, finished), 0);
  return { entries, malformed, totalUsd, open };
}

const usdField = (v) => (Number.isFinite(v) ? v : 0);
function entryUsd(e, finished) {
  if (e.outcome === 'ran') return usdField(e.total_usd);
  if (e.outcome === 'started') return finished.has(e.run_id) ? 0 : usdField(e.reserved_usd);
  return 0;
}

// Where the run comes from: the issue in the branch name (uni-123-… → UNI-123), the repo, the branch.
function runOrigin() {
  const cwd = process.cwd();
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const root = mainCheckoutRoot(cwd);
  const issue = branch?.match(/\buni-(\d+)\b/i);
  return { issue: issue ? `UNI-${issue[1]}` : null, repo: root ? basename(root) : null, branch };
}

// One member as logged. Before the run (started, refused_cap) only the plan is known: status 'not sent'.
function memberLine(o) {
  return {
    member: o.member,
    model: o.model,
    status: o.status,
    key: o.keySource,
    input_tokens: o.usage?.input ?? null,
    output_tokens: o.usage?.output ?? null,
    usd: o.cost?.usd ?? null,
    usd_estimate: o.cost?.est ?? null,
    usd_source: o.cost?.source ?? null,
  };
}

function spendEntry({ run, outcome, outcomes, reservedUsd }) {
  const entry = {
    v: SPEND_LOG_VERSION,
    ts: new Date().toISOString(),
    run_id: run.id,
    ...run.origin,
    outcome,
    check: run.check,
    effort: run.effort,
    input_chars: run.inputChars,
    members: outcomes.map(memberLine),
    cap_usd: run.capUsd,
    spent_before_usd: Number(run.spentBeforeUsd.toFixed(6)),
    forced: run.forced,
  };
  if (outcome === 'ran') entry.total_usd = Number(outcomes.reduce((sum, o) => sum + countedUsd(o.cost), 0).toFixed(6));
  if (outcome === 'started') entry.reserved_usd = Number(reservedUsd.toFixed(6));
  return entry;
}

function printSpend(day) {
  const capUsd = dailyCapUsd();
  const { entries, malformed, totalUsd, open } = readSpend(day);
  const ran = entries.filter((e) => e.outcome === 'ran');
  const refused = entries.filter((e) => e.outcome === 'refused_cap').length;
  const forced = [...ran, ...open].filter((e) => e.forced?.overrode?.length);
  const byMember = new Map();
  const byIssue = new Map();
  const addIssue = (e, usd) => {
    const issue = e.issue || `(no issue: ${e.branch || 'not a git checkout'})`;
    const row = byIssue.get(issue) || { runs: 0, usd: 0 };
    row.runs++;
    row.usd += usd;
    byIssue.set(issue, row);
  };
  for (const e of ran) {
    for (const m of e.members || []) {
      if (m.status === 'skipped' || m.usd_source === 'not sent') continue;
      const row = byMember.get(m.member) || { calls: 0, usd: 0, shared: 0 };
      row.calls++;
      // usd_upper: the field's name before 2026-11-05.
      row.usd += m.usd ?? m.usd_estimate ?? m.usd_upper ?? 0;
      // 'production': what a shared key was called before 2026-11-05.
      if (m.key === 'shared' || m.key === 'production') row.shared++;
      byMember.set(m.member, row);
    }
    addIssue(e, usdField(e.total_usd));
  }
  for (const e of open) addIssue(e, usdField(e.reserved_usd));
  const pct = capUsd > 0 ? ` (${Math.round((totalUsd / capUsd) * 100)}%)` : '';
  const openUsd = open.reduce((sum, e) => sum + usdField(e.reserved_usd), 0);
  const out = [
    `COUNCIL SPEND · ${day} (UTC) · ${spendLogPath()}`,
    `  Runs: ${ran.length} finished` +
      `${open.length ? ` · ${open.length} unfinished (in flight or killed), counted at their ${fmtUsd(openUsd)} estimate` : ''}` +
      `${refused ? ` · ${refused} refused at the cap` : ''}${forced.length ? ` · ${forced.length} forced` : ''}`,
  ];
  if (byMember.size) {
    out.push('  By member (finished runs):');
    for (const [member, r] of [...byMember].sort((a, b) => b[1].usd - a[1].usd)) {
      const label = MEMBER_LABELS[member] || member;
      out.push(`    ${fmtUsd(r.usd).padStart(9)}  ${String(r.calls).padStart(3)} calls  ${label}` +
        `${r.shared ? `  (${r.shared} on a shared key)` : ''}`);
    }
  }
  if (byIssue.size) {
    out.push('  By issue:');
    for (const [issue, r] of [...byIssue].sort((a, b) => b[1].usd - a[1].usd)) {
      out.push(`    ${fmtUsd(r.usd).padStart(9)}  ${String(r.runs).padStart(3)} runs   ${issue}`);
    }
  }
  if (forced.length) {
    out.push('  Forced:');
    for (const e of forced) {
      out.push(`    ${e.ts.slice(11, 16)}Z ${e.issue || e.branch || '?'} past ${e.forced.overrode.join(' + ')}: ${e.forced.reason}`);
    }
  }
  out.push(`  TOTAL ${fmtUsd(totalUsd)} of the ${fmtUsd(capUsd)} daily cap${pct} (COUNCIL_DAILY_CAP_USD)`);
  if (malformed) out.push(`  WARNING: ${malformed} line(s) in the log aren't valid entries and were skipped.`);
  console.log(out.join('\n'));
}

const MEMBER_LABELS = { openai: 'OpenAI', grok: 'Grok', gemini: 'Gemini', perplexity: 'Perplexity' };

// --- Arguments ---
const VALUE_FLAGS = new Set(['--effort', '--models', '--reason', '--day']);
const BOOL_FLAGS = new Set(['--low', '--medium', '--high', '--check', '--force', '--force-size', '--spend', '--help']);
// A reason is free text and may start with "--"; every other value may not (it would be a forgotten value).
const FREE_TEXT_FLAGS = new Set(['--reason']);
// Exit codes: 1 = an error or a failed review; 3 = refused at the daily cap (nothing sent; carry on without the
// council, SKILL.md "Refused at the daily cap?").
const CAP_REFUSED_EXIT = 3;

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) {
      const next = argv[i + 1];
      // A free-text value may start with "--", but never be one of our flags (`--reason --high` forgot the reason).
      const isFlag = next !== undefined && (VALUE_FLAGS.has(next) || BOOL_FLAGS.has(next));
      if (next === undefined || isFlag || (next.startsWith('--') && !FREE_TEXT_FLAGS.has(a))) fail(`${a} needs a value.`);
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

function fail(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exit(code);
}

const isUtcDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && utcDay(new Date(`${day}T00:00:00Z`)) === day;

// --- Main ---
async function main() {
  const argv = process.argv.slice(2);
  const { flags, values, positional } = parseArgs(argv);

  if (argv.length === 0 || flags.has('--help')) {
    const m = (e) => Object.keys(EFFORT).map(k => `${modelFor(k, e).model}${k === 'gemini' ? '*' : ''}`).join(' + ');
    console.log('Usage: node council.mjs <input-file> [--low|--medium|--high] [--models openai,grok,perplexity,gemini]');
    console.log('                        [--force --reason "<why>"] [--force-size --reason "<why>"]');
    console.log('       node council.mjs --check [--low|--medium|--high]');
    console.log('       node council.mjs --spend [--day YYYY-MM-DD]');
    console.log('');
    console.log(`  low    → ${m('low')}`);
    console.log(`  medium → ${m('medium')}  (default)`);
    console.log(`  high   → ${m('high')}  (first round on key work, or after a REJECT)`);
    console.log(`  Members: ${DEFAULT_MEMBERS.join(', ')}; * gemini only with COUNCIL_GEMINI_API_KEY.`);
    console.log('');
    console.log(`  A run is refused (exit ${CAP_REFUSED_EXIT}) once today's (UTC) council spend reaches COUNCIL_DAILY_CAP_USD ` +
      `(now ${fmtUsd(dailyCapUsd())}); --force --reason "<why>" runs anyway.`);
    console.log(`  Input over ${fmtInt(INPUT_CHAR_CAP)} chars is refused; --force-size --reason "<why>" sends it anyway. ` +
      `Grok is skipped over ${fmtInt(GROK_MAX_INPUT_CHARS)}.`);
    console.log('  Every run, and every reason, goes in the spend log.');
    process.exit(0);
  }

  if (flags.has('--spend')) {
    if (positional.length || [...flags].some((f) => f !== '--spend') || Object.keys(values).some((v) => v !== '--day')) {
      fail('--spend takes only --day YYYY-MM-DD.');
    }
    const day = values['--day'] ?? utcDay(new Date());
    if (!isUtcDay(day)) fail(`--day must be a real date like 2026-11-05, not "${day}".`);
    printSpend(day);
    return;
  }
  if (values['--day'] !== undefined) fail('--day goes with --spend.');

  // Two overrides, each named on its own, so lifting one cap never lifts the other by accident.
  const forceCap = flags.has('--force');
  const forceSize = flags.has('--force-size');
  const reason = values['--reason']?.trim();
  if ((forceCap || forceSize) && !reason) {
    fail(`${forceCap ? '--force' : '--force-size'} needs --reason "<why>"; the reason goes in the spend log.`);
  }
  if (!forceCap && !forceSize && values['--reason'] !== undefined) fail('--reason goes with --force or --force-size.');

  const levels = ['--low', '--medium', '--high'].filter(f => flags.has(f));
  if (levels.length > 1 || (levels.length && values['--effort'])) fail('Give one effort level.');
  let effort = values['--effort'] !== undefined ? values['--effort'].toLowerCase() : (levels[0]?.slice(2) || 'medium');
  if (!['low', 'medium', 'high'].includes(effort)) fail(`Invalid effort level "${effort}". Use low, medium, or high.`);

  const MEMBERS = buildMembers();
  // Gemini joins the default council only on its own key (UNI-673).
  let selected = [...DEFAULT_MEMBERS, ...(MEMBERS.gemini.key ? ['gemini'] : [])];
  if (values['--models'] !== undefined) {
    selected = [...new Set(values['--models'].split(',').map(m => m.trim().toLowerCase()).filter(Boolean))];
    const unknown = selected.filter(m => !MEMBERS[m]);
    if (unknown.length || !selected.length) {
      fail(`Unknown member(s): ${unknown.join(', ') || '(none given)'}. Choose from ${Object.keys(MEMBERS).join(', ')}.`);
    }
    if (selected.includes('gemini') && !MEMBERS.gemini.key) {
      fail(`Gemini runs only on the council's own key (${MEMBERS.gemini.missing}, in ~/.ul-dispatch/council.env). ` +
        "Production's GEMINI_API_KEY serves the /aeo engine and is never used. Nothing was sent.");
    }
  }

  const check = flags.has('--check');
  const overrode = [];
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
    if (inputChars > INPUT_CHAR_CAP) {
      if (!forceSize) {
        fail(`Input is ${fmtInt(inputChars)} chars, over the ${fmtInt(INPUT_CHAR_CAP)}-char cap. Trim it to the diff and the ` +
          'relevant excerpts (on a re-check: only what changed, plus the previous REVISE points). ' +
          '--force-size --reason "<why>" sends it anyway.');
      }
      overrode.push('input_cap');
    }
    prompt = `${SYSTEM_CONTEXT}\n\n---\n\nHere is the content to review:\n\n${input}`;
  }

  // Grok times out on big inputs and xAI bills the abandoned generation, so don't send it (SKILL.md).
  const skipReason = (k) => (k === 'grok' && inputChars > GROK_MAX_INPUT_CHARS
    ? `input too large for Grok (${fmtInt(inputChars)} > ${fmtInt(GROK_MAX_INPUT_CHARS)} chars)`
    : null);

  // Don't pay for calls that can't make a valid review: fail before sending anything.
  const needed = check ? selected.length : Math.min(MIN_RESPONSES, selected.length);
  const toSend = selected.filter(k => !skipReason(k) && MEMBERS[k].key);
  if (toSend.length < needed) {
    const why = selected.filter(k => !toSend.includes(k))
      .map(k => `${MEMBERS[k].label}: ${skipReason(k) || `no API key: ${MEMBERS[k].missing}`}`);
    fail(`Only ${toSend.length} member(s) would be sent (${why.join('; ')}), and a review needs ${needed}. ` +
      'Add members with --models, set the missing keys, or trim the input. Nothing was sent.');
  }

  // The daily cap, from the spend log (UNI-673): finished runs at their cost, unfinished ones (in flight in another
  // session, or killed) at their reservation. Cooperative: two runs that read the log in the same instant both pass.
  const capUsd = dailyCapUsd();
  ensureSpendLogWritable();
  const today = utcDay(new Date());
  const spend = readSpend(today);
  const planned = toSend.map((k) => {
    const model = modelFor(k, effort).model;
    return { member: k, label: MEMBERS[k].label, model, keySource: MEMBERS[k].keySource, status: 'not sent',
      cost: { usd: null, est: unfinishedUsd(model, prompt.length), source: 'not sent' } };
  });
  const run = {
    id: randomUUID(), origin: runOrigin(), check, effort, inputChars, capUsd, spentBeforeUsd: spend.totalUsd,
    forced: forceCap || forceSize ? { reason, flags: [forceCap && '--force', forceSize && '--force-size'].filter(Boolean), overrode } : null,
  };
  const log = (outcome, outcomes, reservedUsd = 0) => appendSpend(spendEntry({ run, outcome, outcomes, reservedUsd }));
  if (spend.totalUsd >= capUsd) {
    if (!forceCap) {
      try {
        log('refused_cap', planned);
      } catch (err) {
        // The refusal stands either way (nothing is sent); only its log line is lost.
        console.error(`WARNING: the refusal wasn't logged to ${spendLogPath()} (${err.code || err.message}).`);
      }
      fail(`The council's daily cap is reached: ${fmtUsd(spend.totalUsd)} spent today (${today} UTC) of the ` +
        `${fmtUsd(capUsd)} cap (COUNCIL_DAILY_CAP_USD)${spend.open.length ? `, counting ${spend.open.length} unfinished run(s) at their estimate` : ''}. ` +
        'Nothing was sent. See today\'s runs with `node council.mjs --spend`. ' +
        'To run anyway: --force --reason "<why>" (the reason is logged).', CAP_REFUSED_EXIT);
    }
    overrode.push('daily_cap');
  }
  // Reserve before any call: if this process is killed after the providers bill it, the line still counts.
  const reservedUsd = planned.reduce((sum, p) => sum + p.cost.est, 0);
  log('started', planned, reservedUsd);

  const sharedKeys = toSend.filter(k => MEMBERS[k].keySource === 'shared');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${check ? 'COUNCIL CHECK' : 'CONSULTING THE COUNCIL'} · effort ${effort.toUpperCase()}`);
  console.log(`  Members: ${selected.map(k => `${MEMBERS[k].label} (${skipReason(k) ? 'SKIPPED' : modelFor(k, effort).model})`).join(', ')}`);
  if (!check) console.log(`  Input: ${fmtInt(inputChars)} chars (cap ${fmtInt(INPUT_CHAR_CAP)}; Grok skipped over ${fmtInt(GROK_MAX_INPUT_CHARS)})`);
  console.log(`  Spent today: ${fmtUsd(spend.totalUsd)} of the ${fmtUsd(capUsd)} daily cap · log ${spendLogPath()}`);
  if (spend.malformed) console.log(`  WARNING: ${spend.malformed} line(s) in the spend log aren't valid entries and aren't counted.`);
  if (sharedKeys.length) {
    console.log(`  Shared key (not the council's own): ${sharedKeys.map(k => `${MEMBERS[k].label} (${KEYS[k].shared.find(n => process.env[n] === MEMBERS[k].key)})`).join(', ')}. ` +
      `Set ${sharedKeys.map(k => KEYS[k].council).join(', ')} in ~/.ul-dispatch/council.env to keep the council off keys others rely on.`);
  }
  for (const k of toSend.filter((m) => !isPriced(modelFor(m, effort).model))) {
    console.log(`  WARNING: ${modelFor(k, effort).model} has no price in PRICES; its cost is counted at the dearest listed price.`);
  }
  if (overrode.includes('input_cap')) {
    console.log(`  WARNING: --force-size: sending ${fmtInt(inputChars)} chars, over the ${fmtInt(INPUT_CHAR_CAP)}-char cap. ` +
      `Expect slow, costly answers and timeouts. Reason (logged): ${reason}`);
  }
  if (overrode.includes('daily_cap')) {
    console.log(`  WARNING: --force: over the daily cap. Reason (logged): ${reason}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  const outcomes = await Promise.all(selected.map(k => consult(k, MEMBERS[k], effort, prompt, skipReason(k))));
  try {
    log('ran', outcomes);
  } catch (err) {
    // ensureSpendLogWritable passed a moment ago, so this is rare. The started line still counts this run at its
    // reservation; say so, since its real cost is lost.
    console.error(`ERROR: this run's cost wasn't logged to ${spendLogPath()} (${err.code || err.message}); ` +
      `the cap counts it at its ${fmtUsd(reservedUsd)} reservation instead.`);
    process.exitCode = 1;
  }

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
    `${sent < outcomes.length ? ` (${outcomes.length - sent} skipped)` : ''}\n${costTable(outcomes)}\n` +
    `  TODAY ${fmtUsd(spend.totalUsd + outcomes.reduce((sum, o) => sum + countedUsd(o.cost), 0))} of the ` +
    `${fmtUsd(capUsd)} daily cap (UTC day; node council.mjs --spend for the breakdown)\n${'='.repeat(60)}\n`;
  console.log(output);

  // A review needs at least two independent opinions; a check needs every selected member.
  if (responded < needed) process.exit(1);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
