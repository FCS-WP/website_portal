---
name: code-review
description: Review all uncommitted code changes for quality, bugs, security, and consistency before committing. Use when the user asks to review changes, says /code-review, or wants to check code quality before commit.
---

# Code Review

Review all uncommitted changes in the working directory before commit.

## Workflow

1. Run `git diff --stat` to get an overview of changed files
2. Run `git diff` to get the full diff content
3. For new/untracked files, run `git status` and read the new files
4. Analyze each change for:

## Review Criteria

### Critical (must fix)
- Logic bugs or incorrect behavior
- Security vulnerabilities (SQL injection, XSS, auth bypasses, exposed secrets)
- Data loss risks
- Breaking API contract changes without migration

### Important (should fix)
- Missing error handling or edge cases
- Performance issues (N+1 queries, unnecessary loops, memory leaks)
- Missing input validation
- Inconsistent patterns with rest of codebase

### Suggestions (nice to have)
- Code style improvements
- Better naming
- Additional comments for complex logic
- Refactoring opportunities

## Output Format

Provide the review in this structure:

### Summary
- Files changed: X
- Overall assessment: Ready to commit / Needs attention / Critical issues found

### Findings

For each finding:
- **File:** `path/to/file`
- **Line(s):** approximate location
- **Severity:** Critical / Important / Suggestion
- **Issue:** Brief description
- **Recommendation:** How to fix

### Verdict

Final recommendation on whether to proceed with commit or address issues first.

## Project Context

This project uses:
- **Backend:** Laravel 12 (PHP 8.2) with PostgreSQL
- **Frontend:** Next.js 16 with React 19, TypeScript, Tailwind CSS, Base UI
- **Agent Plugin:** WordPress PHP plugin
- **Infrastructure:** Docker Compose with Nginx, Redis
- **API pattern:** ApiResponse trait with standardized JSON responses
- **Auth:** Laravel Sanctum with role-based access (admin, dev, mkt)
