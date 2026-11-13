---
name: consult-the-council
description: "Send the current spec, plan, diff or bug to OpenAI, Grok and Perplexity (plus Gemini on its own key) for an independent, production-bar review, with a spend log and a daily cap. Required by /work-on before building important work (security, billing, data model, contracts, one-way doors); also use when stuck."
argument-hint: "[optional: path or keyword] [--low|--medium|--high] [--force|--force-size --reason \"<why>\"] [--check] [--spend]"
---

# Consult the Council

Sends the current problem, spec, implementation plan or diff to three frontier models from different labs (four
when Gemini has its own key), in parallel. Each reviews it independently against a production bar: band-aids,
security, tenant isolation, data integrity, best practice and how leading products solve it. Each returns issues,
suggestions and a verdict (APPROVE / REVISE / REJECT).

## The Council (model ids verified against the live model lists on 2026-10-18)

| Member | Low | Medium (default) | High |
|---|---|---|---|
| **OpenAI** | `gpt-6.1-sol`, effort low | `gpt-6.1-sol`, effort medium | `gpt-6-astra`, effort high |
| **Grok** (xAI) | `grok-4.7` | `grok-4.7` | `grok-4.7` |
| **Perplexity** (web-grounded) | `sonar-pro` | `sonar-reasoning-pro` | `sonar-reasoning-pro` |
| **Gemini** (Google), only with `COUNCIL_GEMINI_API_KEY` | `gemini-flash-latest`, thinking low | `gemini-flash-latest`, thinking high | `gemini-3.1-pro-preview`, thinking high |

- **Gemini is off unless it has its own key** (UNI-673). Production's `GEMINI_API_KEY` serves the /aeo engine. On
  2026-11-04/05 about 20 workers ran 2–4 rounds each with Gemini 3.1 Pro at medium, and a $20 top-up ran out
  overnight (402 `RESOURCE_EXHAUSTED`). With `COUNCIL_GEMINI_API_KEY` set (a separate key), Gemini joins every run,
  on Flash except at `--high`. Without it, `--models gemini` stops before anything is sent. A
  `COUNCIL_GEMINI_API_KEY` with the same value as the local `GEMINI_API_KEY` is refused too (see "Keys").
- **Gemini Pro needs a billed Gemini project.** On a quota error the run falls back to `gemini-flash-latest` and
  labels it `FALLBACK` in the output, so you always know which model answered.
- **Out of credit** shows as `FAILED … out of credit/quota`. Until the council has keys of its own (see "Keys"),
  Grok and Perplexity run on the Lambda's own keys, so a drained key takes production's calls down too (UNI-325).
  Every run says which members used a shared key. Top up at once.
- **Grok is skipped on inputs over 10,000 characters** (`SKIPPED: input too large for Grok`), counting the input
  file only. Our 5-minute abort closes only our side: xAI finishes the answer and bills it. The evidence, from 40
  issues' `Council:` lines up to 2026-11-01:
  - Every run that recorded its size timed Grok out: 9k, 12k, 18k, ~30k, 33k, 40k, 54k and 105k characters
    (UNI-122, UNI-128, UNI-168, UNI-268, UNI-28).
  - Runs where Grok answered never recorded a size. Most were plan rounds, which are short: plan rounds answered
    about 19 times in 34, diff rounds about 2 in 27.
  - The first answer with a recorded size: a 6,950-character plan round at `--medium` (UNI-345, 2026-11-01).
    Grok answered in 142 s, against 15–23 s for the other three, so it is slow even when it answers.
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
the relevant excerpts. `--force-size --reason "<why>"` sends it anyway, with a warning and the reason in the spend log:
use it only when the excerpt truly can't be cut. Under 10,000 characters Grok answers too.

### 2. Run it

```bash
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md --high     # first round, key work
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md            # medium (default)
node .claude/skills/consult-the-council/council.mjs <scratchpad>/council-input.md --models openai,perplexity
node .claude/skills/consult-the-council/council.mjs --check                                  # keys + model ids
node .claude/skills/consult-the-council/council.mjs --spend                                  # today's spend, no calls
```

High effort can take a few minutes, so give the Bash call a long timeout (up to 600000 ms).

The script keeps no copy of its output. Redirect it to a file in your scratchpad (`… > <scratchpad>/council-r1.out
2>&1`) and read that, never `| tail -N`: UNI-934 lost a member's whole Issues section to a tail and couldn't get it
back without paying for the run again.

**Refused at the daily cap?** The run says so, sends nothing and exits 3. Don't work around it: say in the WORKLOG that the
council was skipped because of the cap, and go on with a fresh-context review. Only work that truly can't wait
(security, billing or a migration about to merge) uses `--force --reason "<issue: why it can't wait>"`.

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

Each member reads the council's own key first, then a shared key from a repo `.env` where it has one. A
production-only key is never read (UNI-673):

| Member | Council key (read first) | Shared key (fallback) | Never read | Is the fallback production's? (UNI-325 fingerprints, 2026-11-01) |
|---|---|---|---|---|
| OpenAI | `COUNCIL_OPENAI_API_KEY` | `OPENAI_API_KEY` | `api_key2` (the Lambda's) | No: the "Personal" org's key, not the Lambda's |
| Grok | `COUNCIL_GROK_API_KEY` | `XAI_API_KEY` | | Yes: the Lambda's own (the /aeo engine) |
| Perplexity | `COUNCIL_PERPLEXITY_API_KEY` | `PERPLEXITY_API_KEY`, then `Perplexity_api` | | Yes: the Lambda's own (AI citation check, research, /aeo) |
| Gemini | `COUNCIL_GEMINI_API_KEY` | none: Gemini doesn't run | `GEMINI_API_KEY` (the /aeo engine's) | |

