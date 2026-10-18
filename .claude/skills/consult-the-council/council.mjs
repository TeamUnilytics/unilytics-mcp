#!/usr/bin/env node

/**
 * Consult the Council — Hit multiple frontier models in parallel for cross-model review.
 *
 * Usage: node council.mjs <input-file> [--models openai,grok,gemini,perplexity] [--effort low|medium|high]
 *        node council.mjs --check [--effort …]   (one tiny call per member: confirms keys + model ids)
 *
 * Reads a problem/spec from <input-file>, sends it to every council member,
 * collects their feedback, and writes structured output to stdout.
 *
 * Effort levels:
 *   low    — fast, cheap. Quick sanity check.
 *   medium — balanced. Good for most reviews.
 *   high   — max reasoning. Use for critical specs/architecture (the default).
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
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function consult(memberKey, member, effort, prompt) {
  if (!member.key) throw new Error(`${member.label}: no API key (set ${member.keyName}).`);
  const startTime = Date.now();
  let cfg = modelFor(memberKey, effort);
  let note = '';
  let res = await post(member, cfg, prompt);

  if (!res.ok && member.fallback && isQuotaError(res.status, res.data) && cfg.model !== member.fallback.model) {
    note = ` — FALLBACK: ${cfg.model} is out of quota (needs a billed project)`;
    cfg = member.fallback;
    res = await post(member, cfg, prompt);
  }
  if (!res.ok) {
    const hint = isQuotaError(res.status, res.data) ? ' — out of credit/quota: top up the provider account' : '';
    throw new Error(`${member.label} (${cfg.model}) HTTP ${res.status}${hint}: ${JSON.stringify(res.data.error || res.data).slice(0, 300)}`);
  }
  return {
    name: `${member.label} (${cfg.model}${note})`,
    elapsed: ((Date.now() - startTime) / 1000).toFixed(1),
    review: member.parse(res.data),
  };
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const members = (effort) => buildMembers(effort);

  if (args.length === 0 || args.includes('--help')) {
    const m = (e) => Object.keys(EFFORT).map(k => modelFor(k, e).model).join(' + ');
    console.log('Usage: node council.mjs <input-file> [--models openai,grok,gemini,perplexity] [--effort low|medium|high]');
    console.log('       node council.mjs --check [--effort low|medium|high]');
    console.log('');
    console.log(`  low    → ${m('low')}`);
    console.log(`  medium → ${m('medium')}`);
    console.log(`  high   → ${m('high')}  (default)`);
    process.exit(0);
  }

  let effort = 'high';
  const effortIdx = args.indexOf('--effort');
  if (effortIdx !== -1 && args[effortIdx + 1]) effort = args[effortIdx + 1].toLowerCase();
  if (args.includes('--low')) effort = 'low';
  if (args.includes('--medium')) effort = 'medium';
  if (args.includes('--high')) effort = 'high';
  if (!['low', 'medium', 'high'].includes(effort)) {
    console.error(`Error: Invalid effort level "${effort}". Use low, medium, or high.`);
    process.exit(1);
  }

  const MEMBERS = members(effort);
  let selected = Object.keys(MEMBERS);
  const modelsIdx = args.indexOf('--models');
  if (modelsIdx !== -1 && args[modelsIdx + 1]) {
    selected = args[modelsIdx + 1].split(',').map(m => m.trim().toLowerCase());
    const unknown = selected.filter(m => !MEMBERS[m]);
    if (unknown.length) {
      console.error(`Error: Unknown member(s): ${unknown.join(', ')}. Choose from ${Object.keys(MEMBERS).join(', ')}.`);
      process.exit(1);
    }
  }

  const check = args.includes('--check');
  let prompt;
  if (check) {
    prompt = 'Reply with the single word: ok';
  } else {
    const inputFile = args[0];
    if (!existsSync(inputFile)) {
      console.error(`Error: Input file not found: ${inputFile}`);
      process.exit(1);
    }
    const input = readFileSync(inputFile, 'utf-8');
    if (!input.trim()) {
      console.error('Error: Input file is empty');
      process.exit(1);
    }
    prompt = `${SYSTEM_CONTEXT}\n\n---\n\nHere is the content to review:\n\n${input}`;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${check ? 'COUNCIL CHECK' : 'CONSULTING THE COUNCIL'} · effort ${effort.toUpperCase()}`);
  console.log(`  Members: ${selected.map(k => `${MEMBERS[k].label} (${modelFor(k, effort).model})`).join(', ')}`);
  if (!check) console.log(`  Input: ${prompt.length} chars`);
  console.log(`${'='.repeat(60)}\n`);

  const results = await Promise.allSettled(selected.map(k => consult(k, MEMBERS[k], effort, prompt)));

  let output = '';
  for (const result of results) {
    output += `\n${'─'.repeat(60)}\n`;
    if (result.status === 'fulfilled') {
      const { name, elapsed, review } = result.value;
      output += `## ${name} (${elapsed}s)\n${'─'.repeat(60)}\n\n${check ? review.trim().slice(0, 40) : review}\n`;
    } else {
      output += `## FAILED\n${'─'.repeat(60)}\n\n${result.reason.message}\n`;
    }
  }

  const responded = results.filter(r => r.status === 'fulfilled').length;
  output += `\n${'='.repeat(60)}\n  ${responded}/${results.length} members responded\n${'='.repeat(60)}\n`;
  console.log(output);

  // A review needs at least two independent opinions; a check needs every selected member.
  const needed = check ? results.length : Math.min(MIN_RESPONSES, results.length);
  if (responded < needed) process.exit(1);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
