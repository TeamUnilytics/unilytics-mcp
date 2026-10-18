# Linear workflow (replaces Jira)

Workspace `univsense`, team **Univsense (`UNI`)**, Free plan (250-issue cap, no initiatives — upgrade at
first hire). Set up 2026-10-13 following Linear's own method plus small-team guidance (Langfuse handbook,
Shape Up). How parallel Claude sessions use it: `docs/sop/parallel-claude-sessions.md`.

## Where things live

| What | Where |
|---|---|
| Plan (master) | `ul-langgraph/docs/plans/pivot-consultant-skill-platform.md` → mirrored as Linear team doc "Pivot plan — consultant skill platform" (Univsense → Documents) |
| Context Manager design (master) | `ul-langgraph/docs/brainstorms/pivot-context-manager-design.md` → mirrored as P2 project doc |
| Backlog and status | Linear only — never duplicate issue lists in repo files |
| Old Jira tickets (UMVP-*) | Read-only history |

## Structure

| Linear object | We use it for | Rule |
|---|---|---|
| Team | `UNI` — one team | Sub-teams only when there is an org chart |
| Project | One per phase/outcome: P0 Safety & cleanup, P1 Shell + Skill Library, P2 Context Manager, P3 Skill Lab, P4 Channels, GTM Design partner | Lead, dates, status, short brief linking the repo spec |
| Milestone | 2 stages inside each project | Grows past ~2 weeks → convert to its own project |
| Issue | One outcome, one PR, sized to **one session's context window + one runnable Verify check** | Standard task format (below); Context includes `Expected files:` |
| Sub-issue | Steps discovered once work starts | Create when starting the parent, not up front |
| Cycle | 1 week, starts Monday | The week's focus list; unfinished work carries over |

**Just-in-time breakdown:** only the next 1–2 phases are broken into issues; later phases hold a "write the
spec" issue + a spike until they start.

## Standard task format (Linear default template "Standard task")

```
## Outcome              what is true when done
## Context              files, links, plan section — enough for a session to start cold
                        + `Expected files:` the files/dirs this issue will change (collision check)
## Acceptance criteria  checklist
## Verify               a command/check that passes or fails
## Out of scope         what not to touch
```

**Definition of done:** Verify passes, fresh-context review done, public docs updated in the same PR for
user-facing changes, handoff comment posted, PR merged and deploy checked.

## Rules for Claude sessions writing to Linear (read before creating or changing anything)

1. **Search before you create.** `list_issues` with `query:` on the key words (and the project) — if a
   matching issue exists, comment on it or add a sub-issue instead of creating a duplicate.
