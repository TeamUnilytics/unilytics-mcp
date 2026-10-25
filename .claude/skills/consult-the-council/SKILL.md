---
name: consult-the-council
description: "Send the current spec, plan, diff or bug to OpenAI, Grok, Gemini and Perplexity for an independent, production-bar review. Required by /work-on before building important work (security, billing, data model, contracts, one-way doors); also use when stuck."
argument-hint: "[optional: path or keyword] [--low|--medium|--high] [--check]"
---

# Consult the Council

Sends the current problem, spec, implementation plan or diff to four frontier models from different labs, in
parallel. Each reviews it independently against a production bar: band-aids, security, tenant isolation, data
integrity, best practice and how leading products solve it. Each returns issues, suggestions and a verdict
(APPROVE / REVISE / REJECT).

## The Council (model ids verified against the live model lists on 2026-10-18)

| Member | Low | Medium | High (default) |
|---|---|---|---|
| **OpenAI** | `gpt-6.1-sol`, effort low | `gpt-6.1-sol`, effort medium | `gpt-6-astra`, effort high |
| **Grok** (xAI) | `grok-4.7` | `grok-4.7` | `grok-4.7` |
| **Gemini** (Google) | `gemini-flash-latest` | `gemini-3.1-pro-preview`, thinking low | `gemini-3.1-pro-preview`, thinking high |
| **Perplexity** (web-grounded) | `sonar-pro` | `sonar-reasoning-pro` | `sonar-reasoning-pro` |

- **Gemini Pro needs a billed Gemini project.** On a quota error the run falls back to `gemini-flash-latest` and
  labels it `FALLBACK` in the output, so you always know which model answered. The key in use was on the free
  quota on 2026-10-18 (tied to the GCP billing issue, UNI-69).
- **Perplexity was out of credit on 2026-10-18.** Its section shows `FAILED … out of credit`. Top up at
  console.perplexity.ai.
- **Grok and Gemini often drop out (2026-10-24/25).** Grok times out, or returns only its intro line, on large
  inputs; Gemini hit 429 (out of quota). Several reviews ran on OpenAI + Perplexity alone. Keep the input short
  (the diff and the decision, not whole files), and say in the WORKLOG which members answered (UNI-127, UNI-165).
- **A review counts with at least 2 responses.** The script exits 1 below that.
- **Updating models:** set `COUNCIL_MODEL_<MEMBER>` (e.g. `COUNCIL_MODEL_OPENAI=gpt-6.1-sol`) to override one
  member, or edit `EFFORT` in `council.mjs`. Then run `--check`.

## When it is required (from `/work-on` step 6)

Run `--high` on the plan **before the human approves it** whenever the work touches any of:
- security, auth or tenant isolation;
- credits, billing or payments;
- a data model, schema or migration;
- a cross-repo contract (REST shape, MCP tool signature);
- anything public or hard to undo;
- architecture choices;
- any Urgent or High feature.

For security, billing and migrations, run it again on the final diff before merging. Use it any time you're
stuck, too.

## Steps

### 1. Prepare the input

Write the context to `council-input.md` in your session's scratchpad directory (or a `mktemp -d` folder),
never inside the repo: `.claude/tmp/` isn't gitignored. If `$ARGUMENTS` names a file, use that file. Include:
- the problem and the user outcome (from the issue);
- the approach chosen, why, and the alternatives you rejected;
- your `Research:` findings (what others do, links);
- the relevant code, schema or diff;
- what you want reviewed.

The models see only this file, so make it stand alone. Never include secrets, customer data or client names
that aren't needed. Source can hold secrets too: `mcp_server/auth.py` embeds a fallback Mongo URI with a
password until UNI-10 lands, so redact it before pasting that file (UNI-169).

### 2. Run it

```bash
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md            # high (default)
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md --medium   # day-to-day
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md --models openai,grok
node .claude/skills/consult-the-council/council.mjs --check                                  # keys + model ids
```

High effort can take a few minutes, so give the Bash call a long timeout (up to 600000 ms).

### 3. Act on the feedback

For each point:
- **Valid** → fix it and say how.
- **False positive** → explain why the original is correct.
- **Worth adopting** → fold it in.

Points raised by two or more members are very likely real.

### 4. Report

Write a `Council:` line in the plan you show the human and in the WORKLOG:
- the members that answered (with any `FALLBACK`);
- each verdict;
- the deduplicated issues;
- what you changed or rejected, and why.

The outcome decides what happens next:
- All APPROVE → proceed.
- Any REVISE → fix the issues, then re-run if the change was significant.
- Any REJECT → stop and discuss with the human before building.

## Keys

The script loads keys from the first place that has each one:
1. The process environment.
2. This checkout's `.env`.
3. The **main checkout's** `.env` (worktrees have no `.env` of their own).
4. `$COUNCIL_ENV_FILE`.
5. `~/dev/ul-langgraph/.env`.

```
OPENAI_API_KEY=…
XAI_API_KEY=…
GEMINI_API_KEY=…        # in ul-langgraph's .env; the other repos fall back to it
PERPLEXITY_API_KEY=…
```

## Cost

High effort is the expensive setting: `gpt-6-astra` at high effort and Gemini Pro at high thinking. That's still
cheap next to a wrong schema or a security hole reaching production. Use `--medium` for routine reviews and
`--low` for quick sanity checks. Check provider dashboards for actual spend.
