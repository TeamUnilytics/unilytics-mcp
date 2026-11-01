---
name: work-on
description: Pick up one Linear issue (e.g. UNI-123) as a worker session — check blockers and conflicts, claim it, load only the context it links, implement in this worktree, verify, update docs, open the PR and post a handoff. Use when the user says "work on UNI-123", "/work-on UNI-123", or a session is started with an issue id.
argument-hint: <UNI-123>
---

# Work on a Linear issue

One session = one issue = one worktree = one branch = one PR. Linear is the shared state between
parallel sessions: claim before you start, hand off before you stop. **Before writing anything to Linear,
follow the rules in `docs/sop/linear-workflow.md`** (search before create, comment formats, relations).
Process reference: `docs/sop/parallel-claude-sessions.md`. In repos without `docs/sop/` (unilytics-mcp),
read these from `~/dev/ul-langgraph/docs/sop/`.

## Required Linear trail — every runner, no exceptions (trial 2026-10-15: both Qwen and Opus skipped parts)

Do these in order. Get timestamps from `date -u +%FT%TZ`; never guess them.
1. **Before reading any code:** post `Started · runner <runner> · branch <branch> · <ts>`, sync to the
   latest deploy branch (step 3c), then post the **WORKLOG** comment (step 3b) and keep its comment id.
2. **While working:** edit that WORKLOG (plan chosen, approach change, gotcha, human correction, Verify run).
3. **Anything only the human can do** (rotate or revoke a key, console or dashboard changes, prod config):
   post `QUESTION:` and add the label **Needs input**, even if you mention it in the handoff, so `/dispatch`
   puts it in front of the human. Open and prefill it first, so the human's part is one small step
   ("Handing the founder a step", below).
4. **Before you stop:** a `CHECKPOINT` (unfinished) or a `Handoff` (PR open), each with `runner <runner>`.

## The engineering bar — every runner, every issue (founder, 2026-10-18)

> "There should be no bandaid fixes ever. We need production level expert level code and review as they go."

- **No band-aid fixes, ever.** Find the root cause and fix it there. These are band-aids, so don't ship them:
  - special-casing one input or id;
  - swallowing or downgrading an error;
  - a retry or sleep around a bug;
  - disabling or loosening a test, lint rule or type;
  - a fallback that hides a failure;
  - "TODO: fix properly later";
  - dummy data where a backend exists;
  - fixing the symptom in the consumer when the bug is in the producer.
  If the proper fix is bigger than the issue, stop and say so: post a `QUESTION` with the options, or create the
  follow-up issue and make this one depend on it. Don't patch around it. A temporary measure is allowed only when
  the human approves it as temporary and it has its own issue to remove it.
- **Production-level, expert-level code:**
  - inputs validated at the boundary;
  - errors handled and surfaced;
  - auth and tenant scoping on every read and write;
  - idempotent writes and migrations;
  - no secrets in code;
  - logs that let the next person debug it;
  - names and structure that match the surrounding code;
  - a test that would have caught the bug, or that pins the new behaviour.
  Write it as the best engineer on this stack would, not just so that it passes.
- **Review as you go, not only at the end.** After each meaningful step (a model, an endpoint, a component,
  a migration), re-read your own diff against this bar and the Acceptance criteria before moving on. For
  anything non-trivial, use a review subagent with fresh context. The final fresh-context review in step 6
  still runs on top.
- **Research before you design** (step 4.6) and **consult the council on important work** (step 6).

## Talking to the founder

They run several companies and have little time. Lead with the result or the decision you need, then
bullets. No essays. Never a bare issue id: say what it is and why it matters, e.g. "UNI-84 (billing routes had
no login check) — anyone could drain credits". Ask one question at a time, with your recommended answer.