2. **Where new issues go:** the project for that phase; the earliest milestone it fits; state `Backlog`
   (or `Todo` only if it's for the current phase and unblocked). No project fits → leave it without a
   project; the dispatcher triages it.
3. **Every issue uses the Standard task format** (Outcome / Context / Acceptance criteria / Verify / Out
   of scope), exactly one **Area** label + one **Kind** label, a priority, and assignee `me`.
4. **Context must let a fresh session start cold:** file paths, plan/design section names, related
   issue ids, PR links. Never "see above" or "as discussed".
5. **Relations, not prose:** dependencies → `blockedBy`/`blocks`; same topic → `relatedTo`; steps of one
   outcome → sub-issue (`parentId`); duplicates → `duplicateOf`.
6. **One issue per repo** for cross-repo work; the contract issue (API / schema / MCP tool signature)
   blocks its consumers.
7. **Status moves:** a session moves only the issue it claimed. Todo → In Progress when claiming; In
   Review comes from the PR; Done comes from the merge. Never move or edit an issue another session has
   claimed (assigned + In Progress) — comment instead.
8. **Comment formats** (so other sessions can parse them):
   Every worker comment names its runner (`univ`, `ul`, `univ-api` or `local`; see `docs/sop/model-runners.md`).
   - `DISPATCHED to <repo> session · runner <runner> · <ISO timestamp>` (dispatcher claims after the human's `go`)
   - `Claimed by Claude session · runner <runner> · repo <repo> · branch <branch> · <ISO timestamp>` (manual start)
   - `Started · runner <runner> · branch <branch> · <ISO timestamp>`
   - `WORKLOG · runner <runner> · branch <branch> · started <ts>`: **one living comment per session, edited
     in place**, with Plan / Progress / Decisions / Dead ends / Gotchas / Human corrections (format in
     `/work-on` step 3b)
   - `CHECKPOINT — <ISO timestamp> · runner <runner> · branch <branch> @ <sha>` + Done so far / Next step / Open questions
   - `CHECKPOINT … ESCALATE: needs opus — <why>` (a local worker handing back; relaunch on Opus)
   - `REVIEW — fix list` (the dispatcher's Opus review of a local PR found problems)
   - `RELEASED — <reason>` (gives the issue back; move to Todo)
   - `Handoff — PR <url> · runner <runner>` + Changed / Verify (real command + output) / Risks / Follow-ups /
     Learnings sorted by kind (Gotchas, Human corrections, Decisions/dead ends), each with its target file
   - `DEPLOY CHECK` (the worker's own check of the change on the deployed version: commands + real responses)
   - `TEST RESULT · run by worker in Chrome · <sha>` (the worker's own live test in Claude in Chrome, step by step,
     with GIF/screenshots; work-on step 10.5) → Done, or a fix PR and a re-test
   - `TEST PROMPT · <issue> · deployed <sha> to <where>`: only when the worker can't run the test itself (Chrome
     unavailable, needs Claude Desktop for MCP, or a founder judgment call). The founder's report then comes back as
     `TEST RESULT` (verbatim)
   - `QUESTION: <one clear question>` + options considered + what is blocked
   - `ANSWER: <answer>` (from the human or the dispatcher)
9. **Never delete issues, projects or documents.** Cancel with a comment explaining why.
10. **Docs mirrors:** only the dispatcher edits the main plan (`docs/plans/pivot-consultant-skill-platform.md`
    and its Linear document) and syncs the Linear design documents, at wind-up. Workers write plan-level
    changes under `Plan changes` in their handoff (section, change, the founder's exact words), even if the
    founder asks them to edit the plan mid-session. Dev docs (CLAUDE.md, SOPs, architecture) are the
    workers' to update in their own PR.
11. **Verify every write.** `save_issue` can silently do nothing: it returns the *old* description and the
    old `updatedAt`, with no error (2026-10-18, UNI-61). Seen with `patch` (`replace_range` never applied)
    and with some full-description writes. Check `updatedAt` in every response; if it didn't move, resend the
    full `description` (rewording the text has fixed it), then re-read the issue. Documents: the same check
    on `save_document`'s `updatedAt`.
12. **Merged ≠ Done.** The GitHub integration doesn't always move the issue when the PR merges. After the
    merge (and, for visible changes, the passing `TEST RESULT`), check the status and set it yourself.
13. **Big documents:** `get_document` on the pivot plan (~90k characters) overflows the tool result into
    a file. Read the `content` field from that file with `python3 -I -c 'import json,sys;
    print(json.load(open(sys.argv[1]))["content"])' <file>` and read the sections you need.

## Claims, multi-day work and stale issues

- **Linear is not an atomic lock** (assign, status and comment are separate writes; every session is the
  same Linear user). So: `/dispatch` claims at launch (`DISPATCHED …`), and manual starts use
  claim-then-verify (post the claim, re-read comments, back off if an earlier live claim exists).
- **Stopping before done:** push WIP to the branch, post `CHECKPOINT`, leave the issue In Progress.
- **Next day:** the dispatcher lists it as **resume**; `claude -w uni-123 "/work-on UNI-123"` reopens the
  same worktree/branch and continues from the last CHECKPOINT (`claude --continue` inside that worktree
  restores the old conversation if you want it).
- **Stale:** In Progress with no comment or commit for > 24 h → the dispatcher asks the human to resume,
  reassign or release it. A session never takes over another session's claim without the human's OK.

## When a session has a doubt

- **First look it up:** the issue's Context links → the plan section (`docs/plans/pivot-consultant-skill-platform.md`
  / Linear doc "Pivot plan — consultant skill platform") → the design doc → `docs/sop/*` → comments on
  related/blocking issues.
- **Still unsure and it changes the outcome:** post `QUESTION: …` on the issue, add the label
  **Needs input**, and ask the human directly in that session's terminal. Keep working on anything the
  question doesn't block; otherwise stop and say so.
- **Live coordination:** local sessions can message each other (Claude Code cross-session messaging), e.g.
  "contract for UNI-36 changed — rebase". Anything durable still goes into the Linear issue.
- **The dispatcher** lists `Needs input` issues at every `/dispatch` and the human answers there
  (`ANSWER: …`, remove the label). Answers that change the plan are folded into the plan doc.

## Labels

- **Area** (exactly one): Backend, Frontend, MCP, Infra, Docs, Research — also the parallel-session
  collision unit.
- **Kind:** Feature, Improvement, Bug, Security, Chore, Spike.
- Phase = project, owner = assignee, urgency = priority. Never encode those as labels.

## Statuses and GitHub automation

Backlog → Todo → In Progress → In Review → Done (Canceled / Duplicate).
- Branch = issue `gitBranchName` (format `uni-123-short-title`).
- PR title starts `UNI-123:`; body includes `Fixes UNI-123`. PR opened → In Review; merged into `dev` or
  `main` → Done (default merge action is "No action" for other branches).

## Skills

| Skill | Use |
|---|---|
| `/dispatch` | Orchestrator: pick the next wave of issues, print launch commands, fold learnings into docs |
| `/work-on UNI-123` | Worker: claim → implement → verify → docs → PR → handoff |
| `/ship` | Push + PR with the Linear id |
| `/idea` | Capture an idea as a Backlog issue |

All commands: `docs/sop/claude-commands.md`.

Retired: `/jira-*`, `/new-feature` (replaced by `/work-on`).

## Not set up yet (on purpose)

Estimates, SLAs, triage rotation, multiple teams, custom statuses, initiatives (paid). Add at first hire:
Basic/Business plan, Triage, project updates, guests for contractors.
