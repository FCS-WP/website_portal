# Repo orientation

This is a monorepo with **three components** that talk to each other over HTTP:

| Path | What it is | Stack |
|---|---|---|
| `portal/` | Central control panel — the source of truth | Laravel 12 (PHP 8.2+) + Sanctum auth |
| `portal/frontend/` | Admin UI | Next.js 16.2 + React 19 + Tailwind 4 + shadcn/ui + Zustand + Axios |
| `agent/epos-wp-agent/` | WordPress plugin installed on every managed site | Plain PHP, no Composer; talks REST to the portal |

Everything runs in Docker. Don't try to install PHP/Node locally — use the Make targets.

---

## How the three pieces fit

```
       portal/frontend  ──────►  portal (Laravel)  ◄──────  agent (WP plugin)
       (Axios, port 3000)        (REST + Sanctum,           (REST, hashed
                                  port 8000)                  X-Agent-Key)
                                       │
                                       ▼
                                 epos-postgres (5432→8081)
                                 epos-redis    (6379→6380)
                                 queue + scheduler containers
                                 (workers profile)
```

- **Frontend → Portal**: Axios client at `portal/frontend/src/lib/api.ts`. Token in `localStorage.auth_token`, sent as `Authorization: Bearer ...`. 401 auto-redirects to `/login`.
- **Portal → Agent**: `Http::withHeaders(['X-Agent-Key' => decrypt($site->api_key_encrypted)])`. Key is encrypted at rest with `VAULT_MASTER_KEY` via `CredentialEncryptionService`.
- **Agent → Portal**: `wp_remote_post(rtrim($portal_url,'/') . '/api/agent/...')` with `X-Agent-Key` (the same shared secret). Agent endpoint allow-list is in `routes/agent.php`.

If you're tempted to call `decrypt(...)` outside a controller/job, stop — there's an encryption service for that.

---

## Day-to-day commands

Containers and Laravel/artisan all run through the Makefile. **Don't invent docker compose calls** — pick a `make` target. Run `make help` for the live list.

| Goal | Command |
|---|---|
| Start dev stack (Next.js HMR + Laravel + Postgres + Redis) | `make up` (after `make use-dev-env` once per env swap) |
| Start queue worker + scheduler in containers | `make workers-up` |
| Tail dev logs | `make logs` ‖ `make workers-logs` |
| Run an artisan command | `make artisan cmd="route:list"` |
| Run a composer command | `make composer cmd="require foo/bar"` |
| Open Tinker | `make tinker` |
| psql shell into the DB | `make db-shell` |
| Run migrations | `make migrate` (or `make migrate-fresh` to wipe + seed) |
| Clear all Laravel caches | `make clear` |
| Typecheck frontend | `make typecheck` |
| Lint frontend | `make lint` |
| Frontend `pnpm install` | `make fe-install` |
| Switch dev ↔ prod env files | `make use-dev-env` / `make use-prod-env` |
| Production bring-up (first time on prod box) | `make prod-setup` then `make up-prod` |

**Dev vs prod selection.** `docker-compose.yml` defines `profiles: [dev, prod, worker]`. The Makefile passes the right `--profile` flag based on whether you used `up` or `up-prod`. Queue + scheduler live under the `worker` profile so they only run when `workers-up` is called. **On prod, `make up-prod` automatically stacks the `worker` profile** — without it, scheduled jobs (`SyncExternalPluginCache`, `DispatchScheduledDeployments`, `PingSites`) silently never run.

**Dev compose v1 vs prod compose v2.** The dev laptop has the legacy `docker-compose` (v1) binary; the prod box only has the `docker compose` (v2) plugin. Dev Make targets use `$(DC)` (v1), prod targets use `$(DC_BIN)` (v2). Both read the same `docker-compose.yml`. Don't try to standardize this — it's intentional.

---

## Container topology (dev)

