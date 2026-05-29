---
name: create-docs
description: Generate an HTML documentation file explaining recent code changes, their purpose, and impact on existing flows. Use when the user asks to create docs, document changes, says /create-docs, or wants to understand what was changed and its effects.
---

# Create Documentation

Generate a comprehensive HTML documentation file for recent code changes.

## Workflow

1. Run `git diff --stat` for uncommitted changes, or `git log --oneline -10` for recent commits
2. Ask user if they want to document uncommitted changes or recent commits
3. Analyze the changes to understand:
   - What files were modified/created/deleted
   - What features or fixes were implemented
   - Which parts of the system are affected
4. Generate `TECHNICAL_DOCUMENTATION.html` in the project root

## HTML Template

Generate a clean, readable HTML file with:
- Modern styling (no external dependencies — inline CSS)
- Dark/light mode support
- Collapsible sections for detailed diffs
- Color-coded severity/impact indicators
- Navigation sidebar for large documents

## Document Structure

The HTML should include these sections:

### 1. Overview
- Date generated
- Branch name
- Total files changed
- Summary of changes in plain language

### 2. Changes Breakdown
For each logical group of changes:
- **Feature/Fix name**
- **Files involved** (with paths)
- **What changed** (plain language explanation)
- **Why** (purpose/motivation)
- **Impact** (what other parts are affected)

### 3. Flow Impact Analysis
- Which user flows are affected
- Which API endpoints changed
- Which database tables were modified
- Which services/containers need restart

### 4. Breaking Changes (if any)
- What will break
- Migration steps required
- Rollback procedure

### 5. Testing Notes
- What should be tested
- Which areas might have regressions

## Output

### File Naming

Name the file based on the feature or change being documented, NOT a generic name:
- `FEATURE_queue_monitoring.html` — for a new feature
- `FIX_admin_url_resolution.html` — for a bug fix
- `REFACTOR_select_component.html` — for a refactoring
- `CHANGE_sync_now_ux.html` — for a UX change

Format: `{TYPE}_{short_description}.html` where TYPE is FEATURE, FIX, REFACTOR, or CHANGE.

Save the file in the project root directory.

### Keeping Documentation

Each documentation file is kept as a separate record of that change. Do NOT overwrite previous documentation files — each change gets its own file. The `TECHNICAL_DOCUMENTATION.html` file (if it exists) is a legacy generic file that can be ignored.

These files should NOT be committed to git (they're in .gitignore or should be excluded).

## Project Context

This is a Laravel + Next.js + WordPress agent plugin project with Docker infrastructure.
Key architectural areas:
- Portal backend: `portal/app/` (Laravel controllers, models, services)
- Portal frontend: `portal/frontend/src/` (Next.js pages, components, services)
- Agent plugin: `agent/epos-wp-agent/` (WordPress plugin)
- Infrastructure: `docker-compose.yml`, `Makefile`, `docker/`
- API routes: `portal/routes/api.php`, `portal/routes/agent.php`
