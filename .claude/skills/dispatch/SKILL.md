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

## Talking to the founder (every message, this skill and its workers)

The founder runs several companies and has little time:
- **Short.** Lead with the answer, then a table or bullets. No essays. Cut anything that isn't a decision, a
  result or an action for them.
- **Never a bare issue id.** Every issue mention says what it is in plain words and why it matters:
  `UNI-107 (Brand Kit backend: stores each client's voice and rules) — so Claude writes in the client's
  voice`. Same for projects, PRs and tools.
- **Ask for one thing at a time,** with a recommended default they can accept with one word.

## 0. Be the product manager: read the plan, then rank by user value

This session is the PM, not only a scheduler. The goal is a user who is happy with the product, as fast as
possible.

- **Read the plan first, every run.** Plans change daily, so an earlier read doesn't count. Read the master plan
  (`docs/plans/pivot-consultant-skill-platform.md`) in full. Then read the plan of every Linear project that has a
  candidate issue: the `## Plan` section of the project description names its file or Linear document. New projects
  bring new plan files. If a project names none, ask the human for it before you dispatch its issues.
- **Use the product before you rank anything.** Priorities come from using it, not from reading the backlog.
  The founder: "I open up the product and click Context and it says coming soon. Obvious then." Run the
  walkthrough (step 0b) every night at wind-up, or first thing in the morning if the night run didn't happen. A
  core screen that says "coming soon", breaks, or is slow is the top candidate for the wave.
- **North star:** the design partner uses the product every working day (GTM project). **Near-term KPI:** the P1
  goal. A new consultant signs in, connects their AI with one URL and runs a universal skill on a project in under
  2 minutes. Judge every issue by how directly it moves a real user toward that. The wave table's Why column says
  what the user gets ("Kevin can …"), not what the code does.
- **Ship small and early** (YC: "launch something bad quickly", ship once it has "a quantum of utility"). Prefer the
  slice a user can try this week over the complete version. Split a big issue so its first sub-issue ships
  something usable. Where a backend already exists, use live data, not dummy data.
- **Grade each candidate with ICE**, the pre-PMF scale (Adora Cheung's weekly method; RICE needs usage data we don't
  have yet).
  - **Impact** on the KPI: high, medium or low.
  - **Confidence** that it delivers that impact: high when a user asked for it or hit the bug; low when it rests on
    our own guess.
  - **Ease**: easy (one session), medium (two sessions) or hard (more, so split it).
  Dispatch high-impact easy first, then high-impact medium, then the rest. Never dispatch low-impact hard work.
  Scores are input, not the decision: say when judgment overrides them, and keep this one scale instead of
  switching frameworks.
- **Split by user value, not by layer** (Humanizing Work splitting patterns). Cut a big issue along the user's
  journey: workflow steps, rule or data variations, one external dependency at a time (e.g. OAuth for claude.ai,
  then ChatGPT, then Desktop), or the simple case before the hard one. Each slice must give a user something they
  can try. Within a slice, the repo rule still applies: one issue per repo, with the contract issue blocking its
  consumers. Splitting often exposes slices nobody needs, so drop them rather than queue them. When the unknowns are
  too big to split, dispatch a small spike that answers the riskiest question with the cheapest probe.
- **Turn feedback into issues by its job, not its wording.** Separate what the founder or user literally asked for
  from the outcome they're after. Write the outcome as the issue's Outcome, the hard requirements as Acceptance
  criteria, and how they'll judge it as Verify. Mark anything you inferred as an assumption in the issue so the
  human can correct it.
- **Flag the one-way doors.** In the ⚠ column, mark decisions that are hard to undo: auth model, data schema,
  public repos, anything outward-facing. Name any assumption that would flip the ranking. Take two-way doors fast.
- **What users hit first jumps the queue:** a failed `TEST RESULT`, founder feedback on a live screen, or a bug on
  the first-use path (sign-in, connect your AI, first skill run).
- **Do things that don't scale.** Prefer a manual step that unblocks a user today over building its automation
  (invoice by hand, grant credits through the admin path, onboard the partner on a call). Defer scale, generality and
  polish until a user needs them (provisioned concurrency, region moves, lint gates for skills nobody publishes
  yet).
- **Avoid fake work.** Refactors, doc trims, branch pruning and tooling are filler. They take free slots, never the
  place of core work.

**Wave mix (every wave):**
- **Keep 1–2 core-product issues running at all times**, counting those already In Progress. Core means the
  reason a consultant comes back every day: the Context Manager (Context, Brand Kit, Design System, Knowledge Base),
  the skills (Skill Library, project skills, later the Skill Lab agents), and the MCP that serves both into their
  AI. Onboarding and speed get them in the door and count too, but they rank below the differentiator once
  sign-in works. Rank by why the user stays, not only whether they can get in.
