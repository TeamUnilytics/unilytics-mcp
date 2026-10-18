# Running parallel Claude Code sessions

How we build: one human (reviewer/merger) + many Claude Code sessions, coordinated through Linear.
Researched 2026-10-13 (Anthropic Claude Code docs on worktrees / agent view / cross-session messaging,
Boris Cherny's published workflow, Simon Willison on parallel agents). Companion: `docs/sop/linear-workflow.md`.

## The model

- **Dispatch queue, not 10 steered chats.** ~5 sessions writing code at once, plus extra slots for
  research, spikes and docs. The limit is how fast the human can review and merge, not compute.
- **One issue = one session = one worktree = one branch = one PR**, sized to one session's context window
  with one runnable Verify check (<~400 changed lines).
- **Linear is the lock and the message bus.** A session claims an issue (assignee + In Progress + claim
  comment) before editing, and leaves a handoff comment when it opens the PR.
- **Every merge to `dev` (ul-langgraph) or `main` (other repos) deploys to production.** Merge one PR per
  repo at a time; check the deploy before the next.

## Terminal or VS Code?

Drive sessions from the **terminal** (CLI has `--worktree`, `--bg`, `claude agents` agent view and every
slash command); review diffs in **VS Code** or the desktop app. The VS Code extension is fine for a single
interactive session but lacks some CLI features. Claude Code on the web / cloud sessions work for
code-only issues; keep anything that touches Mongo/Atlas or AWS on local sessions (IP allow-lists).

## One-time setup (per repo)

1. `.claude/worktrees/` in `.gitignore` (done in the workflow PR).
2. `.worktreeinclude` lists `.env` / `.env.*` so worktrees get local secrets (done).
3. Each worktree builds its own deps: `uv venv && uv pip install -r requirements.txt` (ul-langgraph) or
   `npm ci` (Node repos). If two sessions run local servers, give each its own `PORT`. If you skip
   `npm ci`, nothing fails: a worktree under `.claude/worktrees/` silently uses the main checkout's
   `node_modules`, which may be stale.
4. Worktrees branch from the remote default branch: ul-langgraph → `dev`, others → `main` (= deploy
   branches; no config needed).

## Roles

| Session | Where | Does |
|---|---|---|
| **Dispatcher** (`/dispatch`) | its own `dispatch` worktree in ul-langgraph (`claude -w dispatch "/dispatch"`), plan mode | Reads Linear, picks unblocked non-overlapping issues, fixes thin issues, prints launch commands, updates the main plan from the handoffs at wind-up |
| **Worker** (`/work-on UNI-123`) | its own worktree in the issue's repo | Claims, implements, verifies, updates public docs, opens PR, posts handoff |
| **Human** | anywhere | Prioritises, reviews PRs, merges, does credential/console tasks |

Only the dispatcher edits the **main plan** (`docs/plans/pivot-consultant-skill-platform.md` and its Linear document
"Pivot plan — consultant skill platform"), at wind-up. Workers keep the dev docs current themselves
(`CLAUDE.md`, `docs/sop/*`, `docs/architecture/*`, skills; `/update-learnings` is fine) in their own PR,
merging `origin/<deploy>` before shipping to avoid conflicts, and write plan-level changes under
`Plan changes` in their handoff for the dispatcher (founder, 2026-10-18).

## Runners (univ, ul, univ-api, local)

Workers can run on Opus on the Univsense Max account (`claude-univ`, the default; same as plain `claude`),
Opus on the Unilytics Max account when Univsense is low (`claude-ul`), Opus on the $200/month API credit as a
second overflow (`claude-univ-api`), or a local Qwen model on this Mac for small private jobs
(`claude-local`). The dispatcher always runs on Opus: univ by default, `claude-ul` when Univsense is used up. It recommends a runner per issue, you confirm the wave,
and it reviews every local PR (Opus) before you do; the three Opus runners skip that review. Daily steps: `docs/sop/daily-routine.md`. Rules,
privacy limits and machine setup: `docs/sop/model-runners.md` (UNI-62).

## Launching workers

```bash
cd ~/dev/<repo> && claude -w uni-123 "/work-on UNI-123"     # foreground tab per issue
claude --bg "/work-on UNI-123"                              # background; watch with `claude agents`
```

Name terminal tabs by issue id. Sessions can warn each other with cross-session messages (e.g. "API
contract changed — rebase"), but durable facts go in the Linear issue.

## Is there a published standard for this?

No (researched 2026-10-13). Formal standards (AGENTS.md, A2A task states, MCP Tasks) don't cover agents
claiming work from a shared backlog; vendor docs cover their own products (only Claude Code *agent teams*
prescribes claiming + dependencies, and it is experimental, not worktree-isolated and has no resume);
community tools (Steve Yegge's beads, Backlog.md, Task Master) and practitioners (Simon Willison, Pragmatic
Engineer, Every) agree on the pieces used here: one task = one context window = one PR, never start blocked
work, an orchestrator that owns shared docs, ~3–5 concurrent agents, serial human merges, a "needs input"
state. Linear stays the source of truth; we borrow beads' ideas (ready queue, discovered-from issues,
claiming through the dispatcher) rather than adopting another tracker.

## Coordination rules

1. **Blocked = don't start.** Workers stop if any `blockedBy` issue isn't Done.
2. **No two sessions in the same repo + Area, or with overlapping `Expected files:`.** Worktrees stop edit
   collisions, not merge conflicts — the dispatcher checks file overlap when picking a wave.
   **A shared root cause found mid-session** (e.g. UNI-56 and UNI-81 both hit the dead-Redis stall and both
   fixed `redisClient.js`): the first session to post its `FINDINGS` comment owns the shared file; the other
   checks the sibling issue's comments before editing it, and takes the owner's version after it merges.
2b. **Claims:** `/dispatch` claims at launch (`DISPATCHED …`); manual starts claim-then-verify. Sessions
   stopping early post `CHECKPOINT` and keep the issue; next day it's a **resume** on the same branch;
   > 24 h silent = **stale**, the human decides.
3. **Cross-repo features are split per repo.** The issue that defines the contract (API, schema, MCP tool
   signature) blocks its consumers.
3b. **A `claude -w` session can only run git in its own worktree.** It refuses `git -C <other repo>` and
   `cd <other repo> && git …`. For work across repos with no code change (tags, branch pruning,
   archiving), use the `gh api` git endpoints (`repos/<org>/<repo>/git/tags` + `git/refs`). Any work
   that changes files needs one session per repo. (UNI-15, 2026-10-14.)
3c. **Verify against a baseline.** If the deploy branch already has failing tests, list the failures on
   the base branch and on the PR branch and compare them. The bar is "0 new failures", not "all green"
   (e.g. ul-backend `main` had 28 failing suites on 2026-10-14). Run tests on the production Node
   version (`npx -p node@20 …`), not the local Node 26.
4. **Discovered work → new issue,** linked `relatedTo` / `blockedBy`, in the right project. Steps of the
   same outcome → sub-issues of the current issue.
5. **Abandon freely.** If a session goes sideways, close it, comment what was learned, re-dispatch with a
   sharper issue (expect 10–20% of sessions to be thrown away).

## Daily cycle

1. **Plan (≈30 min):** `/dispatch` → wave 1 of ~5 issues + research/spike slots.
2. **Build:** workers run; the human answers questions and reviews as PRs arrive.
3. **Review + merge:** fresh-context review already run by the worker; human reads the diff + Verify
   evidence, merges one PR per repo, watches the deploy (`/aws-status`, Firebase).
4. **Wave 2:** `/dispatch` again with what's unblocked.
5. **End of day:** prune merged worktrees (`git worktree prune`), sweep Linear statuses, `/dispatch` folds
   handoff learnings into docs.

Weekly: Linear cycle (1 week, starts Monday) — move unfinished work, update project status, re-date
milestones based on actual pace.

## Timelines

Plan in days, not human-team weeks: implementation by parallel sessions is fast; the real constraints are
human review/merge throughput, founder-only tasks (credentials, consoles, sales) and production risk.
Re-date milestones weekly from observed throughput.
