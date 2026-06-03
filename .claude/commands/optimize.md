---
description: Audit recent / open / changed code for performance issues and suggest fixes
---

# Code Optimization

You are auditing this project for performance problems. The user typed `/optimize` with no further input, so YOU pick what to review.

## Pick a target (in this order)

1. **If the user attached or referenced a specific file in their message** → review only that file.
2. **Else if there's an open IDE file (see `ide_opened_file` system context)** → review that file.
3. **Else** → run `git status --short` and `git diff --stat HEAD~1` to find recently modified files. Review the 1–3 files most likely to have perf-sensitive code (controllers, services, jobs, query-heavy code, hot loops). Skip migrations, config, and docs.

State which file(s) you chose and why in one sentence before starting the audit.

## What to look for (in order of priority)

1. **N+1 queries / inefficient DB access** — loops issuing queries, missing `with()`/eager-loading, `updateOrCreate` in a foreach where `upsert` would do it in one call, `Model::all()` where `chunk()`/`lazy()` would scale.
2. **Synchronous work that blocks the request thread** — external HTTP with long timeouts, file I/O, large in-memory aggregations. Flag opportunities to dispatch to a queue.
3. **Algorithmic issues** — O(n²) where O(n) works, repeated computation inside loops, unbounded result sets.
4. **Caching opportunities** — repeated lookups of stable data within one request or across requests (where Redis/Cache already exists in this codebase).
5. **Memory / resource leaks** — unclosed handles, unbounded arrays accumulating across iterations, unreleased locks.
6. **Concurrency issues** — race conditions on shared state, missing transactions around read-then-write, queue-worker safety.

Things to NOT flag (signal-only review):
- Style, naming, formatting.
- Hypothetical perf issues with no realistic load profile in this app.
- "Could be more functional/cleaner" rewrites that don't change runtime behavior.

## Output format

For each finding:

- **Severity**: Critical / High / Medium / Low
- **Location**: `path/to/file.ext:line` (clickable markdown link)
- **Problem**: one or two sentences — what's wrong and what's the cost
- **Fix**: code snippet showing the specific change

End with a one-line **Top recommendation** identifying the single highest-ROI fix.

If you find nothing worth flagging at Medium severity or higher, say so plainly — don't pad the report with Low-severity nits.