- **Core work that isn't dispatchable gets fixed in the same run, never skipped** (2026-10-18: the Context
  Manager was passed over for being too big and cross-repo). Split it by user value (contract issue first,
  one issue per repo), write the missing spec, or post the `QUESTION`. Then show the human the slice you can
  start now. If two core slices collide only on repo + Area, but their files don't overlap (e.g. a new folder),
  propose a founder exception rather than waiting. Record the exception in the issue.
- **Fill the other slots with important non-core work**, in this order:
  1. P0 security that exposes users' data or credits.
  2. Correctness of money and schedules (e.g. credit expiry).
  3. Cleanup (archive repos, move code out, prune branches).
  Don't let it crowd out core, and don't leave it out either.
- Chores the human has explicitly parked stay out until they ask for them.

### 0b. Product walkthrough + gap check (daily: nightly at wind-up, else first thing in the morning)

**Why it's a checklist, not a look-around.** A builder who opens the product every day stops seeing it. Two
things cause this. The *curse of knowledge*: you know how a screen is meant to work, so you fill its gaps without
noticing. *Habituation*: what you see daily fades into the background. Together they're called operational
blindness (German *Betriebsblindheit*). A new user hits the gaps on the first click. The dispatcher has read every
issue, so it has the worst case of this. Willpower doesn't fix it; a checklist and fresh eyes do. A "light run"
(screen texts only, one account, no shipped list) doesn't count as the day's walkthrough (founder, 2026-11-01).

Setup: load the Claude in Chrome tools (`claude-in-chrome` skill; one ToolSearch for the core set plus
`read_console_messages`, `read_network_requests`, `gif_creator`, `javascript_tool`), open a new tab and record a
GIF. Sign in to https://app.unilytics.ai yourself: "Continue with Google", then the account in Google's chooser,
then any consent screen. Unilytics is an MVP with no users yet, so every sign-in click is your job, not the
founder's (founder, 2026-10-24 and 2026-10-31); only a password, 2FA code or CAPTCHA prompt goes to them. A blocked
sign-in is the first finding to fix. The extension must be allowed on accounts.google.com and auth.unilytics.ai,
or the account chooser click is refused (2026-11-01). Parallel sessions share one Chrome profile: note which
account is signed in before and after, and switch back if you changed it. Real data stays read-only: never pay,
delete real data, change settings or send anything to people. Test data is fine: write it into the Simbex
project, name it TEST or "walkthrough", and say in the write-up what you left behind.

**The founder watches the run live (2026-11-01), so the order matters:**
1. First, **what shipped**, one item at a time on screen, with one line each in the terminal as you go
   ("UNI-95 Projects search: '1 of 22' ✅").
2. Then **the new-guy audit**, which they may not watch. It uses real actions on test data: upload a file and
   search for it, export or download a skill, open every menu and dialog, load collaborators, and press buttons to
   find ones that do nothing or aren't needed any more (2026-11-01: the header Publish).

1. **Shipped since the last walkthrough: every item, tested live.** Build this list before you open the app:
   - Merged PRs since the last entry's date, in all four repos:
     `gh pr list -R TeamUnilytics/<repo> --state merged --search "merged:>=YYYY-MM-DD" --limit 50` for
     `MVP-V1.0.0-`, `Unilytics.ai.server`, `Unilytics.ai.UI` and `unilytics-mcp`.
   - Issues Done since then: `list_issues state:Done completedAt:<date>`.
   - One row per change: what a user should now see or be able to do, and where (screen, API or MCP tool).
     Backend and MCP changes get a row too; test them through the screen or tool that uses them.
   Check every row on prod. A row is ✅ only when you saw it working. Mark it ❌ broken, ⚠ partly, or "not
   testable read-only" with the reason, and get that one tested by its issue's worker or a TEST PROMPT.
2. **Two passes, two kinds of eyes.**
   - **New-user pass (fresh eyes).** Spawn a subagent with no project context. Give it only the persona ("an SEO
     consultant with 8 clients who uses Claude daily and has never seen Unilytics"), the URL, the new-user test
     account (the near-empty one used for first-use tests, e.g. team+uni24-test@unilytics.ai), and a job
     ("get keyword research done for one client"). Don't give it the plan, the issues or the screen list. At every
     step it answers the cognitive-walkthrough questions: would I know what to do here? Can I see the control?
     Does its label match my goal? Do I understand what happened after I clicked? It reports every hesitation,
     guess, dead end and word it didn't understand, timed against the P1 KPI (connect your AI and run a skill in
     under 2 minutes).
   - **Daily-user pass (yours):** savenjudes@gmail.com, with its real data (58 skills, real projects), on every
     screen below plus the shipped list.
