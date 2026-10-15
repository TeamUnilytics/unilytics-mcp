---
name: dispatch
description: Orchestrator for parallel Claude sessions — reads the current Linear cycle, picks unblocked non-overlapping issues, checks each is ready to start cold, and prints the commands to launch one worker session per issue. Also merges worker handoff learnings into CLAUDE.md and plan docs. Use when the user says "dispatch", "what should run next", "plan today's sessions" or "/dispatch".
argument-hint: "[max sessions, default 5] [--conserve]"
---

# Dispatch parallel sessions

Run this in its **own `dispatch` worktree** of ul-langgraph (the plan lives there), in plan mode:
`cd ~/dev/ul-langgraph && claude -w dispatch "/dispatch"`. Start by updating it to the latest deploy branch
(`git fetch origin && git merge --ff-only origin/dev`, or `git reset --hard origin/dev` if the worktree has no
unpushed doc edits). This session plans and dispatches; it does not implement issues. Process: `docs/sop/parallel-claude-sessions.md`; Linear write rules:
`docs/sop/linear-workflow.md`; command list: `docs/sop/claude-commands.md`; runners: `docs/sop/model-runners.md`.
This session always runs on Opus (plain `claude`, Max login) — never launch it with `claude-local`/`claude-glm`.
`--conserve` = the Max weekly limit is low: route every eligible issue to `glm`/`local` (step 2c).

## 1. Gather state (Linear MCP)

