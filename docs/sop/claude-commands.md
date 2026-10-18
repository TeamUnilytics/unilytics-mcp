# Claude Code commands (cheat sheet)

If anyone asks "what commands should I know?", answer from this file. Skills live in each repo's
`.claude/skills/`; a few exist only in ul-langgraph (marked ⓛ).

## The two you use every day

| Command | Where | What it does |
|---|---|---|
| `/dispatch` | Terminal: `cd ~/dev/ul-langgraph && claude -w dispatch "/dispatch"` (its own worktree; always the default univ login) | Orchestrator: reads Linear, picks the next wave of unblocked, non-overlapping issues, prints one launch command per issue, answers/routes open questions, folds handoff learnings into docs |
| `/work-on UNI-123` | A worker session, started with `cd ~/dev/<repo> && claude-univ -w uni-123 "/work-on UNI-123"` (or another runner's command, below) | Claims the issue in Linear, works in its own worktree, verifies, updates docs, ships the PR, posts a handoff |

Workers run on one of four runners, each with its own command: `claude-univ` (Opus on the Univsense Max
account, the default; same as plain `claude`), `claude-ul` (Opus on the Unilytics Max account, overflow),
`claude-univ-api` (Opus on the $200/month API credit, second overflow) or `claude-local` (Qwen on this Mac,
small private jobs). `/dispatch` recommends one per issue and waits for your `go`; use `/dispatch --conserve`
when the Univsense limit is low. `claude auth status` shows which account a tab is on. See
`docs/sop/model-runners.md`.

## Shipping and capture

| Command | What it does |
|---|---|
| `/ship` | Push the issue branch, open the PR (`UNI-123:` title) to `dev` (ul-langgraph) or `main` (others) |
| `/idea <text>` | Capture an idea as a Linear Backlog issue in the right project |
| `/update-learnings` | End-of-session: route gotchas/corrections to the right doc. Workers may run it for dev docs (CLAUDE.md, SOPs, architecture, skills), never for the main plan (the dispatcher updates that at wind-up) |

## Quality and review

| Command | What it does |
|---|---|
| `/consult-the-council` | Send a spec, plan, diff or bug to OpenAI (GPT-6 Astra), Grok 4.7, Gemini 3.1 Pro and Perplexity for an independent production-bar review (`--low/--medium/--high`, `--check`). **Required** by `/work-on` before building important work (security, billing, data model, contracts, one-way doors); also when stuck |
| `/review` | Pre-PR review against developer standards |
| `/code-review` | Built-in diff review for bugs (fresh context) |
| `/security-review` | Security review of the pending changes |
| `/tdd` | Write failing tests first, then implement |
| `/verify` | Prove a change works before calling it done |

## Production and data

| Command | What it does |
|---|---|
| `/aws-status` | Lambda errors/duration, SQS depth, latest deploy, recent errors |
| `/debug-production` ⓛ | Systematic prod debugging: LangSmith → CloudWatch → billing → Mongo |
| `/neon-query` | Query Neon Postgres (ul-langgraph; ul-vercel-chat is archived) |

## LangSmith (agents and evals)

| Command | What it does |
|---|---|
| `/langsmith-trace` | Query/export traces |
| `/langsmith-dataset` | Build eval datasets |
| `/langsmith-evaluator` | Build evaluators / run evaluations |
| `/langsmith-audit` ⓛ | Audit one trace against prompt rules |
| `/langsmith-weekly-audit` ⓛ | Weekly trace triage → Linear issues |
| `/langsmith-skill-optimizer` ⓛ | Improve a skill from real user feedback |
| `/langsmith-agent-optimizer` ⓛ | Iterate on an agent with LangSmith experiments |

## Retired (2026-10-13)

`/jira-backlog`, `/jira-create`, `/jira-query`, `/jira-transition`, `/new-feature` — replaced by Linear,
`/work-on` and `/dispatch`.

## Built-in Claude Code commands worth knowing

`/mcp` (check connectors), `/agents`, `claude agents` (dashboard of background sessions), `claude -w <name>`
(start in a new worktree), `claude --bg "<prompt>"` (background session), `/doctor`, `/clear`, plan mode
(Shift+Tab).