That column describes ul-langgraph's `.env`. In ul-backend, ul-frontend and the other repos the council first
reads that repo's own `.env`, so a shared key there may be that repo's production key.

- Once a council key is set, no shared key for that member is read.
- A council key holding the value of a never-read key (`api_key2`, `GEMINI_API_KEY`) is refused. One holding a
  shared key's value counts as that shared key. Both checks see only the `.env` files loaded here, so a production
  key copied in from elsewhere (the Lambda's environment) isn't caught: make each council key new, in its own
  project.
- Until xAI and Perplexity have council keys, they run on the Lambda's keys, and only the daily cap limits what
  the council can take from production's credit.
- Every run prints `Shared key (not the council's own): …` for the members on a fallback, and the spend log
  records `key: council | shared` per member.
- **Put council keys in `~/.ul-dispatch/council.env`** (one `NAME=value` per line, `chmod 600`).
  `~/dev/ul-langgraph/tools/dispatch/council-key <member>` saves one from a hidden prompt (Terminal.app), and
  `council-key --list` shows which are set. Never put them in ul-langgraph's `.env`: its Settings refuse unknown
  variables, so a `COUNCIL_…` line there breaks production's config and every test run. Making the keys is the
  founder's step: a separate project or key per provider, with its own budget.

The script loads each variable from the first place that has it:
1. The process environment.
2. `$COUNCIL_ENV_FILE`, default `~/.ul-dispatch/council.env`.
3. This checkout's `.env`.
4. The **main checkout's** `.env` (worktrees have no `.env` of their own).
5. `~/dev/ul-langgraph/.env`.

## Spend log and daily cap (UNI-673)

- **Every run is logged** in `~/.ul-dispatch/council-spend.jsonl` (`COUNCIL_SPEND_LOG` overrides it), one JSON
  line per event, joined by `run_id`:
  - `started`, before any call: the members and models about to be sent and `reserved_usd`, the run's estimated
    cost (see "Cost");
  - `ran`, after the calls: per member the model, status, key (council or shared), tokens in and out, USD and
    where the USD came from, and the run's `total_usd`;
  - `refused_cap`, for a run the cap stopped: the members and models it would have sent, all `not sent`.
  Every line also holds the time, issue (from the branch name `uni-123-…`), repo, branch, effort, input size, the
  cap, today's spend before the run and `forced: {reason, flags, overrode}`. If the log can't be written, the run
  stops before sending anything.
- **A run that never finishes still counts.** A `started` line with no `ran` line is a run in flight in another
  session, or one that was killed (a Bash tool timeout, a closed session) after the providers billed it. The cap
  and `--spend` count it at its reservation.
- **Daily cap:** `COUNCIL_DAILY_CAP_USD` (default `10`, dollars per **UTC** day, so it resets at 05:30 IST). Set it
  in `council.env`. Before each run, today's total (finished runs at their cost, unfinished ones at their
  reservation) is compared with the cap. At or over it, the run is refused: it sends nothing, logs a
  `refused_cap` line and exits **3**, not 1, so a refusal is told apart from a failed review. `--force --reason
  "<why>"` runs anyway; the reason is logged, and the dispatcher reads it. `0` turns the council off.
- **Two separate overrides.** `--force` lifts only the daily cap; `--force-size` lifts only the 30,000-character
  input cap. Each needs `--reason`, so one reason never covers the other cap by accident.
- **It's a cooperative cap.** Two runs that read the log at the same instant can both pass. Runs already in flight
  are counted, through their reservations. The provider's own budget on a council key is the hard limit.
- **`node council.mjs --spend [--day YYYY-MM-DD]`** prints a day's total by member and by issue, against the cap,
  with unfinished, refused and forced runs (each forced run's reason too). It makes no calls. The dispatcher
  quotes it at wind-up.

## Cost

The council was our biggest LLM spend (2026-11-01): many `--high` rounds of 25–80k characters each.
- **Every run ends with a cost table:** tokens in and out per member, $, and a total, then `TODAY` against the
  cap. xAI and Perplexity report their own charge (`reported`). OpenAI and Gemini are estimated from the price
  table at the top of `council.mjs` (`est.`), dated by `PRICES_AS_OF`.
- **A model missing from the price table** (a `COUNCIL_MODEL_*` override, a moved alias) is counted at the
  dearest listed price, never $0, and the run prints a WARNING. Add its price to `PRICES`.
- **A timed-out member (or a 5xx) shows its cost as an estimate, `~$x`.** The provider may still bill the
  abandoned call. The estimate is the whole prompt plus a 16,000-token answer at the model's price. It isn't a hard
  bound: no request caps its output, since a cap would cut reasoning reviews short. The same estimate, summed over
  the members, is a run's reservation (about $0.50 for a small `--low` run, more at `--high`), and it counts toward
  the cap.
- **`--high` costs the most:** `gpt-6-astra` is 5× the price of `gpt-6.1-sol`. That's why it runs once per
  issue, on the first round of key work.
- **Changing level between rounds costs nothing extra.** Each round is an independent call.
- **Size drives cost.** Every member reads the whole input, so trim it: the 30k cap and the Grok skip enforce this.
- Check the provider dashboards for actual spend.
