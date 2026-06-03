---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
argument-hint: [optional message override]
description: Create a git commit matching this repo's terse style
---

## Context

- `git status` → !`git status`
- `git diff HEAD` → !`git diff HEAD`
- Current branch → !`git branch --show-current`
- Recent commits (style reference) → !`git log --oneline -10`

## Your task

Create a single commit for the staged + unstaged changes shown above.

If `$ARGUMENTS` is non-empty, use it as the commit message verbatim. Otherwise, draft a message that matches the style visible in `git log` above:

- Terse, lowercase, imperative ("add SMTP configuration", "fix /epos-login 404")
- **No** Conventional-Commits prefix (`feat:` / `fix:` / `chore:`) — this repo doesn't use them
- One-line subject under ~72 chars
- Optional body explaining the WHY only when the change isn't self-evident
- End with the Co-Authored-By trailer

Use a HEREDOC for the commit message:

```sh
git commit -m "$(cat <<'EOF'
<subject>

<optional body>

Co-Authored-By: Shin
EOF
)"
```

Then run `git status` to confirm the commit landed.

**Do NOT** stage with `git add -A` or `git add .` — name the files explicitly to avoid accidentally including `.env`, build artifacts, or secrets.