| Container | Port (host→cont) | Role |
|---|---|---|
| `epos-nginx` | 8000→80 | Reverse proxy to PHP-FPM |
| `epos-app` | (internal 9000) | Laravel PHP-FPM. Working dir is `/var/www/portal`. |
| `epos-frontend` | 3000→3000 | Next.js dev server (HMR) |
| `epos-postgres` | 8081→5432 | DB (`epos_portal`, user `epos`) |
| `epos-redis` | 6380→6379 | Cache + queue driver |
| `epos-queue` | — | Queue worker (workers profile) |
| `epos-scheduler` | — | Cron-style runner (workers profile) |

To run code inside the Laravel container: `make artisan cmd="..."` or `make tinker`. **Don't `docker exec` directly unless you need to** — Make sets the right working dir, env, and user.

Other unrelated containers may be running on this laptop (`Website_AI`, `mysql-database`, `phpmyadmin`, `scv_cloudflared_staging_web`). Those are not part of this project. `Website_AI` IS used in this project as a **local WordPress install** for testing the agent plugin against — `https://shin.theshin.info` is its public Cloudflare-tunnel hostname.

---

## Portal (Laravel) conventions

**Domain organization.** Controllers are split by domain under `app/Http/Controllers/{Portal,Agent,Auth}/...`. The two route files:
- `routes/api.php` — `auth:sanctum` + `active` middleware. Mounted at `/api/`. Frontend's whole API.
- `routes/agent.php` — `X-Agent-Key` middleware. Mounted at `/api/agent/`. Agent ↔ portal traffic only.

**Response shape.** Every controller uses the `ApiResponse` trait. Always return through it:
```php
return $this->successResponse($data, 'Optional message', 200);
return $this->errorResponse('Message', 422);
```
Frontend reads `res.data.data` (the wrapper unwraps to `{ success, message, data }`).

**Site access control.** Controllers that mutate per-site data use the `AuthorizesSiteAccess` trait — call `$this->assertSiteAccess($request, $site)` at the top of the method. Throws 403 if the user isn't admin and isn't assigned to that site.

**Form requests.** Validation lives in `App\Http\Requests\{Domain}\Store{X}Request.php` / `Update{X}Request.php`. Look at `Plugin/UpdatePluginRequest.php` for the canonical shape.

