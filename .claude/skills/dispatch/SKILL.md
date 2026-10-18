---
name: dispatch
description: Product manager and orchestrator for parallel Claude sessions — reads the plan, ranks Linear issues by what gets a real user value fastest, picks unblocked non-overlapping ones (always 1–2 core-product issues running), checks each is ready to start cold, and prints the commands to launch one worker session per issue. Also merges worker handoff learnings into CLAUDE.md and plan docs. Use when the user says "dispatch", "what should run next", "plan today's sessions" or "/dispatch".
argument-hint: "[max sessions, default 5] [--conserve]"
---

# Dispatch parallel sessions

Run this in its **own `dispatch` worktree** of ul-langgraph (the plan lives there), in plan mode:
`cd ~/dev/ul-langgraph && claude -w dispatch "/dispatch"`. Start by updating it to the latest deploy branch
(`git fetch origin && git merge --ff-only origin/dev`, or `git reset --hard origin/dev` if the worktree has no
unpushed doc edits). This session plans and dispatches; it does not implement issues. Process: `docs/sop/parallel-claude-sessions.md`; Linear write rules:
`docs/sop/linear-workflow.md`; command list: `docs/sop/claude-commands.md`; runners: `docs/sop/model-runners.md`.
This session always runs on Opus: `univ` by default (plain `claude` = `claude-univ`), or `claude-ul` (Opus on the
Unilytics Max account) when the Univsense weekly limit is used up. Never launch it with `claude-local` (not Opus)
or `claude-univ-api` (it would spend the API credit on planning). It is also the session that runs the Opus review
gate on local PRs (step 3b), which is why it must be Opus.
`--conserve` = the Univsense Max limit is low: recommend `ul` first, then `univ-api`, and `local` only for small
private jobs (step 2c).

## 0. Be the product manager: read the plan, then rank by user value

This session is the PM, not only a scheduler. The goal is a user who is happy with the product, as fast as
possible.

- **Read the plan first, every run.** Plans change daily, so an earlier read doesn't count. Read the master plan
  (`docs/plans/pivot-consultant-skill-platform.md`) in full. Then read the plan of every Linear project that has a
  candidate issue: the `## Plan` section of the project description names its file or Linear document. New projects
  bring new plan files. If a project names none, ask the human for it before you dispatch its issues.
- **North star:** the design partner uses the product every working day (GTM project). **Near-term KPI:** the P1
  goal. A new consultant signs in, connects their AI with one URL and runs a universal skill on a project in under
  2 minutes. Judge every issue by how directly it moves a real user toward that. The wave table's Why column says
  what the user gets ("Kevin can …"), not what the code does.
- **Ship small and early** (YC: "launch something bad quickly", ship once it has "a quantum of utility"). Prefer the
  slice a user can try this week over the complete version. Split a big issue so its first sub-issue ships
  something usable. Where a backend already exists, use live data, not dummy data.
- **Grade each candidate** (Adora Cheung's weekly method). Impact on the KPI: high, medium or low. Size: easy (one
  session), medium (two sessions) or hard (more, so split it). Dispatch high-impact easy first, then high-impact
  medium, then the rest. Never dispatch low-impact hard work.
- **What users hit first jumps the queue:** a failed `TEST RESULT`, founder feedback on a live screen, or a bug on
  the first-use path (sign-in, connect your AI, first skill run).
- **Do things that don't scale.** Prefer a manual step that unblocks a user today over building its automation
  (invoice by hand, grant credits through the admin path, onboard the partner on a call). Defer scale, generality and
  polish until a user needs them (provisioned concurrency, region moves, lint gates for skills nobody publishes
  yet).
- **Avoid fake work.** Refactors, doc trims, branch pruning and tooling are filler. They take free slots, never the
  place of core work.

**Wave mix (every wave):**
- **Keep 1–2 core-product issues running at all times**, counting those already In Progress. Core means what a
  consultant touches: the MCP gateway and onboarding, skills and the Skill Library, the Context Manager, app screens
  and their speed. If no core issue is dispatchable (conflicts, thin spec, blocked), say why and fix that first:
  split it, write the spec, or post the `QUESTION`.
- **Fill the other slots with important non-core work**, in this order:
  1. P0 security that exposes users' data or credits.
  2. Correctness of money and schedules (e.g. credit expiry).
  3. Cleanup (archive repos, move code out, prune branches).
  Don't let it crowd out core, and don't leave it out either.
- Chores the human has explicitly parked stay out until they ask for them.

## 1. Gather state (Linear MCP)

- `list_issues` team `UNI`, state `In Progress` and `In Review` → what is already running / waiting on review.
- Issues whose latest comments include a `TEST PROMPT` but no later `TEST RESULT` → report them under **Waiting for
  your UI test** (issue, one line on what to test, the relaunch command if the worker tab is gone).