**The founder switches between many worker tabs** (founder, 2026-10-24: "the way workers tell me a task is
very hard to understand… i need at least the first message to be clear on what the task is and then telling
me how its gonna work on it. basic."). So:
- **First message = the task brief.** Right after reading the issue (step 1), before claiming or reading
  anything else, print it in this shape:
  ```
  UNI-127 · Unilytics skill library for every user
  What: every new user sees your scrubbed skills in their AI and the app; each goes live only after you approve it.
  Why now: first step of the open-source skills launch; UNI-128/129/115 wait on it.
  How I'll work:
    1. Read the plan, the related issues and the skill store code (~15 min).
    2. Write a plan and run the council on it (data model, so this matters), then show it to you.
    3. Build with tests, after your OK. Fresh-context review.
    4. Merge to dev, check the deploy, test it live, post the handoff.
  Needs from you: plan approval in ~30 min. Nothing before that.
  Runner ul · repo ul-langgraph · branch uni-127-…
  ```
- **Every later message starts with the issue id plus a 2–4 word name** (`UNI-127 (Unilytics skills): …`),
  so a glance at any tab says which task it is. Progress lines say what was found or decided, not only
  "reading files now".

### Handing the founder a step: open it, prefill it, leave only what Claude can't do (founder, 2026-10-24)

> "if ever asking me to do anything, open everything, prefill possible details and only assign the smallest of
> step that the claude cant do to me"

**MVP: make the console change yourself** (founder, 2026-10-31, on an Auth0 toggle handed to them: "even things
like this, why waste time"; and "even deletions they can do if those are non risky ones or part of testing").
A configuration change the task needs is pre-approved on our own admin consoles: Auth0, Firebase, Google Cloud
(OAuth branding, consent screen, redirect URIs), MongoDB Atlas, AWS, GitHub and Linear settings. Examples: switch
a connection off, rename an app, add a redirect URL, fill a branding field, flip a feature flag. Don't stop to
ask:
1. Write the current value in the issue.
2. Make the change.
3. Verify it worked.
4. Comment the new value and how to undo it.
Deletions are pre-approved too when they're low-risk:
- test data a session created (TEST projects, test users, test files);
- config you've confirmed nothing depends on (e.g. a connection with 0 users, a stale redirect URL, a merged
  branch).
Log what you deleted the same way.
Still the founder's:
- money (payments, plan upgrades, anything billed);
- deleting real users' or clients' data, production infrastructure (functions, databases, collections, buckets,
  DNS), or anything you can't confirm is unused;
- creating, revealing or rotating a secret you don't hold;
- granting a person access;
- accepting terms, or applying to a program on the company's behalf;
- a password, 2FA code or CAPTCHA.
If a safety check still blocks a pre-approved change, don't work around it. Open the page on the exact control
and ask for that one click.

Never hand the founder a list of instructions to follow. Before you post the `QUESTION` or ask in the terminal:
- **Open it in Chrome** (Claude in Chrome): the console, dashboard, form or settings page, already on the right
  screen. If it needs a sign-in, do the sign-in clicks yourself (account chooser, consent); only a password,
  2FA code or CAPTCHA goes to the founder.
- **Prefill every field you can**: names, descriptions, ids you can look up (org or project ids, ARNs, URLs),
  checkboxes, the exact value to paste. Look the ids up yourself with the CLI or API.
- **Ask only for the step Claude may not do**: typing a password, 2FA code or CAPTCHA (never the account
  chooser, a consent screen or a sign-up step: those are yours), a payment, a secret value, or the final
  Submit / Approve / Delete. Name the tab, the one button, and what happens when it's pressed.
- If a step needs a prerequisite (a paid plan, an org), say so up front, and open that page too.
- Commands still follow the rule under Worktree safety: one command, exactly as pasted, no placeholders.

## Autopilot issues (label **Autopilot**)

The founder approved the scope in advance (the `Autopilot — approved by founder …` line in Context) and isn't
around to answer. So:
- **Don't wait for plan approval** (step 6). The approval for the plan is: step 4's reading, plus the research
  (4.6), plus the council (step 6 budget: first round `--high`, re-checks `--medium`) with every REVISE point
  fixed or answered. Then build. Post the plan,
  `Research:` and `Council:` lines in the WORKLOG so the founder can read them later.
- **Stay inside the approved scope.** Stop for anything outside it, or any one-way door the approval doesn't
  name: post a `QUESTION`, add **Needs input**, finish what the question doesn't block, then post a
  `CHECKPOINT`. Never guess. Never handle secrets, payments or data deletion on autopilot unless the approval
  names them.
- Merge gate, deploy check and the Chrome live test (step 10) are unchanged. A test only the founder can run
  (Claude Desktop, a design call) waits for the morning as a `TEST PROMPT`; the dispatcher lists it in its report.

## Worktree safety — every runner (trial 2026-10-15, UNI-55)

Parallel workers share this Mac and the human's main checkouts hold uncommitted work.
- Run every command inside **your** worktree. Never `cd` into `~/dev/<repo>` (the main checkout) or another
  worktree.
- Never `git stash` (the stash is shared across worktrees) and never `git checkout` another branch here.
- Baseline on the deploy branch: `git worktree add /tmp/<issue>-base origin/<dev|main>`, run there, then
  `git worktree remove /tmp/<issue>-base`. To compare error lists (e.g. `tsc`), strip the
  `/tmp/<issue>-base/` path prefix and the line numbers from both before diffing, or every line differs (UNI-98).
  Python: `python -m pytest /tmp/<issue>-base/tests/…` run from your worktree imports **your worktree's** code
  (`-m` puts the cwd first on `sys.path`), so the "baseline" silently tests the new code. Prefix it with
  `PYTHONSAFEPATH=1 PYTHONPATH=/tmp/<issue>-base` and confirm a test that needs the new code fails there (UNI-169).
- Never `pkill` / `killall` by pattern (e.g. `pkill -f 'npm test'` kills other workers' tests). Stop only your
  own background task or PID.
- Never print secret values: mask them (`sed -E 's/(=).{6,}/\1…[masked]/'`), even on the local runner.
  A prefix ("first 12 chars + …") still leaks part of the secret; print key names only (UNI-56).
- Reading prod secrets (Mongo URI, `JWT_SECRET`) or minting a prod token is blocked by the auto-mode
  classifier. Hand that one command to the human. In a message for **this Claude prompt**, give the
  `! <command>` form; for the human's **own terminal**, give the plain command without `!` (in zsh,
  `! cd dir && cmd` negates `cd` and silently skips `cmd`; UNI-56's first index run did nothing).
  A command handed to the human must run exactly as pasted: no placeholders to fill in. If it needs a
  secret, ship a script that finds it locally and never prints it (founder, UNI-31: "im not swapping in
  shit, thats for you to do"). Searching the disk for where a secret lives is blocked too, so if the
  script can't find it, ask the human for the file path, not the value.
- Don't re-run a slow full test suite to read a different slice of its output. Save it once
  (`--json --outputFile=…` or `> log`) and read the file.
- The worktree sandbox refuses commands it can't prove stay in your worktree: `git` chained with other
  commands (`&&`, `;`, pipes), a heredoc `python3 -` that edits several files, a heredoc append
  (`cat >> file <<EOF`, refused even on its own, UNI-98), `git -C <other dir>`, and commands built from shell
  variables (`VAR="$(aws …)" cmd`, `for` loops over variables, `gh pr create --body` with backticks). A
  chained command whose text merely contains `git` (a `github.com` URL in a `printf` or a file you
  write) is refused too (UNI-118), and so are a group redirect (`{ …; } > file`) and `python` run on a path
  held in a variable inside a loop (UNI-209, UNI-224, UNI-232). Run git
  commands one per call, write absolute paths instead of variables, edit files with the Edit tool, pass PR
  text with `--body-file`, and put anything longer in a scratchpad script you run as `zsh <path>`
  (2026-10-18, UNI-27, UNI-56, UNI-81). A Python script that imports repo code is refused when run with
  `PYTHONPATH=… python <file>` or as a heredoc: write it to the gitignored `scripts/` folder (with an empty
  `scripts/__init__.py`) and run `~/dev/<repo>/.venv/bin/python -m scripts.<name>` from the worktree (UNI-131).
- The Write tool strips trailing whitespace, so a patch script whose anchor includes a whitespace-only line
  never matches. Build such an anchor in code (`" " * 8`) or anchor on a line with text (UNI-94).
- A second issue in the same session gets its own worktree: `git fetch origin`, then
  `git worktree add -b <gitBranchName> .claude/worktrees/<issue> origin/<deploy>` and switch into it
  (EnterWorktree with `path`). Never reuse the previous issue's branch. The skill text you loaded still comes from
  the first worktree, which can be older than the deploy branch. Re-read the current version with
  `git show origin/<deploy>:.claude/skills/work-on/SKILL.md`. In UNI-94 the old copy said to hand the founder a
  TEST PROMPT, while the current one says to run the test yourself.
- Need `node_modules` for `tsc` / `vite build`? Symlink the main checkout's:
  `ln -s ~/dev/<repo>/node_modules node_modules` (gitignored; never `npm install` into the shared folder).

## How a worker writes to its issue (the skill-authoring rules, applied to issues)

The same rules we use to author Unilytics skills (`author_skill` in `mcp_server/tools/workflow_tools.py`):
- **Progressive disclosure.** The issue description is the lean contract (Outcome / Context / Acceptance /
  Verify). Detail lives in the WORKLOG comment, and the Handoff summarises and points. Keep each layer short.
- **Memory first.** Before planning, read prior learnings: this issue's comments (earlier WORKLOGs,
  CHECKPOINTs), the handoffs of its blocking and related issues, and recent handoffs in the same Area.
- **Gotchas are the highest-signal content.** Real failure points, edge cases and env quirks, written when
  they happen. Skip the obvious; keep what would push the next session out of its default behaviour.
- **Measured, not claimed.** Verify means the command you ran and its real output, never "tests pass".
- **Route learnings by kind.** *Operational* (tool quirks, run order, env facts): record them in the WORKLOG
  yourself. *Human corrections or expert input* (the human changes the method or adds a step): trace it
  back, propose it as a concrete rule or step with its target file, confirm the wording with the human,
  then record it as confirmed.
- **Ask before you hand off.** In an interactive session, ask "Anything else worth capturing from this
  issue?" and route the answer the same way.
- **Hygiene, not addenda.** If scope or acceptance changes, edit the issue description's own section (add
  `Changed <date>: <why>` under it). Don't stack dated notes. The dispatcher folds learnings into the
  canonical section of the target doc, not into an appended "learnings" block.
- **Don't condense other people's words.** Copy questions, answers and error text verbatim.

## 0. Which runner am I? (`docs/sop/model-runners.md`)

Run `echo "${UL_RUNNER:-univ}"` (empty means `univ`: plain `claude`). Put `runner <name>` in every Linear
comment you post.
- `univ` = Opus on the Univsense Max login (`claude-univ`, same as plain `claude`). The default.
- `ul` = Opus on the Unilytics Max login (`claude-ul`, separate login in `~/.claude-unilytics`).
- `univ-api` = Opus on the Univsense API credit (`claude-univ-api`).
- `local` = Qwen on this Mac (`claude-local`). Draft PR, then the dispatcher's Opus review gate.

Claude in Chrome pairs with the claude.ai account the extension is signed in to, so a `ul` session only has
Chrome when the extension is on the Unilytics account. If the issue needs a live test, check
`list_connected_browsers` when you claim it and say in `Started` whether Chrome is connected (UNI-107).

univ, ul and univ-api are all Opus: normal PR, self-review, no review gate. `univ-api` or `local` → Linear
comes from the `linear` MCP server (claude.ai connectors don't load). No Linear tools → stop and tell the
human: "run `claude mcp login linear` (for `ul`: `CLAUDE_CONFIG_DIR=~/.claude-unilytics claude mcp login
linear`), then relaunch".

## 1. Read the issue (Linear MCP)

- `get_issue` for `$ARGUMENTS` (load Linear tools via ToolSearch `select:` first if deferred).
- Note: project, milestone, labels (Area), `blockedBy`, parent, `gitBranchName`, comments.
- If it is a **parent issue** with open sub-issues, work on the first unblocked sub-issue instead, or
  break it down (step 4) if it has none.
- **Resuming?** First run `git status` and `git diff` in the worktree: a session that stopped (usage limit,
  crash) can leave uncommitted work that was never approved or doesn't build (UNI-98). Treat it as a draft:
  review it, put any decision it makes that isn't on Linear to the human, and show the plan again before
  building on it. Then read the comments from the newest backwards:
  - Latest is `DISPATCHED …` for this repo, or a `CHECKPOINT` / `Claimed by` from an earlier session that
    the human asked you to resume → this is a resume: reuse the same branch, read the last CHECKPOINT
    **and the WORKLOG** (step 3b), continue from its "Next step".
  - Latest CHECKPOINT says `ESCALATE: needs opus` and you are univ, ul or univ-api → this is a
    hand-back. Read the WORKLOG's dead ends and gotchas first so you don't repeat them, review the WIP
    commits on the branch, then continue. Start a fresh WORKLOG for your session (the old one stays as history).
  - Latest is a claim/checkpoint from **another live session** (< 24 h, no `RELEASED`) and nobody told you
    to take over → stop and tell the human.

## 2. Stop conditions (check before touching code)

- Any `blockedBy` issue not Done → stop, comment "Blocked by UNI-x", tell the user which issue to run.
- Another issue **In Progress** with the same Area label in **this repo** (`list_issues state:"In Progress"`)
  → stop and tell the user; two sessions editing the same area collide. The one exception: your issue
  records a **founder exception** for that other issue (its Context or the `DISPATCHED` comment says so).
  Then go on, keep strictly to the files the exception allows, and merge `origin/<deploy>` before you ship.
- Issue lacks an Outcome / Acceptance / Verify → ask the user (or the dispatcher) to fill it; don't guess scope.
- Issue belongs to a different repo than the current directory → tell the user which repo to start in.

## 3. Claim it (claim, then verify)

Linear writes aren't atomic, so claim and then re-check:
- If the dispatcher already posted `DISPATCHED to <repo> session …` for this run, that is your claim — just
  add `Started · runner <runner> · branch <branch> · <ISO timestamp>`.
- Otherwise: `save_issue` (assignee `me`, state `In Progress`) and `save_comment`
  `Claimed by Claude session · runner <runner> · repo <repo> · branch <branch> · <ISO timestamp>`.
- **Verify:** re-read the comments. If another `Claimed by`/`DISPATCHED`/`Started` from a different session
  appears with an earlier timestamp and no `RELEASED`, post `RELEASED — duplicate claim, backing off` and stop.
- Make sure you are in a worktree, not the main checkout: if `git rev-parse --show-toplevel` is the main
  repo folder and other sessions may be running, use the EnterWorktree tool (or ask the user to restart
  with `claude -w uni-123`). Branch name = the issue's `gitBranchName` (e.g. `uni-123-short-title`):
  `claude -w` creates `worktree-uni-123`, so rename it before the first push
  (`git branch -m <gitBranchName>`), or check out the existing branch when resuming.

### 3b. Open the WORKLOG (one living comment per session)

Right after claiming, post one comment and keep its comment id. **Update that same comment**
(`save_comment` with `id`) as you go, instead of posting many small comments. It survives a crash or a
full context, and the next session (or Opus on a hand-back) reads it first.
```
WORKLOG · runner <runner> · branch <branch> · started <ISO timestamp>
Plan: <approach in 2–4 lines, key files>
Progress: <ts> <one line per milestone: plan chosen, part done, Verify run + result>
Decisions: <choice — why — alternatives rejected>
Dead ends: <what you tried — why it failed>
Gotchas: <surprise — root cause — fix/rule — where it belongs (CLAUDE.md / SOP / skill / architecture doc)>
Human corrections: <what the human corrected — the rule it implies — where it belongs>
```
Update it at least when: the plan is chosen, the approach changes, something fails in a way worth knowing,
the human corrects you, Verify runs, and before you stop. Write gotchas **when they happen**, not from memory
at the end — they are the most valuable thing a session leaves behind.

### 3c. Start from the latest deploy branch

`claude -w` branches from the local checkout, which can be days behind `origin` (founder check 2026-10-17).
Deploy branch: ul-langgraph → `dev`, every other repo → `main`.
- `git fetch origin` — also right before any `git worktree add … origin/<deploy>`: it branches from the
  last *fetched* ref, which is stale if something merged since (UNI-27 started 1 merge behind).
- **New branch** (`git log --oneline origin/<deploy>..HEAD` and `git status --porcelain` both empty) →
  `git reset --hard origin/<deploy>`.
- **Resuming a pushed branch** → `git merge origin/<deploy>` (not rebase: the branch is already on the remote).
- Write the base in the WORKLOG `Progress:` line (`based on origin/<deploy> @ <short sha>`). Before `/ship`,
  fetch again and merge `origin/<deploy>` if it moved.

## 4. Load context — required reading, BEFORE any plan

Finish all of this before you fill the WORKLOG `Plan:` or show the human a plan. Start `Plan:` with a
`Read:` line listing what you read, so the human can see the plan is grounded. Don't read and plan in
parallel, and don't plan first and read afterwards.

1. **Project plan (always, every repo):** the Linear document "Pivot plan — consultant skill platform"
   (`get_document` id `767abece-ac8b-43ba-b7eb-932a0eaf9369`). It holds the product direction, phases and
   decisions; read the sections that touch the issue in full and skim the rest. For Context Manager, Brand
   Kit, Knowledge Base or Personal Context work, also read the Linear document "Context Manager design"
   (`e66939fa-8eff-4a4d-b6f6-e597dc6d486b`). The Linear copies are current; another repo's local checkout
   may be stale. The pivot plan is ~100k characters, over the tool-result limit: the result is saved to a
   file; list its headings (`json.loads(...)["content"]`, then the `\n## ` / `\n### ` offsets) and read the
   sections you need by character range (UNI-98).
2. **The issue:** its description, parent, attached documents, comments, and the handoffs of its blocking
   and related issues (Memory first).
3. **This repo's docs:** `CLAUDE.md` (auto-loaded), `docs/architecture/overview.md`,
   `docs/sop/developer-standards.md` (where present), every `docs/architecture/*` doc for the area you touch
   (`ls docs/architecture`), and any doc the issue Context names. A doc in another repo: read it from
   GitHub, e.g. `gh api "repos/TeamUnilytics/MVP-V1.0.0-/contents/<path>?ref=dev" -H "Accept: application/vnd.github.raw"`
   (ul-langgraph `MVP-V1.0.0-`@dev, ul-backend `Unilytics.ai.server`@main, ul-frontend `Unilytics.ai.UI`@main,
   unilytics-mcp `unilytics-mcp`@main).
4. **Repo must-reads:**

   | Repo | Read before planning |
   |---|---|
   | ul-frontend | `CLAUDE.md` sections "Design System — Geist", "Page Layout — AppLayout & Mode System" and "Rules for building a new page"; `docs/architecture/layout-system.md`; `docs/architecture/design-logic-v2.md`. List `src/components/ui/`, `src/components/layout/` and `src/components/global/` and **reuse what exists**: the plan names the components it reuses, and every new component needs a one-line reason. |
   | ul-backend | `docs/architecture/database-schema.md`; for auth, credits or billing also `docs/architecture/auth-token-billing.md` and `docs/architecture/mcp-billing.md`. |
   | ul-langgraph | `docs/architecture/mcp-server.md` for anything in `mcp_server/`, skills or `helpers/skill_store.py`. |
   | unilytics-mcp | `README.md`, plus ul-langgraph `docs/architecture/mcp-server.md` (via `gh api`). |

5. **Then the code:** related code, tests and existing patterns. The issue's `Expected files:` line is for
   collision checks, not a fence.
6. **Research how it should be done, before you design it.** Scale it to the work: minutes for a small bug,
   real research for a feature, contract, schema or anything a user sees.
   - **Our other repos and skills:** has ul-backend, ul-frontend, ul-langgraph or unilytics-mcp already solved
     this (read them on GitHub, see item 3)? Reuse the pattern rather than inventing a second one. The
     founder's own skills often hold proven methods (e.g. `doc-template-design`, `landing-page-structure-cro`).
   - **Other products:** how Profound, AirOps and the best tools in the space solve the same user problem
     (`docs/research/competitor-context-map.md`, their docs, or Claude in Chrome when the session has it).
     For a schema or contract modelled on a competitor (a one-way door), read their real API: field names and
     endpoints from the page scripts and network calls, not only their docs or UI (founder, UNI-107). Keep our
     own keys and add an import/export adapter. On a Next.js app, Resource Timing caps at ~250 entries and
     misses chunks: list `script[src]`, grep the chunks in-page with `fetch()`, and return file names only
     (URLs trip the privacy filter).
   - **Best practice and primary sources:** the official docs, specs and RFCs for what you touch (MCP spec,
     OAuth RFCs, Mongo, FastMCP, React or Tailwind docs, AWS docs), and well-regarded open-source
     implementations. Use WebSearch or WebFetch, and prefer primary sources over blog summaries.
   - Write a `Research:` line under `Read:` in the WORKLOG plan: what you looked at (links), what you'll adopt,
     and what you rejected and why. A plan without it is not ready to show.
- If the work splits into steps another session could take, create **sub-issues** (`save_issue` with
  `parentId`, same project + milestone, Standard task format). If it is bigger than ~1 week, comment
  "Proposing convert-to-project" and stop for the user.
- **Cross-repo work:** one issue per repo. The issue that defines the contract (API/schema/MCP tool)
  blocks the consumers — create those relations (`blockedBy`) instead of editing another repo.

## 5. If you have a doubt

1. Look it up first: issue Context links → plan section → design doc → `docs/sop/*` → comments on related
   and blocking issues.
2. Still unsure and it changes the outcome → comment `QUESTION: <one clear question>` (+ options you
   considered, what it blocks), add the label **Needs input**, and ask the human in this terminal.
3. Continue with whatever the question doesn't block; otherwise stop and say so. Never guess on scope,
   data deletion, pricing or anything that deploys a breaking change.

## 6. Plan → implement → verify

- Plan first (plan mode for anything non-trivial), only after step 4's reading and research are done. The plan
  opens with its `Read:` and `Research:` lines. Then implement in small commits, reviewing each step as you go
  (engineering bar, top of this skill).
- **Consult the council on important work, before the human approves the plan:**
  `/consult-the-council --high` on the plan. Important means any of:
  - a key feature (core product: Context Manager, skills, MCP, onboarding/sign-in);
  - security, auth or tenant isolation;
  - credits, billing or payments;
  - a data model, schema or migration;
  - a cross-repo contract (REST shape, MCP tool signature);
  - anything public or hard to undo or an architecture choice.
  **Budget (founder, 2026-11-01: the council was our biggest LLM spend):**
  - Only the first round runs `--high`.
  - Every later round runs `--medium`, on only what changed plus the previous REVISE points. That covers the
    re-check after fixes and the final diff.
  - At most 3 rounds per issue; a 4th needs the founder's OK.
  - `--high` again only after a REJECT.
  - Other work: `--medium` once, or no council.
  - Send the diff and the relevant excerpts, never whole files.
  Show the human the plan with a `Council:` line: each verdict, the issues raised, what you changed or rejected
  and why, and the run's cost total. REJECT → stop and discuss before building. For security, billing and
  migrations, also run it on the final diff (`--medium`) before merging. Record every run in the WORKLOG.
- **Interactive session (the human is in the terminal), not Autopilot: show the plan and wait for an explicit
  approval before building** — founder, 2026-10-18: "take my approval beofre proceeding, you can show what your plan
  is and then only proceed". Corrections to the plan count as "not yet": fold them in and show it again.
  Name the files, the components reused, and any open decision with your recommendation.
- **Saven's important comments go on Linear before they're in code.** When Saven decides or changes something
  that matters, post it as a `Comments from Saven:` comment before building on it: their exact words, plus one
  line on what it changes. That means scope, approach, what a screen shows or who sees it, or a rule for future
  sessions. Routine replies don't get a comment: a plain yes or no, "approved" on a plan that's already in the
  WORKLOG, "go ahead". At most they get one line in the WORKLOG `Progress:`. Saven, 2026-10-19: "Only the
  important ones … dont clutter it … mostly it might just yes or no approval". A decision you only find in code
  or a summary, with no Linear record, is a question for Saven, not a fact. In UNI-98, a stalled session's WIP
  had an unrecorded "everyone gets the new screens", and Saven then chose differently.
- Run the issue's **Verify** command/check. Paste the **actual command and its output** (trimmed) into the
  handoff — measured, not claimed. No green Verify = not done.
- Run a fresh-context review of the diff against the Acceptance criteria (`/code-review` or a review
  subagent) before opening the PR. On local this review uses the same model, so the dispatcher still
  runs the Opus review gate afterwards.

## 7. Docs in the same PR (definition of done)

- User-facing change (MCP tool, behaviour, pricing, setup) → update `docs-public/` (once it exists;
  until then note "docs: TODO" in the handoff) and add a dated changelog entry.
- Dev docs (`CLAUDE.md`, `docs/sop/*`, `docs/architecture/*`, skills): update them in your PR when your work
  makes them stale or teaches a gotcha (`/update-learnings` is fine), and list them in the handoff.
- **The main plan is the dispatcher's:** `docs/plans/pivot-consultant-skill-platform.md` and the Linear document
  "Pivot plan — consultant skill platform". Never edit either, even if the human asks mid-session
  (founder, 2026-10-18). Reply that the dispatcher updates the plan at wind-up, and write it under
  `Plan changes` in the handoff. Other Linear documents (e.g. "Context Manager design"): edit the git copy
  if the issue needs it and name it in the handoff so the dispatcher syncs the Linear copy.

## 7b. Hand back to Opus (local only)

Hand back instead of grinding when: the same problem survives two different fix attempts; you notice
you're repeating an action; you're unsure the approach is right; or the human types "escalate". Then:
1. Commit WIP and push the branch. Update the WORKLOG (what you tried, why it failed, your best guess).
2. Post `CHECKPOINT — … · runner <runner> … ESCALATE: needs opus — <one-line why>` (format in step 8).
3. Tell the human in this terminal, exactly:
   > Handing this to Opus. Type `/exit`, then in this same tab run:
   > `cd ~/dev/<repo> && claude-univ -w <worktree-name> "/work-on UNI-123"`
   > (Univsense limit low? Use `claude-ul` or `claude-univ-api` instead of `claude-univ`.)
   The Opus session reopens the same worktree and branch and starts from the CHECKPOINT and WORKLOG.
4. Stop.

## 8. Stopping before the work is done (end of day, context full, interrupted)

- Commit work-in-progress and push the branch (`git push -u origin <branch>`), even if tests don't pass yet.
  Do this before a long build step when the usage limit is close: a session that dies with uncommitted work
  leaves the next one guessing (UNI-98).
- `save_comment`:
  ```
  CHECKPOINT — <ISO timestamp> · runner <runner> · branch <branch> @ <short sha>
  Done so far: <bullets>
  Next step: <the exact next thing to do>
  Open questions: <… or none>
  ```
- Leave the issue **In Progress** (it stays owned). If you are abandoning it instead, post
  `RELEASED — <why>` and move it back to Todo.

## 9. Ship + hand off

- `/ship` (PR title starts with `UNI-123:`; Linear moves the issue to In Review automatically).
  **Local:** open it as a draft (`gh pr create --draft …`, or `gh pr ready <n> --undo` right after
  `/ship`). The dispatcher's Opus review marks it ready for the human.
- `save_comment` handoff on the issue:
  ```
  Handoff — PR <url> · runner <univ|ul|univ-api|local>
  Changed: <2–4 bullets>
  Verify: <command> → <result>
  Risks / deploy notes: <…>
  Follow-ups: UNI-x (created), …
  Learnings (from the WORKLOG, each with where it belongs):
    Gotchas: <what — root cause — fix/rule — target file>
    Human corrections: <what — rule — target file>
    Decisions / dead ends worth keeping: <…>
  Plan changes (for the dispatcher): <plan section — what was decided or changed in scope — the human's
    exact words, or none>. The dispatcher builds the plan update from this, Changed and Follow-ups.
  Runner notes (local only): <where the model struggled or did well, or none>
  ```
  The dispatcher folds these into the target file's existing section (no dated addenda). Write each so it
  makes sense to someone who never saw this session.
- New bugs or follow-ups you found → new issues in the right project, linked `relatedTo`/`blockedBy`.
- **Opus runners (univ, ul, univ-api): continue with step 10.** You merge, watch the deploy and hand the human a
  test prompt. **Local:** stop at the draft PR. The dispatcher reviews it, then does step 10 for it.

## 10. Merge → deploy → test on the live product (univ, ul, univ-api)

The human tests only on the deployed product, never locally. So an Opus worker finishes its own issue end to end.
1. **Merge gate.** Merge only if ALL of these hold. Otherwise say which one failed, post a `QUESTION:` (+ Needs
   input) if the human must act, and stop:
   - Verify is green and the fresh-context review found nothing blocking.
   - Important work (step 6): the council ran on the plan (and on the diff for security, billing or migrations),
     and every REVISE point is fixed or answered in the WORKLOG.
   - No band-aid in the diff (engineering bar). If a reviewer would call something a workaround, it isn't ready.
   - The PR isn't a draft, its title has no "DO NOT MERGE", and the issue isn't parked (e.g. under UNI-73).
   - Every `blockedBy` issue is Done (merged and deployed), so multi-repo features land in dependency order.
   - No other deploy is running in this repo (`gh run list -R <owner/repo> --limit 3`: nothing in progress).
   - Nothing the deploy needs is missing: an env var or secret, a migration, a manual step. Never merge first
     and fix production after.
2. **Merge** into the repo's deploy branch (ul-langgraph → `dev`, the rest → `main`):
   `gh pr merge <n> -R <owner/repo> --merge --delete-branch`. If the safety check blocks it, ask the human
   "OK to merge PR #<n> into <branch>? It deploys to production." and merge after they say yes.
   Right after a push, `gh pr merge` fails with "not mergeable" until the PR's checks finish: run
   `gh pr checks <n> -R <owner/repo> --watch` first. If another PR merged meanwhile, `git merge origin/<deploy>`,
   push, and wait for the checks again (UNI-94). Right after `gh pr create`, `--watch` exits 1 with "no checks
   reported" because the workflow hasn't queued yet: take the run id from `gh pr view <n> --json statusCheckRollup`
   and `gh run watch <id> --exit-status` (UNI-258). In a worktree you took over, `git fetch origin` and merge the
   deploy branch right before merging (UNI-212). `--delete-branch` run from the worktree deletes only the remote
   branch; the local one goes with the worktree (UNI-258).
3. **Watch the deploy:** `gh run watch <run id> -R <owner/repo> --exit-status`. If it fails: read the log, tell
   the human, post a CHECKPOINT and stop (don't merge anything else). unilytics-mcp has no deploy; publishing to
   npm is manual, so say so.
4. **Deploy check, every change except docs-only.** Exercise the changed behaviour on the DEPLOYED version yourself:
   call the live endpoint or MCP tool the change touches with a test account or project (never real customer
   data, never anything that charges, emails customers or deletes), confirm the response is what the Acceptance
   criteria expect, and check the Lambda error count for ~10 minutes after the deploy. Post the commands and
   real responses (secrets masked) as a `DEPLOY CHECK` comment. Failed → tell the human and fix forward or ask
   about reverting; don't move on.
   - Lambda: `aws lambda wait function-updated-v2` before the first probe, or old and new containers answer
     (UNI-28). LangSmith runs from a call arrive only after a later invocation thaws the container, so send a few
     more calls before looking for a trace (UNI-236).
   - A check that must run on prod data (a billing rehearsal, a prod read or write) is blocked by the auto-mode
     classifier until the founder approves it in chat: ask once, early, and record the answer as a `Comments from
     Saven` comment (UNI-212). Sending injection payloads to prod with a real token stays blocked; cover those
     with the test suite and forged-token calls (UNI-224).
   Timing checks (UNI-81): every merge, docs-only included, redeploys the Lambda and makes every container
   cold, so run "after N min idle" checks at least that long after the **last** merge to the repo. Numbers
   measured from outside India include ~0.45 s of TCP+TLS on a fresh connection; report first-call and warm
   (connection reused) separately, and read server time from `Server-Timing` or CloudWatch.
5. **Live test: run it yourself in Chrome** (founder, 2026-10-18: "this is a must"). If the change can be seen or
   used in a browser (app.unilytics.ai, a public page, an export link), you test it on the deployed product:
   - Load the Claude in Chrome tools: one ToolSearch for `tabs_context_mcp`, `tabs_create_mcp`, `navigate`,
     `computer`, `find`, `get_page_text`, `read_console_messages`, `browser_batch`, `javascript_tool` and
     `gif_creator`. Open your own tab. Count list items with `javascript_tool` on the DOM, not by eye from a
     scrolled screenshot (UNI-94).
   - **Sign in yourself, every click.** Unilytics is an MVP with no users yet, so you test sign-in and the task on
     the live app every time the task needs it; never tell the founder you can't log in (founder, 2026-10-24). The
     test account is **savenjudes@gmail.com** (a test Google account). You make every click of a sign-in or
     sign-up flow yourself: "Continue with Google", the account in Google's chooser, Continue / Allow on a consent
     screen, and any sign-up or onboarding step after it. Never ask the founder to click an account, a consent
     screen or any other step of these flows; testing them on production is your job (founder, 2026-10-31:
     "it's the workers' duty to do the logins from their end itself, esp when they're supposed to be testing all
     of these sign-in and sign-up actions in production"). The founder gets only a password, 2FA code or CAPTCHA
     prompt, and only that one field. If the Chrome tool itself refuses a click, say exactly that, once. If
     sign-in is blocked (the extension isn't allowed on the Auth0 domain, a preview origin isn't an Auth0
     callback), fixing that is part of your task: allow it, or file a sub-issue and test on production instead.
     Never type a password. Firebase PR previews are their own origin and aren't Auth0 callbacks, so frontend live
     tests run on production after the merge (UNI-109).
   - Parallel sessions share one Chrome profile and can switch the app.unilytics.ai account under you: check which
     user is signed in before each UI step (UNI-49, UNI-95).
   - **Where to write test data:** the client projects in the founder's account are dummies (founder: "you can
     use the simbex project"). The account is at its `max_projects` cap, so write into "Simbex - SEO + AEO Audit"
     (or Cass), label everything TEST, and clean it up afterwards (UNI-139, UNI-107).
   - Check every Acceptance item, not only the TEST PROMPT steps. An item written for a screen that has since been
     redesigned is checked in its new form, and the TEST RESULT says how it differs (UNI-94).
   - **Test cases first, as Gherkin scenarios** (`Given … When … Then …`, the Cucumber format and the most
     widely used way to write acceptance tests). No new tool: you write them and you run every step yourself in
     Chrome or against the live API (founder, 2026-11-01). Put them in the WORKLOG before you test, derived from the
     issue's Acceptance criteria:
     - **happy path:** one scenario per Acceptance item;
     - **round trip:** what the user creates comes back where they'd read it (upload → it's listed and search finds
       it; save → the MCP tool returns it; export → the file downloads and opens);
     - **edge cases:** empty state, long text, a second project, a narrow window, light and dark;
     - **errors:** wrong input, or a failure you can trigger safely; the message must say what to do;
     - **permissions**, when the task touches access: another user or a viewer can't see or change it;
     - **regression:** the screen or tool right next to your change still works.
     Run each one and mark it PASS/FAIL with evidence (screenshot, GIF frame or response). Check the console and
     network for errors on every screen you touch, and record a GIF of the main flow.
   - **Scope: your task only.** Test your change and its direct neighbours, nothing wider. Anything else you notice
     (a bug, a gap, a better idea) goes to Linear as a new issue in the Standard task format, related to yours.
     If Linear refuses, list it under `Found (for the dispatcher):` in the handoff. Never fix it in this PR.
   - Beyond the steps: never pay, change billing or send anything to real people. Settings changes and deletions
     follow "MVP: make the console change yourself": the low-risk ones you do and log, and the rest go to the
     founder. Use a test project where you can, delete the test data you created, and close your tab when done.
   - Post `TEST RESULT · run by worker in Chrome · <sha>` with `Scenario N — PASS/FAIL — what you saw` and the GIF
     or screenshot paths. The issue doesn't close until every scenario passes. Then show the founder a 2-line summary (what changed and why, PASS or FAIL).
   - All pass → Done (step 6). Any fail → fix it on a new branch and go back to 1.

   **Hand the test to the founder only when you can't run it yourself.** Say why in one line, then post a
   `TEST PROMPT` comment and print it here in one copyable block. That applies when:
   - the Chrome tools don't load or the extension isn't connected;
   - the test needs **Claude Desktop** (the Unilytics MCP is connected only there, so write the prompt for a new
     Desktop chat and tell them to fully quit and reopen Desktop first);
   - a step needs the founder's own judgment (a design call).
   ```
   TEST PROMPT · UNI-123 · deployed <short sha> to <where> at <time>
   You are testing a change on the LIVE product for me. Only do what the steps say; don't change settings,
   data or billing beyond them. Stop and ask me before anything you're unsure about.
   What changed: <2–3 plain-language lines>
   Where: <URL> · log in as <which account; never put passwords here>
   Steps (each with the expected result):
   1. … → expect …
   2. … → expect …
   Edge cases: <empty state, long text, wrong input, second project, mobile-width window…>
   Also check: no errors on the page or in the console, nothing else on the page broke.
   Report back in exactly this format:
   Step 1 — PASS/FAIL — what you saw
   …
   Other issues: <anything odd, with screenshots of every FAIL>
   ```
   Backend changes nobody can see directly still get the step-4 deploy check; docs-only changes skip both.
6. **Close it out.** If you ran the test, your `TEST RESULT` decides. Linear's GitHub integration moves every issue
   a merged PR names to Done, even when its Verify still needs a prod step or a founder decision: move it back to
   In Review (or In Progress) and say why (UNI-166; UNI-279 was closed by a docs PR that only mentioned it). If the
   founder ran the test, wait in this tab for their report and feedback:
   - Post the founder's report verbatim as a `TEST RESULT` comment.
   - All pass → move the issue to Done, final WORKLOG update, and tell the human "Done — you can close this tab."
   - Fails or feedback → treat the feedback as human corrections (route by kind, see the top of this skill),
     fix it on a new branch, open a PR, and go back to 1, with a new TEST PROMPT. Small unrelated follow-ups →
     new issue instead.