**Encryption.** `api_key_encrypted` on `sites`, `password_encrypted` on `site_smtp_settings`, and credentials in `vaults` all use `App\Services\CredentialEncryptionService` (which wraps Laravel's `encrypt()` with `VAULT_MASTER_KEY`). **Don't roll your own.** Don't return encrypted columns in API responses — return a boolean like `password_set: true` instead.

**Background work.**
| Job | Trigger | What it does |
|---|---|---|
| `WpOrgPluginJob` | `wporg_install` / `wporg_update` / `wporg_uninstall` deployments | Drives the agent's `/plugins/external/*` endpoints |
| `PushPluginToSite` | Company-plugin deploys via signed download URL | Drives the agent's `/plugin/install` endpoint |
| `PushSmtpToSite` | SMTP config save | Pushes SMTP settings via `/smtp/update` |
| `DispatchBulkDeployment` | New deployment job | Fans out N `PushPluginToSite` jobs |
| `SendTelegramNotification` | Most state transitions | All admin-facing notifications go through this |

**Scheduled tasks** are defined in `routes/console.php` (Laravel 12 lives there, not `Kernel.php`):
```php
Schedule::command('deployments:dispatch-scheduled')->everyMinute();
```
Add more there. Run once for testing with `make schedule-run`.

**Deployment lifecycle.** A `deployment_job` has many `deployment_job_sites`. Per-site status moves `pending → running → success | failed | skipped | rolled_back`. The check constraint on `status` is the source of truth — `'skipped'` is a valid status (used by the same-version pre-flight in `DeploymentController::store()`).

---

## Frontend (Next.js 16 + React 19) conventions

**This Next.js is non-standard.** See `portal/frontend/AGENTS.md` — the upstream warning is "this version has breaking changes; read `node_modules/next/dist/docs/` before writing code." Trust that warning; don't assume training-data conventions match.

**Layout.**
- `src/app/(dashboard)/` — authenticated routes (sidebar shown)
- `src/app/login/` — auth pages
- `src/app/vault/` — public credential-share viewer (token-protected, no admin auth)
- `src/lib/services/*.ts` — typed API clients, one per resource (`plugins.ts`, `sites.ts`, etc.)
- `src/lib/api.ts` — Axios instance with token interceptor + 401 redirect
- `src/stores/` — Zustand stores (only auth-store right now)
- `src/types/index.ts` — shared TS types matching API payload shape

**Service pattern.** Don't call `axios` directly from components. Add a method to the relevant service in `src/lib/services/`:
```ts
markVersionAsLatest: (versionId: number | string) =>
  api.post(`/plugin-versions/${versionId}/mark-latest`),
```

**Error surfacing — CRITICAL.** Older code in this repo has `catch {}` blocks that swallow errors. **Don't write new ones.** Always:
```ts
} catch (err) {
  const message =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any)?.response?.data?.message ?? "Generic fallback";
  toast.error(message);
  console.error("operation failed:", err);
}
```
The 422 validation responses from Laravel are useful; swallowing them costs us hours of "Failed to upload version" debugging.

**UI primitives.** shadcn/ui via `@/components/ui/*`. **Use what's there**:
- Tables: `Table`, `TableHead`, `TableRow`, `TableCell` from `@/components/ui/table`
- Cards: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from `@/components/ui/card`
- Forms: `Input`, `Label`, `Textarea`, `Select`, `Checkbox`, `Button`
- Modals: `Dialog` (form modal), `AlertDialog` (confirm)
- Notifications: `toast` from `sonner`

**Required field markers.** When a backend field is required by validation, mark it in the UI:
```tsx
<Label>
  Changelog <span className="text-destructive">*</span>
</Label>
<Textarea required ... />
```
And gate the submit button on it. The "upload version failed silently because changelog was empty" bug took an hour to find; don't reintroduce that pattern.

---

## Agent plugin (`agent/epos-wp-agent/`)

**Layout.**
- `epos-wp-agent.php` — bootstrap, defines `EPOS_AGENT_VERSION`, hooks `epos_agent_init` on WordPress's `init`
- `includes/class-api.php` — REST endpoint definitions (`/wp-json/epos-agent/v1/...`)
- `includes/class-{feature}.php` — one class per domain (plugin install, SMTP, rollback, health check, login customizer, etc.)
- `admin/` — admin settings page
- `assets/` — login customizer CSS/JS, logo PNG

**Version bumping is mandatory on every change** (any class in `includes/`, any asset, the bootstrap file). Bump BOTH:
```php
// epos-wp-agent.php
* Version: 1.1.6
define('EPOS_AGENT_VERSION', '1.1.6');
```
The frontend uses `EPOS_AGENT_VERSION` as the `?ver=` query string for CSS/JS, so without a bump browsers serve cached assets. The portal also uses it to detect which sites need an agent upgrade.

**Don't add nested `add_action('init', ...)` inside `epos_agent_init()`** — by the time our init runs, WP has finished dispatching `init` callbacks at priority 10, so the nested hook never fires. Call the function synchronously instead. This was the root cause of the `/epos-login` 404 after in-place upgrade (see commit `f83fe9b`).

**Options written by the agent** (read with `get_option('epos_*')`):
- `epos_agent_portal_url`, `epos_agent_api_key`, `epos_agent_connection_status`, `epos_agent_download_hosts`
- `epos_health_check_delay`, `epos_health_check_second_delay`, `epos_health_status_*`, `epos_last_deployment_*`
- `epos_rollback_enabled`, `epos_rollback_version_*`, `epos_rollback_*`
- `epos_smtp_host`, `epos_smtp_port`, `epos_smtp_username`, `epos_smtp_password`, `epos_smtp_encryption`, `epos_smtp_from_email`, `epos_smtp_from_name`
- `epos_agent_file_baseline`, `epos_agent_orders_last_sync`, `epos_agent_admin_sync_enabled`

**Plugin installer / health-check gotcha — DON'T REINTRODUCE.** Always `wp_cache_delete('alloptions', 'options')` and `wp_cache_delete('active_plugins', 'options')` before any `is_plugin_active()` check that follows an upgrader call or `activate_plugin()`. The in-process options cache stays warm with the pre-upgrade `active_plugins` value, so a stale `is_plugin_active()` reports `true` and we skip the re-activation we actually need → the post-deploy health check then sees `plugin_active=false` and triggers a false auto-rollback. See `update_plugin()` and `install_plugin()` for the pattern.

**`activate_plugin()` can throw fatals.** WooCommerce's install hook in 10.7.0 fatals on `TaxBasedOn` class not yet autoloaded. Always wrap `activate_plugin()` in `try/catch(\Throwable)` and fall back to writing the plugin into `active_plugins` directly so WP picks it up on next request boot:
```php
try {
    $r = activate_plugin($plugin_file);
} catch (\Throwable $e) {
    $active = (array) get_option('active_plugins', []);
    if (!in_array($plugin_file, $active, true)) {
        $active[] = $plugin_file;
        update_option('active_plugins', array_values(array_unique($active)));
    }
}
```

**Authentication on agent endpoints.** Always check the `X-Agent-Key` header against `get_option('epos_agent_api_key')`. The pattern is in `class-api.php::check_permission()` — reuse it via the `permission_callback` field on `register_rest_route()`. Never expose an endpoint with `permission_callback => '__return_true'`.

**Local opcache window.** PHP-FPM has `opcache.validate_timestamps=On, revalidate_freq=2`. When you `docker cp` an updated plugin file, the old bytecode keeps serving for up to 2 seconds. Live HTTP retries will fail in that window even though CLI tests (opcache disabled) succeed. On prod, after uploading a new agent zip, hit any page once to force the revalidate — or restart PHP-FPM. If a deployment fails immediately after an agent zip upload, suspect opcache before suspecting code.

**Rolling out a new agent version.**
1. Bump `Version:` header + `EPOS_AGENT_VERSION` constant
2. `zip -r agent/epos-wp-agent.zip agent/epos-wp-agent` (the zip is gitignored; see `.gitignore`)
3. Upload via portal: Plugins → wp-portal-agent → Upload New Version
4. **Changelog is required** (Laravel validation) — UI now enforces this; if you regenerate the form, keep the `required` marker
5. Push deployment from the portal to all sites

---

## Commit + PR conventions

**Style.** Terse, lowercase, imperative. **No** Conventional Commits prefix (`feat:`/`fix:`/`chore:`). Run `git log --oneline` to see what fits — recent examples:
- `add SMTP configuration`
- `fix /epos-login 404 after in-place plugin upgrade`
- `agent 1.1.6: cache-bust + catch fatal in activate_plugin`

**Trailer.** Every commit ends with `Co-Authored-By: Shin`.

**Staging.** Never `git add -A` or `git add .` — name the files explicitly to avoid `.env`, build artifacts, or secrets. The `agent/*.zip` build artifact is gitignored but other temporary files may not be.

**Slash commands available.** `/optimize` for performance review, `/commit` for the message draft (uses HEREDOC + trailer), `/pr` for opening a GitHub PR with summary + test plan. All defined in `.claude/commands/`.

---

## What NOT to do

- **Don't reach for `docker exec` directly** when a Make target exists. `make artisan cmd="..."` is the canonical wrapper — sets working dir, env, user.
- **Don't introduce `catch {}` empty blocks.** Surface `err?.response?.data?.message` with a `toast.error`. Older code does this; don't perpetuate it.
- **Don't return encrypted columns.** Use `password_set: true` / `api_key_set: true` patterns.
- **Don't update `installed_version` on `site_plugins` from the portal side.** That column is the agent's last reported state — the agent updates it via the ping/handshake flow. Writing it from a deploy job hides bugs.
- **Don't put deployment-time decisions in the agent.** The portal decides which version goes where; the agent just executes. Same-version skip lives in `DeploymentController::store()`, not in the agent.
- **Don't add a tool to the agent without the `X-Agent-Key` check.** Every `register_rest_route` needs a `permission_callback` that calls `check_permission()`.
- **Don't bump only one of `Version:`/`EPOS_AGENT_VERSION`** — they MUST move together. The plugin update flow checks both.
- **Don't add `agent/*.zip` to commits.** It's gitignored; if you see it staged, something's wrong with the build flow.

---

## Backups + recovery

**Daily automated backups** of the Postgres DB + Laravel private storage are written to `portal/backups/<YYYY-MM-DD>/` by the `db:backup` artisan command, fired by the scheduler at **03:30 daily** (`routes/console.php`). Retention: 14 days, then auto-pruned.

| Operation | Command |
|---|---|
| Backup now (one-off) | `make backup` |
| List existing backups | `make backup-list` |
| Restore from a backup | `make restore DATE=2026-06-04` (prompts for confirmation) |

**What each backup contains** (`portal/backups/<date>/`):
- `epos_portal.sql.gz` — `pg_dump --format=plain` of the whole DB (schema + data), gzipped
- `storage.tar.gz` — tarball of `storage/app/private/` (plugin zip files, etc.)
- `MANIFEST.txt` — small text file with timestamp + size + restore command

**Restore process** (`make restore DATE=...`):
1. Terminates other DB sessions (Laravel keeps connections open via Octane/queue workers — required so `dropdb` succeeds)
2. Drops + recreates `epos_portal`
3. Pipes the gunzipped dump into `psql`
4. Untars storage over the existing `storage/app/private/`
5. Clears Laravel caches

**Critical limits of this setup:**
- **Same disk** — backups live on the same filesystem as the source. Disk failure or stolen laptop loses everything. **Add an off-site sync (rclone to Backblaze B2 / S3) for real disaster recovery.**
- **`VAULT_MASTER_KEY` is NOT in the backup** — it's in `portal/.env` (gitignored). Lose that file and every encrypted column (`api_key_encrypted`, SMTP `password_encrypted`, vault credentials) becomes unrecoverable. **Store the value somewhere separately** (password manager) the day you set it.
- **Backups do NOT include the agent plugin source** — that's in `agent/epos-wp-agent/` and tracked in git, so this is fine. But if you change agent files locally without committing, they won't be in any backup.

**Don't accidentally drop `portal/backups/`.** It's gitignored but not protected against `rm -rf`. If you find yourself running cleanup commands in `portal/`, double-check.

**Postgres version skew note.** The `pg_dump` inside `epos-app` is Postgres 17 (from `postgresql-client` apt package); the DB server is 15. Restore emits one warning per session — `ERROR: unrecognized configuration parameter "transaction_timeout"` — which is harmless and gets skipped. Don't waste time chasing it.

---

## Useful Tinker recipes

```php
// Replay a deployment job
$pv = App\Models\PluginVersion::find(2);
DB::table('site_plugins')->where('plugin_id', $pv->plugin_id)->get();

// Decrypt a site's api key (debugging only)
$site = App\Models\Site::find(1);
decrypt($site->api_key_encrypted);

// Check what's queued
DB::table('jobs')->count();
DB::table('failed_jobs')->orderBy('failed_at', 'desc')->limit(5)->get(['id','payload','exception']);

// Force the same-version skip path to fire for testing
App\Models\SitePlugin::where('site_id', 1)->where('plugin_slug', 'wp-portal-agent')->update(['installed_version' => '1.1.5', 'is_active' => true]);
```
