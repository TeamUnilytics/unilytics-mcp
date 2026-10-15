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
1. **Before reading any code:** post `Started · runner <runner> · branch <branch> · <ts>`, then post the
   **WORKLOG** comment (step 3b) and keep its comment id.
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
- Don't re-run a slow full test suite to read a different slice of its output. Save it once
  (`--json --outputFile=…` or `> log`) and read the file.

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

Run `echo "${UL_RUNNER:-opus}"`. `opus` = Claude on the Max login (plain `claude`); `local` = Qwen on this Mac
(`claude-local`); `glm` = Z.ai GLM (`claude-glm`). Put `runner <name>` in every Linear comment you post.
Not opus → Linear comes from the `linear` MCP server (claude.ai connectors don't load). No Linear tools →
stop and tell the human: "run `claude mcp login linear`, then relaunch".

## 1. Read the issue (Linear MCP)

- `get_issue` for `$ARGUMENTS` (load Linear tools via ToolSearch `select:` first if deferred).
- Note: project, milestone, labels (Area), `blockedBy`, parent, `gitBranchName`, comments.
- If it is a **parent issue** with open sub-issues, work on the first unblocked sub-issue instead, or
  break it down (step 4) if it has none.
- **Resuming?** If the issue is already In Progress, read the comments from the newest backwards:
  - Latest is `DISPATCHED …` for this repo, or a `CHECKPOINT` / `Claimed by` from an earlier session that
    the human asked you to resume → this is a resume: reuse the same branch, read the last CHECKPOINT
    **and the WORKLOG** (step 3b), continue from its "Next step".
  - Latest CHECKPOINT says `ESCALATE: needs opus` and you are opus → this is a hand-back. Read the WORKLOG's
    dead ends and gotchas first so you don't repeat them, review the WIP commits on the branch, then
    continue. Start a fresh WORKLOG for your session (the old one stays as history).
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

## 4. Load context

- Read this repo's `CLAUDE.md` (auto-loaded) and the plan/design sections the issue cites
  (`docs/plans/pivot-consultant-skill-platform.md`, `docs/brainstorms/pivot-context-manager-design.md`).
- Then read whatever else you need to do the job well — related code, tests, other docs, related issues and
  their handoffs. The issue's `Expected files:` line is for collision checks, not a fence.
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

- Plan first (plan mode for anything non-trivial), then implement in small commits.
- Run the issue's **Verify** command/check. Paste the **actual command and its output** (trimmed) into the
  handoff — measured, not claimed. No green Verify = not done.
- Run a fresh-context review of the diff against the Acceptance criteria (`/code-review` or a review
  subagent) before opening the PR. On local/glm this review uses the same model, so the dispatcher still
  runs the Opus review gate afterwards.

## 7. Docs in the same PR (definition of done)

- User-facing change (MCP tool, behaviour, pricing, setup) → update `docs-public/` (once it exists;
  until then note "docs: TODO" in the handoff) and add a dated changelog entry.
- Internal learnings (gotchas, architecture) → put them in the **handoff comment**, not in shared docs.
  Only the dispatcher/orchestrator session edits `CLAUDE.md` and `docs/plans/*` to avoid merge conflicts
  between parallel sessions.

## 7b. Hand back to Opus (local / glm only)

Hand back instead of grinding when: the same problem survives two different fix attempts; you notice
you're repeating an action; you're unsure the approach is right; or the human types "escalate". Then:
1. Commit WIP and push the branch. Update the WORKLOG (what you tried, why it failed, your best guess).
2. Post `CHECKPOINT — … · runner <runner> … ESCALATE: needs opus — <one-line why>` (format in step 8).
3. Tell the human in this terminal, exactly:
   > Handing this to Opus. Type `/exit`, then in this same tab run:
   > `cd ~/dev/<repo> && claude -w <worktree-name> "/work-on UNI-123"`
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
  **Not opus:** open it as a draft (`gh pr create --draft …`, or `gh pr ready <n> --undo` right after
  `/ship`). The dispatcher's Opus review marks it ready for the human.
- `save_comment` handoff on the issue:
  ```
  Handoff — PR <url> · runner <opus|local|glm>
  Changed: <2–4 bullets>
  Verify: <command> → <result>
  Risks / deploy notes: <…>
  Follow-ups: UNI-x (created), …
  Learnings (from the WORKLOG, each with where it belongs):
    Gotchas: <what — root cause — fix/rule — target file>
    Human corrections: <what — rule — target file>
    Decisions / dead ends worth keeping: <…>
  Runner notes (local/glm only): <where the model struggled or did well, or none>
  ```
  The dispatcher folds these into the target file's existing section (no dated addenda). Write each so it
  makes sense to someone who never saw this session.
- New bugs or follow-ups you found → new issues in the right project, linked `relatedTo`/`blockedBy`.
- Never merge to the deploy branch yourself unless the user says so — merging deploys to production.