3. **Every screen, every state, the same checklist.** Screens:
   - Projects list, then a project's nav items: Overview, Context, Brand Kit, Design System, Knowledge Base,
     Skills → a folder → a skill and its file panel, Channels, AEO.
   - The global items: Skill Library, Agent Inbox, Personal Context, Design System, Connect your AI / API Keys,
     and every user-menu item (Profile, Settings: Billing, Usage, Collaborators, API Keys; Upgrade plan,
     Documentation, credit balance).
   - The marketing site (unilytics.ai), with its privacy and terms pages.
   For each screen:
   - **Speed:** first load and reload, timed. Over 2 s is slow. Note skeletons or wrong values while it loads
     (e.g. credits showing 0.00).
   - **Errors:** `read_console_messages` (onlyErrors) and `read_network_requests` (any 4xx/5xx, any call over
     1 s, duplicate calls).
   - **States:** empty, populated, loading and error (only an error you can trigger read-only, such as a bad deep
     link). Then deep-link to the page, reload it, and press Back.
   - **Every control:** hover or read every button, link and menu. Open the non-destructive ones. Note dead links,
     buttons that do nothing, and "Contact sales" or "coming soon" where a user expects the thing itself.
   - **Copy:** jargon, internal ids, typos, and names that differ between the nav, page title, docs and MCP tool.
   - **Looks and access:** light and dark theme, ~390 px width, keyboard focus, contrast.
   - **Heuristics:** judge "confusing" against Nielsen's 10 usability heuristics, and name the one it breaks.
4. **Backend and MCP pass** (the same day, for the walkthrough window and since the last entry):
   - `/aws-status`: Lambda errors, throttles and duration for both functions, recent error logs.
   - LangSmith `UnilyticsMCP`: errored and slow traces since the last walkthrough
     (`langsmith trace list --since …`).
   - From this session's own Unilytics MCP connection, if one is loaded: `tools/list` count against CLAUDE.md,
     `find_skill` on 3 Kevin-style tasks (is the right skill top-1?), `list_skills`, `get_skill`,
     `get_project_context` on a test project, and `get_credit_balance`. Read-only and free tools only.
5. **Grade:** works · broken · "coming soon" · slow (> 2 s) · confusing (heuristic named) · paper cut (small,
   but a new user would notice).
6. **Then look past what's built (avoid tunnel vision).** Compare against:
   - the plan's IA (§2) and each active project's "Done when";
   - the P1 KPI flow end to end (sign up → connect your AI → run a universal skill on a project);
   - what Profound and AirOps offer for the same job (`docs/research/competitor-context-map.md`).
   List what's missing that a consultant would expect on day one.
7. **Write it up** in the Linear document "Product walkthrough", newest date on top, in this order:
   - the shipped table (✅/❌/⚠ per row);
   - one table per screen (FE);
   - backend and MCP findings;
   - the new-user pass (where it hesitated, with times);
   - paper cuts;
   - gaps;
   - the ranked top 3 to fix.
   Every finding gets a home: search for an existing issue first, then add it there or create an issue in the
   Standard task format. Bugs go to the right project, gaps to their plan section. Batch paper cuts into one
   issue per repo ("Paper cuts <date>").
8. Use the result as the first input to step 2. A broken or "coming soon" core screen, a ❌ shipped row, or a
   new-user dead end outranks anything a user can't see.

### 0c. Autopilot queue: work that runs while the founder is away (every evening, before wind-up)

Founder time is the bottleneck. Measured 2026-10-18: build time is about an hour, but issues waiting on them sat
10–17 h. So each evening, before wind-up:
1. **Shortlist up to 8 candidates** that a worker could finish without the founder. Each needs:
   - a complete spec and a Verify an agent can run;
   - no human-only step (keys, consoles, payments, a design call);
   - no open `QUESTION`;
   - no one-way door left undecided.
   For each, also list the one decision that would unlock it, if any.
2. **Ask once, in one short table:** `Issue (what, why) · what the worker will do · the limits · your call`.
   Ask any unlocking questions in the same message. Default: approve the ones marked ✅.
3. **On approval:** add the label **Autopilot** to each. Add a line under its Context:
   `Autopilot — approved by founder <date>: <scope and limits as approved>`. Then claim it and print the launch
   commands as usual. Prefer the background form (`--bg`) so they run overnight.
4. **Report every run and every morning,** one line from `list_issues label:Autopilot`:
   `Autopilot: N running · N merged (deploy-checked) · N waiting on you (QUESTION / TEST PROMPT) · N released`.
   Name the waiting ones with what they are and why.

