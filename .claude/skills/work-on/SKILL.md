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
   puts it in front of the human.
4. **Before you stop:** a `CHECKPOINT` (unfinished) or a `Handoff` (PR open), each with `runner <runner>`.

## Worktree safety — every runner (trial 2026-10-15, UNI-55)

Parallel workers share this Mac and the human's main checkouts hold uncommitted work.
- Run every command inside **your** worktree. Never `cd` into `~/dev/<repo>` (the main checkout) or another
  worktree.
- Never `git stash` (the stash is shared across worktrees) and never `git checkout` another branch here.
- Baseline on the deploy branch: `git worktree add /tmp/<issue>-base origin/<dev|main>`, run there, then
  `git worktree remove /tmp/<issue>-base`.
- Never `pkill` / `killall` by pattern (e.g. `pkill -f 'npm test'` kills other workers' tests). Stop only your
  own background task or PID.
- Never print secret values: mask them (`sed -E 's/(=).{6,}/\1…[masked]/'`), even on the local runner.
  A prefix ("first 12 chars + …") still leaks part of the secret; print key names only (UNI-56).
- Reading prod secrets (Mongo URI, `JWT_SECRET`) or minting a prod token is blocked by the auto-mode
  classifier. Hand that one command to the human. In a message for **this Claude prompt**, give the
  `! <command>` form; for the human's **own terminal**, give the plain command without `!` (in zsh,
  `! cd dir && cmd` negates `cd` and silently skips `cmd`; UNI-56's first index run did nothing).
- Don't re-run a slow full test suite to read a different slice of its output. Save it once
  (`--json --outputFile=…` or `> log`) and read the file.
- The worktree sandbox refuses commands it can't prove stay in your worktree: `git` chained with other
  commands (`&&`, `;`, pipes), a heredoc `python3 -` that edits several files, and commands built from shell
  variables (`VAR="$(aws …)" cmd`, `for` loops over variables, `gh pr create --body` with backticks). Run git
  commands one per call, write absolute paths instead of variables, edit files with the Edit tool, pass PR
  text with `--body-file`, and put anything longer in a scratchpad script you run as `zsh <path>`
  (2026-10-18, UNI-27, UNI-56, UNI-81).
- A second issue in the same session gets its own worktree: `git fetch origin`, then
  `git worktree add -b <gitBranchName> .claude/worktrees/<issue> origin/<deploy>` and switch into it
  (EnterWorktree with `path`). Never reuse the previous issue's branch.
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

univ, ul and univ-api are all Opus: normal PR, self-review, no review gate. `univ-api` or `local` → Linear
comes from the `linear` MCP server (claude.ai connectors don't load). No Linear tools → stop and tell the
human: "run `claude mcp login linear` (for `ul`: `CLAUDE_CONFIG_DIR=~/.claude-unilytics claude mcp login
linear`), then relaunch".

## 1. Read the issue (Linear MCP)

- `get_issue` for `$ARGUMENTS` (load Linear tools via ToolSearch `select:` first if deferred).
- Note: project, milestone, labels (Area), `blockedBy`, parent, `gitBranchName`, comments.
- If it is a **parent issue** with open sub-issues, work on the first unblocked sub-issue instead, or
  break it down (step 4) if it has none.
- **Resuming?** If the issue is already In Progress, read the comments from the newest backwards:
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
  → stop and tell the user; two sessions editing the same area collide.
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
   may be stale.
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

- Plan first (plan mode for anything non-trivial), only after step 4's reading is done; the plan opens with
  its `Read:` line. Then implement in small commits.
- **Interactive session (the human is in the terminal): show the plan and wait for an explicit approval
  before building** — founder, 2026-10-18: "take my approval beofre proceeding, you can show what your plan
  is and then only proceed". Corrections to the plan count as "not yet": fold them in and show it again.
  Name the files, the components reused, and any open decision with your recommendation.
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
   - The PR isn't a draft, its title has no "DO NOT MERGE", and the issue isn't parked (e.g. under UNI-73).
   - Every `blockedBy` issue is Done (merged and deployed), so multi-repo features land in dependency order.
   - No other deploy is running in this repo (`gh run list -R <owner/repo> --limit 3`: nothing in progress).
   - Nothing the deploy needs is missing: an env var or secret, a migration, a manual step. Never merge first
     and fix production after.
2. **Merge** into the repo's deploy branch (ul-langgraph → `dev`, the rest → `main`):
   `gh pr merge <n> -R <owner/repo> --merge --delete-branch`. If the safety check blocks it, ask the human
   "OK to merge PR #<n> into <branch>? It deploys to production." and merge after they say yes.
3. **Watch the deploy:** `gh run watch <run id> -R <owner/repo> --exit-status`. If it fails: read the log, tell
   the human, post a CHECKPOINT and stop (don't merge anything else). unilytics-mcp has no deploy; publishing to
   npm is manual, so say so.
4. **Deploy check, every change except docs-only.** Exercise the changed behaviour on the DEPLOYED version yourself:
   call the live endpoint or MCP tool the change touches with a test account or project (never real customer
   data, never anything that charges, emails customers or deletes), confirm the response is what the Acceptance
   criteria expect, and check the Lambda error count for ~10 minutes after the deploy. Post the commands and
   real responses (secrets masked) as a `DEPLOY CHECK` comment. Failed → tell the human and fix forward or ask
   about reverting; don't move on.
   Timing checks (UNI-81): every merge, docs-only included, redeploys the Lambda and makes every container
   cold, so run "after N min idle" checks at least that long after the **last** merge to the repo. Numbers
   measured from outside India include ~0.45 s of TCP+TLS on a fresh connection; report first-call and warm
   (connection reused) separately, and read server time from `Server-Timing` or CloudWatch.
5. **Test prompt.** If the change can be seen or used by a person (app.unilytics.ai, the MCP tools from Claude,
   an email, an export), post a `TEST PROMPT` comment on the issue and print the same prompt here in ONE copyable
   block, for the human to paste into Claude in Chrome:
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
6. **Wait for the results in this tab.** The human pastes Chrome's report plus their own feedback. Then:
   - Post it verbatim as a `TEST RESULT` comment.
   - All pass → move the issue to Done, final WORKLOG update, and tell the human "Done — you can close this tab."
   - Fails or feedback → treat the feedback as human corrections (route by kind, see the top of this skill),
     fix it on a new branch, open a PR, and go back to 1, with a new TEST PROMPT. Small unrelated follow-ups →
     new issue instead.
