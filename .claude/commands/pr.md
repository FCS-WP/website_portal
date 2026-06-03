---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git push:*), Bash(gh pr:*)
argument-hint: [optional PR title override]
description: Draft + open a GitHub PR for the current branch
---

## Context

- Working tree → !`git status`
- Branch → !`git branch --show-current`
- Recent commits on this branch → !`git log --oneline origin/main..HEAD`
- Full diff vs main → !`git diff origin/main...HEAD`
- Upstream status → !`git rev-list --left-right --count origin/main...HEAD`

## Your task

Draft and open a GitHub PR for the current branch.

### Step 1 — Sanity checks

- If the working tree has uncommitted changes, STOP and tell the user to commit (or use `/commit`) first.
- If `git log origin/main..HEAD` is empty, STOP — there's nothing to PR.
- If the branch isn't pushed yet, push it: `git push -u origin <branch>`.

### Step 2 — Draft the PR

Look at the full commit list and diff above (not just the latest commit) to understand the full scope.

- **Title**: short, lowercase, imperative, under ~70 chars — match the style of recent commits in this repo (`git log --oneline` shows the pattern). If `$ARGUMENTS` is non-empty, use it as the title.
- **Body** uses this exact shape:

```markdown
## Summary
- <1–3 bullets, each describing one meaningful change>

## Test plan
- [ ] <concrete check the reviewer can run>
- [ ] <e.g. visit /epos-login → loads branded page>
- [ ] <e.g. SMTP test send returns 200>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Skip the test-plan checkbox if the change is docs-only.

### Step 3 — Open the PR

Use `gh pr create` with a HEREDOC for the body:

```sh
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
...

## Test plan
- [ ] ...

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL printed by `gh pr create`.

### Skip these defaults

- Do NOT run `npm test` / `prettier` / `composer test` — this project uses Docker; CI runs the test suite. Don't try to run it locally.
- Do NOT amend or squash existing commits.
- Do NOT push to main — open a PR from the current feature branch only.