### 0d. Velocity and dates, from agent data (at wind-up; quoted in every wave)

The work is done by agents, so estimate from **our measured agent times**, never from human-team norms.
- **Measure from Linear** (`list_issues state:Done`, `startedAt`, `completedAt`, `createdAt`):
  - **build time:** `startedAt` → the PR merge or Handoff;
  - **cycle time:** `startedAt` → `completedAt`;
  - **lead time:** `createdAt` → `completedAt`;
  - **founder wait:** time from a `TEST PROMPT`, `QUESTION` or plan shown until the reply;
  - **throughput:** issues Done per day.
  Report medians by Area, and keep build time and founder wait apart. They have different fixes.
- **Dates:** for each active milestone, estimate the time left as open issues × median build time ÷ parallel
  sessions, plus the expected founder wait. If that lands well before the target date, propose pulling the date
  in. If it lands after, propose the delay and its cause. Change a date (`save_milestone`) only after the founder
  OKs it, and add a `Changed <date>` line in the plan.
- **What the founder sees in Linear:**
  - a project update on each active project at wind-up (`save_status_update`, health onTrack / atRisk /
    offTrack). The body starts with `**Dispatch update**` and then has 3 lines: done today, next, risk. The founder
    posts their own project updates too (new ideas, priority changes). Every run, read the updates that don't
    start with `Dispatch update` (`get_status_updates`) as founder input, alongside this terminal;
  - milestone target dates on the Projects timeline;
  - Insights (Business plan) on a custom view (`Cmd+Shift+I`: cycle time and lead time scatter, issue count by
    status).

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
5. Rank with step 0: P0 security that exposes users' data or credits first, then core issues by ICE
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

**On the MVP, these are not human-only.** Workers do them and log the before value, the after value and how to
undo it:
- config changes on our own consoles;
- low-risk deletions: test data, or config confirmed unused.
See `/work-on` → "MVP: make the console change yourself" (founder, 2026-10-31). Don't plan these as founder steps.

**Human-only steps:**
- money;
- deleting real users' or clients' data or production infrastructure;
- a secret you don't hold;
- granting access;
- terms or a beta application;
- a password, 2FA code or CAPTCHA.

Open each one in Chrome
yourself, on the right screen, with every field you can fill already filled. Then ask the founder only for the step
Claude may not do: type a password, 2FA code or CAPTCHA (sign-in clicks on app.unilytics.ai are Claude's), pay,
paste a secret, or press the final Submit. Name the tab and the button. Never
send them a list of instructions to follow (founder, 2026-10-24: "open everything, prefill possible details and
only assign the smallest of step that the claude cant do to me"; full rule in `/work-on` → "Handing the founder a
step").

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

| Issue | Repo | Title | Type | ICE (I/C/E) | Recommended runner | Why (what the user gets) | ⚠ |
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
cd ~/dev/<repo> && claude-univ -w uni-123 "/work-on UNI-123"
cd ~/dev/<repo> && claude-ul -w uni-124 "/work-on UNI-124"
cd ~/dev/<repo> && claude-univ-api -w uni-125 "/work-on UNI-125"
cd ~/dev/<repo> && claude-local -w uni-126 "/work-on UNI-126"
```

Runners: univ = Opus on Univsense Max · ul = Opus on Unilytics Max · univ-api = Opus on the API credit ·
local = Qwen on this Mac. **Never put a trailing `# comment` on a printed command.** Interactive zsh has
no comments by default, so `#` and `(…)` get parsed as glob syntax and the paste fails with
`zsh: number expected` (2026-10-24). Put each issue's label on its own line or in a table, outside the
code block.

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
  the deploy, smoke check, then the live test in Chrome yourself (`/work-on` step 10.5). Hand a `TEST PROMPT`
  to the human only when Chrome can't run it.
- Problems → comment `REVIEW — fix list` (numbered) on the issue, move it back to In Progress and print a
  relaunch command: same runner for small fixes, an Opus runner (`claude-univ`, or `claude-ul` /
  `claude-univ-api` if Univsense is low) if the approach is wrong.
- Append a row to the trial log in `docs/sop/model-runners.md` (date, issue, runner, outcome, notes).
- If the review found a local mistake a guardrail could have blocked, propose the exact
  `~/.claude/hooks/runner-guard.py` change in your report for the human to approve. Never edit it unasked.
Merge at most one PR per repo at a time, and wait for its deploy before the next.

## 4. Fold in learnings (end of day: the founder says "winding up", or when asked)

Run the product walkthrough (step 0b) first, so tomorrow's wave starts from what the product actually does.
Then ask for the night's Autopilot queue (step 0c), and post the velocity numbers and project updates (step 0d).

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
