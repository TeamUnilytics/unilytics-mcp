---
name: ship
description: Push the current issue branch and open a PR to the deploy branch with the Linear issue id in the title, so Linear moves the issue to In Review. Use when an issue's work is verified and ready for review.
disable-model-invocation: true
argument-hint: [optional PR title override]
---

# Ship

## 1. Pre-flight

```bash
git status
git log --oneline -5
```

- No uncommitted changes (ask before committing anything left over).
- Current branch is an issue branch (`uni-123-…`), not `main` / `dev`.
- Issue id = the `uni-NNN` prefix of the branch, upper-cased (`UNI-123`).

## 2. Target branch

- **ul-langgraph:** `dev`
- **ul-backend, ul-frontend, ul-vercel-chat, unilytics-mcp:** `main`

## 3. Push and open the PR

```bash
git push -u origin <branch>
gh pr create --base <target> --title "UNI-123: <summary>" --body "$(cat <<'EOF'
## Summary
<2–3 bullets>

## Linear
Fixes UNI-123

## Verify
<command → result from the issue's Verify section>

## Docs
<docs-public/ pages changed, or "none (internal change)">

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

`$ARGUMENTS`, if given, replaces the title summary (keep the `UNI-123:` prefix).

## 4. Confirm

Print the PR URL, the target branch, and: **merging this PR deploys to production.** Merge one PR per repo
at a time and check the deploy (`/aws-status`, Vercel/Firebase) before the next. Linear moves the issue to
Done on merge to `dev`/`main`.
