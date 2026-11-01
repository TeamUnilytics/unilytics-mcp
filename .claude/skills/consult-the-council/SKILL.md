---
name: consult-the-council
description: "Send the current spec, plan, diff or bug to OpenAI, Grok, Gemini and Perplexity for an independent, production-bar review. Required by /work-on before building important work (security, billing, data model, contracts, one-way doors); also use when stuck."
argument-hint: "[optional: path or keyword] [--low|--medium|--high] [--force] [--check]"
---

# Consult the Council

Sends the current problem, spec, implementation plan or diff to four frontier models from different labs, in
parallel. Each reviews it independently against a production bar: band-aids, security, tenant isolation, data
integrity, best practice and how leading products solve it. Each returns issues, suggestions and a verdict
(APPROVE / REVISE / REJECT).

## The Council (model ids verified against the live model lists on 2026-10-18)

| Member | Low | Medium (default) | High |
|---|---|---|---|
| **OpenAI** | `gpt-6.1-sol`, effort low | `gpt-6.1-sol`, effort medium | `gpt-6-astra`, effort high |
| **Grok** (xAI) | `grok-4.7` | `grok-4.7` | `grok-4.7` |
| **Gemini** (Google) | `gemini-flash-latest` | `gemini-3.1-pro-preview`, thinking low | `gemini-3.1-pro-preview`, thinking high |
| **Perplexity** (web-grounded) | `sonar-pro` | `sonar-reasoning-pro` | `sonar-reasoning-pro` |

- **Gemini Pro needs a billed Gemini project.** On a quota error the run falls back to `gemini-flash-latest` and
  labels it `FALLBACK` in the output, so you always know which model answered.
- **Out of credit** shows as `FAILED … out of credit/quota`. The council shares production's xAI, Gemini and
  Perplexity keys, so a drained key takes production's calls down too (UNI-325). Top up at once.
- **Grok is skipped on inputs over 10,000 characters** (`SKIPPED: input too large for Grok`), counting the input
  file only. Our 5-minute abort closes only our side: xAI finishes the answer and bills it. The evidence, from 40
  issues' `Council:` lines up to 2026-11-01:
  - Every run that recorded its size timed Grok out: 9k, 12k, 18k, ~30k, 33k, 40k, 54k and 105k characters
    (UNI-122, UNI-128, UNI-168, UNI-268, UNI-28).
  - Runs where Grok answered never recorded a size. Most were plan rounds, which are short: plan rounds answered
    about 19 times in 34, diff rounds about 2 in 27.
  - So 10k is a judgement call, not a measured cut-off (one 9k run still failed). The output now prints the input
    size and Grok's time on every run: when the WORKLOGs show a better number, change `GROK_MAX_INPUT_CHARS`.
- **A review counts with at least 2 responses.** The script exits 1 below that. Say in the WORKLOG which members
  answered.
- **Updating models:** set `COUNCIL_MODEL_<MEMBER>` (e.g. `COUNCIL_MODEL_OPENAI=gpt-6.1-sol`) to override one
  member, or edit `EFFORT` in `council.mjs`. Add the new model's price to `PRICES` (and bump `PRICES_AS_OF`), then
  run `--check`.

## When it is required, and at which level (from `/work-on` step 6)

**Key work** gets the council on the plan, **before the human approves it**. Key work is any of:
- a key feature (core product: Context Manager, skills, MCP, onboarding or sign-in);
- security, auth or tenant isolation;
- credits, billing or payments;
- a data model, schema or migration;
- a cross-repo contract (REST shape, MCP tool signature);
- anything public, hard to undo, or an architecture choice.

Levels by round:
- **First round: `--high`** on key work.
- **Every later round: `--medium`.** That covers the re-check after REVISE fixes and the diff review. Send only
  what changed, plus the previous round's REVISE points.
- **`--high` again only if the previous round returned REJECT.**
- **At most 3 rounds per issue.** A 4th needs the founder's OK in the terminal.
- **Other work:** `--medium` once, or no council.

For security, billing and migrations, one of the 3 rounds is the final diff, before merging. Use it any time
you're stuck, too (`--medium`).

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
that aren't needed. When the input summarises a longer doc, say so and say where the sources live ("every figure
has a primary source in the doc's §8"); otherwise a member flags "unsourced precision" that is an artefact of the
summary, not a real gap (UNI-265). Source can hold secrets too: ul-langgraph's `mcp_server/auth.py` embeds a
fallback Mongo URI with a password until UNI-10 lands, so redact it before pasting that file (UNI-169).

**Keep it under 30,000 characters.** The script refuses anything longer and tells you to trim it to the diff and
the relevant excerpts. `--force` sends it anyway, with a warning: use it only when the excerpt truly can't be
cut. Under 10,000 characters Grok answers too.

### 2. Run it

```bash
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md --high     # first round, key work
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md            # medium (default)
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md --models openai,gemini
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
- the round and level (`r1 --high`, `r2 --medium`);
- the members that answered (with any `FALLBACK` or `SKIPPED`);
- each verdict;
- the deduplicated issues;
- what you changed or rejected, and why;
- the run's `TOTAL` from the cost table.

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

The council was our biggest LLM spend (2026-11-01): many `--high` rounds of 25–80k characters each.
- **Every run ends with a cost table:** tokens in and out per member, $, and a total. xAI and Perplexity report
  their own charge (`reported`). OpenAI and Gemini are estimated from the price table at the top of
  `council.mjs` (`est.`), dated by `PRICES_AS_OF`. A model missing from the table shows `$?`: add it.
- **A timed-out member shows its cost as unknown.** The provider may still bill the abandoned call.
- **`--high` costs the most:** `gpt-6-astra` is 5× the price of `gpt-6.1-sol`. That's why it runs once per
  issue, on the first round of key work.
- **Changing level between rounds costs nothing extra.** Each round is an independent call.
- **Size drives cost.** Every member reads the whole input, so trim it: the 30k cap and the Grok skip enforce this.
- Check the provider dashboards for actual spend.