- `list_issues` team `UNI`, state `In Progress` and `In Review` → what is already running / waiting on review.
- `list_issues` team `UNI`, state `Todo` (current cycle first, then the active projects' Todo).
- For each candidate: `get_issue` to read labels, repo, `blockedBy`, parent/sub-issues.
- Repos: `ul-langgraph` (deploys from `dev`), `ul-backend`, `ul-frontend`, `unilytics-mcp` (the
  `@unilytics/mcp-server` npm bridge) — all others deploy from `main`.
- Runner capacity: `curl -s 127.0.0.1:8080/health` (local model up? max 2 local workers at once — count
  In Progress issues whose latest claim/`Started` comment says `runner local`); `glm` is only available if
  `grep -q PASTE_ZAI_API_KEY_HERE ~/.claude/profiles/glm.json` finds **nothing** (the placeholder means no key yet).

## 2. Pick the wave (default max 5 writing sessions; spikes/research/docs can be extra)

An issue is dispatchable only if:
1. Every `blockedBy` issue is Done.
2. No running issue shares its **repo + Area** label **and** no running issue lists overlapping files /
   directories (each issue's Context has an `Expected files:` line — add it if missing).
2b. It fits **one session's context window with a runnable Verify check** (that is the size unit, not
   "a day"). Bigger → sub-issues.
3. It has Outcome, Context (files/links), Acceptance criteria and Verify. If not, fix the issue text first
   (`save_issue`) — a worker must be able to start cold.
4. It is ~a day of work. Bigger → break into sub-issues now.
5. Prefer the earliest milestone; P0 security before anything else.

Classify In Progress issues by their latest comment:
- **Resume** — last comment is `CHECKPOINT` (session stopped cleanly) → print a resume command.
- **Stale** — no comment and no new commit on its branch for > 24 h → ask the human: resume, reassign to a
  new session (starts from the branch + last comment), or move back to Todo (post `RELEASED — stale`).
- **Running** — recent `Started`/`Claimed by`/`CHECKPOINT` < 24 h → leave alone.
- **Escalated** — the last `CHECKPOINT` says `ESCALATE: needs opus` → recommend relaunching on opus (plain
  `claude`, same worktree name), and show the one-line reason from the checkpoint.
- **Never launched** — the last comment is still `DISPATCHED`, with no `Started` and no worktree, after a
  few hours → print the launch command again, or ask whether to release it (`RELEASED — not launched`,
  back to Todo).

Also flag: issues labelled **Needs input** (show each `QUESTION:` so the human can answer with
`ANSWER: …` and remove the label), PRs waiting in review (the human's queue), and anything In Progress with no activity for a day.

### 2c. Recommend a runner per issue (`docs/sop/model-runners.md` has the full rules)

You **recommend**; the human **decides** (step 2d).
Read the **Current status** and **Trial log** in `docs/sop/model-runners.md` first: they override the guide below.

- A `Runner: opus|local|glm` line in the issue description wins.
- **opus** (default): security fixes that change auth/permissions/data-access logic; payments, data deletion,
  migrations, breaking deploys; cross-repo contracts; Research/Spike/design; Needs input; thin specs; > ~400
  changed lines.
- **local**: well-specified Chore/Docs/Bug/Improvement with a runnable Verify, ≲150 changed lines, ≲5 files.
  Removing hardcoded secrets is fine here (nothing leaves the Mac). Max 2 at once; server must be up.
- **glm**: same eligibility as local with no size cap (big mechanical cleanups). Don't recommend it for
  anything touching secrets, `.env*`, credentials, client/customer data or prod data exports, and flag ⚠
  if the human picks it anyway.
- Use the trial log in `model-runners.md` (what each runner got right or wrong) to sharpen recommendations.
  `--conserve`: recommend glm/local for everything eligible; opus only for what must be opus.

### 2d. Confirm the wave with the human (always — never skip)

Show one table and **stop until the human answers**:

| Issue | Repo | Title | Recommended runner | Why | ⚠ |
|---|---|---|---|---|---|

Under it: the local server status, how many local workers are already running, and "Reply `go`, or change
runners / drop issues (e.g. `UNI-23 opus, drop UNI-54`)". Apply the edits, show the final table again if
anything changed, and only then claim and print commands (step 3). Nothing is claimed before `go`.

## 3. Output launch commands

**Claim at dispatch time, after the human's `go`** (avoids two sessions racing for the same issue): for each chosen issue,
`save_issue` (assignee `me`, state `In Progress`) and comment
`DISPATCHED to <repo> session · runner <opus|local|glm> · <ISO timestamp>`. Then print, grouped by repo (resumes use the same command —
it reopens the existing worktree/branch). Never tell a worker to run git in other repos' local clones.
A `claude -w` session can't do that, so cross-repo git-only work goes through `gh api` (see SOP rule 3b):

```
cd ~/dev/<repo> && claude -w uni-123 "/work-on UNI-123"         # runner opus
cd ~/dev/<repo> && claude-local -w uni-124 "/work-on UNI-124"   # runner local (Qwen on this Mac)
cd ~/dev/<repo> && claude-glm -w uni-125 "/work-on UNI-125"     # runner glm (Z.ai)
```

(Or background: same prefix with `--bg "/work-on UNI-123"` and watch them in `claude agents`.)
`claude-local` / `claude-glm` are shell wrappers that add the runner's `--settings` profile and
`worker-mcp.json` (setup in `docs/sop/model-runners.md`). Resumes keep the issue's runner unless the last
`CHECKPOINT` says `ESCALATE: needs opus` — then relaunch with plain `claude`.

### 3b. Opus review gate (every non-opus PR)

Non-opus workers open **draft** PRs and say `runner local|glm` in their handoff. For each such issue in
In Review: run `/code-review <PR url>` here (Opus) against the issue's Acceptance criteria and the handoff's
Verify evidence.
- Clean → print `gh pr ready <n> -R <owner/repo>` for the human and list the PR in the review queue.
- Problems → comment `REVIEW — fix list` (numbered) on the issue, move it back to In Progress and print a
  relaunch command: same runner for small fixes, plain `claude` (opus) if the approach is wrong.
- Append a row to the trial log in `docs/sop/model-runners.md` (date, issue, runner, outcome, notes).
Then the review order: merge at most one PR per repo at a time and check the deploy before the next.

## 4. Fold in learnings (end of day, or when asked)

- Read handoff comments on issues updated since the last dispatch (`list_issues updatedAt -P1D`). Include
  In Progress issues too: a worker blocked on a `QUESTION` posts its `Handoff` while the issue stays In Progress.
- Read each handoff's Learnings and the WORKLOG gotchas. Fold each one into the **existing section** of its
  target file (CLAUDE.md rule, SOP step, skill step, architecture doc). Don't append dated "learnings"
  blocks, and remove an old note when a newer one supersedes it. Human corrections become concrete rules or
  steps, worded as the human confirmed them.
- Runner learnings (what local/glm got wrong, what they did well) go in `docs/sop/model-runners.md`.
- Put each learning in its home: `CLAUDE.md` (rules), `docs/sop/*`, `docs/architecture/*`,
  `docs/plans/*`, or a skill file. Keep `CLAUDE.md` short — move detail to SOPs.
- This session can't commit to other repos. If a learning is specific to another repo (e.g. ul-backend),
  add it to the Context of that repo's next open issue, so the next worker sees it. Also list it on
  UNI-54 (CLAUDE.md trim) so it reaches that repo's `CLAUDE.md`.
- Worktrees that can be deleted: run `git worktree list` here, and `ls ~/dev/<repo>/.claude/worktrees` for
  the other repos. A worktree can go once its issue is Done (PR merged); keep it while the issue is In
  Progress or In Review.
- If the plan changed, update `docs/plans/pivot-consultant-skill-platform.md` and sync the Linear team
  document "Pivot plan — consultant skill platform".
- Commit these doc changes on a `docs/` branch and open one PR.