- `list_issues` team `UNI`, state `Todo` (current cycle first, then the active projects' Todo).
- For each candidate: `get_issue` to read labels, repo, `blockedBy`, parent/sub-issues.
- Repos: `ul-langgraph` (deploys from `dev`), `ul-backend`, `ul-frontend`, `unilytics-mcp` (the
  `@unilytics/mcp-server` npm bridge) — all others deploy from `main`.
- Runner capacity: `curl -s 127.0.0.1:8080/health` (local model up? max 2 local workers at once — count
  In Progress issues whose latest claim/`Started` comment says `runner local`); `univ-api` needs a non-empty
  `~/.claude/profiles/.anthropic-api-key` (`test -s`); `ul` needs its separate login in `~/.claude-unilytics`.

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
5. Rank with step 0: P0 security that exposes users' data or credits first, then core issues by impact × size
   (the earliest milestone breaks ties), then the other non-core work. Check the wave mix before you show it.

Classify In Progress issues by their latest comment:
- **Resume** — last comment is `CHECKPOINT` (session stopped cleanly) → print a resume command.
- **Stale** — no comment and no new commit on its branch for > 24 h → ask the human: resume, reassign to a
  new session (starts from the branch + last comment), or move back to Todo (post `RELEASED — stale`).
- **Running** — recent `Started`/`Claimed by`/`CHECKPOINT` < 24 h → leave alone.
- **Escalated** — the last `CHECKPOINT` says `ESCALATE: needs opus` → recommend relaunching on an Opus runner
  (`claude-univ`, or `claude-ul` / `claude-univ-api` with `--conserve`; same worktree name), and show the
  one-line reason from the checkpoint.
- **Never launched** — the last comment is still `DISPATCHED`, with no `Started` and no worktree, after a
  few hours → print the launch command again, or ask whether to release it (`RELEASED — not launched`,
  back to Todo).

Also flag: issues labelled **Needs input** (show each `QUESTION:` so the human can answer with
`ANSWER: …` and remove the label), PRs waiting in review (the human's queue), and anything In Progress with no activity for a day.

### 2c. Recommend a runner per issue (`docs/sop/model-runners.md` has the full rules)

You **recommend**; the human **decides** (step 2d).
Read the **Current status** and **Trial log** in `docs/sop/model-runners.md` first: they override the guide below.

- A `Runner: univ|ul|univ-api|local` line in the issue description wins.
- A runner the human sets for a period ("everything on ul until univ resets tomorrow") comes next and applies to
  every issue, resumes and relaunches included, until the date they gave. Record it under **Current status** in
  `model-runners.md` with that end date.
- **univ** (default): everything, while the Univsense Max limit lasts.
- **ul**: Opus on the Unilytics Max login; first overflow when Univsense is low.
- **univ-api**: Opus on the Univsense API credit ($200/month, resets monthly); second overflow.
- univ, ul and univ-api are all Opus: normal PR, self-review, no review gate.
- **local**: well-specified Chore/Docs/Bug/Improvement with a runnable Verify, ≲150 changed lines, ≲5 files.
  Removing hardcoded secrets is fine here (nothing leaves the Mac). Max 2 at once; server must be up.
  Never security logic, payments, data deletion, migrations, cross-repo contracts, research/design or thin
  specs.
- Use the trial log in `model-runners.md` (what each runner got right or wrong) to sharpen recommendations.
  `--conserve`: recommend ul instead of univ, then univ-api once ul is low too; local only for small private jobs.

### 2d. Confirm the wave with the human (always — never skip)

Show one table and **stop until the human answers**:

| Issue | Repo | Title | Type | Impact × size | Recommended runner | Why (what the user gets) | ⚠ |
|---|---|---|---|---|---|---|---|

Type is `core`, `security` or `non-core`. Above the table, give one line on the wave mix (core issues running +
proposed) and the plan sections the wave moves. Under it: the local server status, how many local workers are already running, and "Reply `go`, or change
runners / drop issues (e.g. `UNI-23 ul, drop UNI-54`)". Apply the edits, show the final table again if
anything changed, and only then claim and print commands (step 3). Nothing is claimed before `go`.

## 3. Output launch commands

**Claim at dispatch time, after the human's `go`** (avoids two sessions racing for the same issue): for each chosen issue,
`save_issue` (assignee `me`, state `In Progress`) and comment
`DISPATCHED to <repo> session · runner <univ|ul|univ-api|local> · <ISO timestamp>`. Then print, grouped by repo (resumes use the same command —
it reopens the existing worktree/branch). Never tell a worker to run git in other repos' local clones.
A `claude -w` session can't do that, so cross-repo git-only work goes through `gh api` (see SOP rule 3b):

```
cd ~/dev/<repo> && claude-univ -w uni-123 "/work-on UNI-123"       # runner univ (Opus, Univsense Max)
cd ~/dev/<repo> && claude-ul -w uni-124 "/work-on UNI-124"         # runner ul (Opus, Unilytics Max)
cd ~/dev/<repo> && claude-univ-api -w uni-125 "/work-on UNI-125"   # runner univ-api (Opus, API credit)
cd ~/dev/<repo> && claude-local -w uni-126 "/work-on UNI-126"      # runner local (Qwen on this Mac)
```

(Or background: same prefix with `--bg "/work-on UNI-123"` and watch them in `claude agents`.)
The four commands are shell wrappers in `~/.local/bin` that set `UL_RUNNER` (and the login or `--settings`
profile; setup in `docs/sop/model-runners.md`). Always print the runner's own command, never plain `claude`,
so the worker knows its runner. Resumes and fix-list relaunches keep the issue's runner and print the same
command; if the last `CHECKPOINT` says `ESCALATE: needs opus`, relaunch with `claude-univ` (or `claude-ul` /
`claude-univ-api` if Univsense is low).

### 3b. Opus review gate (every local PR; univ, ul and univ-api are Opus and skip it)

Local workers open **draft** PRs and say `runner local` in their handoff. For each such issue in
In Review: run `/code-review <PR url>` here (Opus) against the issue's Acceptance criteria and the handoff's
Verify evidence.
- Clean → `gh pr ready <n> -R <owner/repo>`, then do `/work-on` step 10 for it here: merge gate, merge, watch
  the deploy, smoke check, `TEST PROMPT`. The human pastes the test results back in this tab.
- Problems → comment `REVIEW — fix list` (numbered) on the issue, move it back to In Progress and print a
  relaunch command: same runner for small fixes, an Opus runner (`claude-univ`, or `claude-ul` /
  `claude-univ-api` if Univsense is low) if the approach is wrong.
- Append a row to the trial log in `docs/sop/model-runners.md` (date, issue, runner, outcome, notes).
- If the review found a local mistake a guardrail could have blocked, propose the exact
  `~/.claude/hooks/runner-guard.py` change in your report for the human to approve. Never edit it unasked.
Merge at most one PR per repo at a time, and wait for its deploy before the next.

## 4. Fold in learnings (end of day: the founder says "winding up", or when asked)

This is the only time the main plan (git + its Linear document) changes. Build the update from the handoffs:
`Changed`, `Plan changes` and Follow-ups go into the plan sections they name, plus the progress markers.
Workers update dev docs (CLAUDE.md, SOPs, architecture, skills) in their own PRs; fold in only what they
left in the handoff. Sync any git design doc a worker changed into its Linear document.

- Read handoff comments on issues updated since the last dispatch (`list_issues updatedAt -P1D`). Include
  In Progress issues too: a worker blocked on a `QUESTION` posts its `Handoff` while the issue stays In Progress.
- Read each handoff's Learnings and the WORKLOG gotchas. Fold each one into the **existing section** of its
  target file (CLAUDE.md rule, SOP step, skill step, architecture doc). Don't append dated "learnings"
  blocks, and remove an old note when a newer one supersedes it. Human corrections become concrete rules or
  steps, worded as the human confirmed them.
- Runner learnings (what local got wrong, what it did well) go in `docs/sop/model-runners.md`.
- Put each learning in its home: `CLAUDE.md` (rules), `docs/sop/*`, `docs/architecture/*`,
  `docs/plans/*`, or a skill file. Keep `CLAUDE.md` short — move detail to SOPs.
- Learnings for another repo (e.g. ul-backend `CLAUDE.md`): this session can't run git there, so use the
  GitHub API (SOP rule 3b): fetch the file from its deploy branch, edit it, then create blob → tree →
  commit → ref → PR in one call sequence, after checking the remote blob sha still matches what you edited.
  Shared files (`work-on`, `dispatch`, `update-learnings` skills, `docs/sop/linear-workflow.md`,
  `parallel-claude-sessions.md`, `claude-commands.md`) must stay identical across the four repos.
- Worktrees that can be deleted: run `git worktree list` here, and `ls ~/dev/<repo>/.claude/worktrees` for
  the other repos. A worktree can go once its issue is Done (PR merged); keep it while the issue is In
  Progress or In Review.
- **Keep the plan current** (`docs/plans/pivot-consultant-skill-platform.md`). Do this at the end of the day,
  and whenever this run sees issues that moved to Done:
  - **Progress:** for each issue Done since the last update, find the plan section it implements (issues cite
    it, e.g. "Plan §9") and mark it in place, right under that section's heading:
    `✅ Completed <YYYY-MM-DD>: UNI-x (PR <repo>#n)` when every issue for that section is Done, or
    `🟡 In progress: UNI-x done; UNI-y, UNI-z open` while some are still open. Update the marker; don't stack them.
  - **Direction changes:** when the human changes the plan (an `ANSWER`, a correction, a new decision, scope
    added or dropped), rewrite the affected section so it says what we do now, and add one line under it:
    `Changed <YYYY-MM-DD>: <what and why> (UNI-x)`. Don't append dated addenda at the end, and don't leave
    the old text in place.
  - Keep the "Progress at a glance" table at the top of the plan in sync: one row per numbered section, with
    status (not started / in progress / completed <date>) and its open issues.
  - Then sync the Linear team document "Pivot plan — consultant skill platform" to match.
- Commit these doc changes on a `docs/` branch and open one PR.
