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

## 0. Which runner am I? (`docs/sop/model-runners.md`)

Run `echo "${UL_RUNNER:-opus}"`. `opus` = Claude on the Max login (plain `claude`); `local` = Qwen on this Mac
(`claude-local`); `glm` = Z.ai GLM (`claude-glm`). Put `runner <name>` in every Linear comment you post
(`Started`, `Claimed by`, `CHECKPOINT`, `Handoff`). If you are **not** opus:
- Linear tools come from the `linear` MCP server, not the claude.ai connector. No Linear tools → stop and
  tell the human to run `/mcp` and log in to `linear`.
- **glm only:** if the issue touches secrets, `.env*`, credentials, client/customer data or prod data
  exports, it was misrouted — post `RELEASED — misrouted to glm (sensitive data)` and stop. Never `cat`
  `.env` files or paste keys in any runner.
- Stay inside the issue's `Expected files:`. Needing other files is a `QUESTION`, not a judgment call.
- **Escalate, don't loop:** if Verify still fails after two fix attempts, you repeat the same action three
  times, or you are unsure of the approach — commit WIP, push, post
  `CHECKPOINT — … ESCALATE: needs opus — <why>`, add label **Needs input**, and stop.

## 1. Read the issue (Linear MCP)

- `get_issue` for `$ARGUMENTS` (load Linear tools via ToolSearch `select:` first if deferred).
- Note: project, milestone, labels (Area), `blockedBy`, parent, `gitBranchName`, comments.
- If it is a **parent issue** with open sub-issues, work on the first unblocked sub-issue instead, or
  break it down (step 4) if it has none.
- **Resuming?** If the issue is already In Progress, read the comments from the newest backwards:
  - Latest is `DISPATCHED …` for this repo, or a `CHECKPOINT` / `Claimed by` from an earlier session that
    the human asked you to resume → this is a resume: reuse the same branch, read the last CHECKPOINT,
    continue from its "Next step".
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

## 4. Load context — only what the issue links

- Read this repo's `CLAUDE.md` (auto-loaded) and the plan/design **sections** the issue cites
  (`docs/plans/pivot-consultant-skill-platform.md`, `docs/brainstorms/pivot-context-manager-design.md`).
- Do not read whole plan files end to end unless the issue asks for it.
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
- Run the issue's **Verify** command/check. Paste the result into the handoff. No green Verify = not done.
- Run a fresh-context review of the diff against the Acceptance criteria (`/code-review` or a review
  subagent) before opening the PR. On local/glm this review uses the same model, so the dispatcher still
  runs the Opus review gate afterwards.

## 7. Docs in the same PR (definition of done)

- User-facing change (MCP tool, behaviour, pricing, setup) → update `docs-public/` (once it exists;
  until then note "docs: TODO" in the handoff) and add a dated changelog entry.
- Internal learnings (gotchas, architecture) → put them in the **handoff comment**, not in shared docs.
  Only the dispatcher/orchestrator session edits `CLAUDE.md` and `docs/plans/*` to avoid merge conflicts
  between parallel sessions.

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
  Learnings for CLAUDE.md/docs: <… or none>
  Runner notes (local/glm only): <where the model struggled or did well, or none>
  ```
- New bugs or follow-ups you found → new issues in the right project, linked `relatedTo`/`blockedBy`.
- Never merge to the deploy branch yourself unless the user says so — merging deploys to production.
