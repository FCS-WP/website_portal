# EPOS Web Portal

## Overview

A Laravel + Next.js portal for managing fleets of WordPress sites. It handles
plugin deployments, credential vaulting, security monitoring (file integrity,
login surveillance, 2FA, vulnerability scans), and order syncing — all driven
through a companion WordPress agent plugin (`epos-wp-agent`) that exposes a
REST surface on each managed site.

The whole stack runs under Docker Compose: a PHP-FPM/Nginx backend, a Next.js
frontend, PostgreSQL, Redis, and (optionally) a queue worker + scheduler pair.

## Tech Stack

- **Backend** — Laravel 12, PHP 8.2, Laravel Sanctum (auth), Spatie Permission
  (RBAC), Predis (Redis client)
- **Frontend** — Next.js 16, React 19, TypeScript 5, Tailwind CSS v4,
  Base UI / shadcn, TanStack Table, Zustand, Recharts, Sonner
- **Database** — PostgreSQL 15
- **Cache / Queue / Broadcast** — Redis 7
- **Web server** — Nginx (alpine)
- **Infrastructure** — Docker Compose (v1 dev / v2 prod), Colima on macOS
- **Agent** — `epos-wp-agent` WordPress plugin (in `agent/epos-wp-agent/`)

## Prerequisites

- Docker & Docker Compose (v1 `docker-compose` for dev targets, v2
  `docker compose` for prod targets — the Makefile uses both)
- [Colima](https://github.com/abiosoft/colima) on macOS, or Docker Desktop
- Git
- Recommended Docker VM resources: **4+ CPUs, 6 GB+ RAM** (Next.js build and
  PHP container are the heaviest consumers)

## Quick Start

```bash
# 1. Clone
git clone <repo-url> web_portal
cd web_portal

# 2. First-time setup — copies env files, brings the stack up, installs
#    Composer deps, runs migrations + seeders.
make setup

# 3. Set the seed admin + vault key, then re-seed
#    Open portal/.env and fill in:
#       SEED_ADMIN_EMAIL=admin@example.com
#       SEED_ADMIN_PASSWORD=...
#       VAULT_MASTER_KEY=<64 hex chars>
#    Generate the vault key:
make artisan cmd="tinker --execute='echo bin2hex(random_bytes(32));'"
make artisan cmd="db:seed --force"

# 4. (optional) Start queue worker + scheduler
make workers-up
```

Then open:

- Frontend → <http://localhost:3000>
- Backend  → <http://localhost:8000>

On subsequent boots just run `make up`.

## Services & Ports

Host-side port mappings come from the repo-root `.env` (see
[`.env.example`](./.env.example)). Container-internal ports are always the
service defaults.

| Service       | Container      | Host port | Profile        | Notes                                  |
|---------------|----------------|-----------|----------------|----------------------------------------|
| Frontend      | `epos-frontend`| **3000**  | `dev` / `prod` | Next.js — exactly one profile at a time |
| Nginx (API)   | `epos-nginx`   | **8000**  | default        | Fronts PHP-FPM (`app`)                 |
| PHP-FPM       | `epos-app`     | —         | default        | Laravel runtime                        |
| PostgreSQL    | `epos-postgres`| **8081**  | default        | Mapped off 5432 to avoid host clashes  |
| Redis         | `epos-redis`   | **6380**  | default        | Mapped off 6379 to avoid host clashes  |
| Queue worker  | `epos-queue`   | —         | `worker`       | `queue:work --queue=default,deployments` |
| Scheduler     | `epos-scheduler`| —        | `worker`       | Loops `schedule:run` every 60 s        |

Override any port by editing the repo-root `.env` before `make up`.

## Available Commands (Makefile)

`make help` prints the live list. Highlights:

### Docker — Dev

| Command         | What it does                                              |
|-----------------|-----------------------------------------------------------|
| `make up`       | Start dev stack (frontend in `next dev` + HMR)            |
| `make down`     | Stop all containers (any profile)                         |
| `make restart`  | Restart dev containers                                    |
| `make rebuild`  | `up -d --build` for the dev profile                       |
| `make logs`     | Tail dev logs                                             |
| `make ps`       | Show running containers                                   |

### Docker — Prod

| Command            | What it does                                         |
|--------------------|------------------------------------------------------|
| `make use-prod-env`| Copy `portal/.env.prod` + `frontend/.env.local.prod` |
| `make up-prod`     | Start prod stack (built frontend + worker profile)   |
| `make down-prod`   | Stop prod containers                                 |
| `make rebuild-prod`| `up -d --build` for prod + worker                    |
| `make logs-prod`   | Tail prod logs                                       |
| `make prod-setup`  | First-time prod bring-up: swap env, build, migrate, cache routes |

### Backend (Laravel)

| Command                        | What it does                          |
|--------------------------------|---------------------------------------|
| `make migrate`                 | `php artisan migrate`                 |
| `make migrate-fresh`           | `migrate:fresh --seed`                |
| `make seed`                    | `db:seed`                             |
| `make tinker`                  | Interactive Tinker shell              |
| `make artisan cmd="..."`       | Run any artisan command               |
| `make composer cmd="..."`      | Run any composer command              |
| `make clear`                   | Clear config/route/view/cache         |
| `make db-shell`                | `psql` shell inside the DB container  |

### Frontend (uses pnpm locally)

| Command            | What it does                            |
|--------------------|-----------------------------------------|
| `make dev`         | `pnpm dev` in `portal/frontend`         |
| `make build`       | `pnpm build`                            |
| `make lint`        | `pnpm lint`                             |
| `make typecheck`   | `pnpm tsc --noEmit`                     |
| `make fe-install`  | `pnpm install`                          |

### Queue & Scheduler

| Command              | What it does                                          |
|----------------------|-------------------------------------------------------|
| `make queue`         | Foreground `queue:work` inside the `app` container    |
| `make queue-restart` | Signal workers to restart                             |
| `make schedule`      | `schedule:work` daemon                                |
| `make schedule-run`  | Run scheduled commands once (testing)                 |
| `make workers-up`    | Start the `queue` + `scheduler` containers (worker profile) |
| `make workers-down`  | Stop them                                             |
| `make workers-logs`  | Tail their logs                                       |

### Setup / Utility

| Command          | What it does                                                  |
|------------------|---------------------------------------------------------------|
| `make env-copy`  | Copy `.example` → live env files (idempotent)                 |
| `make setup`     | env-copy → up → composer install → key:generate → migrate+seed |
| `make fresh`     | `migrate:fresh --seed` + clear all caches                     |
| `make ping`      | `php artisan sites:ping` (connectivity check across managed sites) |
| `make wp-cron`   | Trigger wp-cron manually for testing                          |

## Project Structure

```
web_portal/
├── agent/epos-wp-agent/      WordPress plugin installed on managed sites
│   ├── includes/             Plugin internals (API, security, sync, autologin…)
│   └── epos-wp-agent.php     Plugin entrypoint
├── portal/                   Laravel application
│   ├── app/                  Controllers, Jobs, Models, Services, Console commands
│   ├── routes/               api.php / agent.php / web.php / console.php
│   ├── database/             Migrations, seeders, factories
│   ├── config/               Laravel configs (auth, queue, services…)
│   └── frontend/             Next.js 16 app (App Router, TS, Tailwind v4)
│       └── src/              UI source
├── docker/                   Dockerfiles + nginx.conf + uploads.ini
├── docker-compose.yml        Dev + prod + worker profiles
├── docker-compose.prod.yml   Prod overrides
├── Makefile                  Single source of truth for ops commands
├── .env / .env.example       Repo-root env consumed by docker-compose
└── README.md                 You are here
```

## Docker Profiles

The `docker-compose.yml` uses Compose profiles so a single file serves dev,
prod, and worker setups:

| Profile  | Services started                                             | Typical use                |
|----------|--------------------------------------------------------------|----------------------------|
| _(none)_ | `app`, `nginx`, `postgres`, `redis`                          | Always on                  |
| `dev`    | adds `frontend-dev` (`next dev` + HMR)                       | Local development          |
| `prod`   | adds `frontend-prod` (`next build && next start`)            | Production                 |
| `worker` | adds `queue` + `scheduler`                                   | Background jobs + cron     |

Switch modes via `make use-dev-env` / `make use-prod-env`, which swap
`portal/.env` and `portal/frontend/.env.local` to match. The frontend services
share a host port and container name, so only one profile can be active.

## Environment Configuration

Three env files coexist; each owns a different layer:

| File                                 | Read by              | Purpose                                                                 |
|--------------------------------------|----------------------|-------------------------------------------------------------------------|
| `.env` (repo root)                   | `docker compose`     | Host port bindings (`APP_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`) and Postgres init credentials (`DB_*`) |
| `portal/.env`                        | Laravel              | App config: DB connection, queues, mail, vault key, seed admin, agent secrets |
| `portal/frontend/.env.local`         | Next.js              | `NEXT_PUBLIC_API_URL`, `API_PROXY_TARGET`                               |

Dev/prod template snapshots live alongside the live files
(`portal/.env.dev`, `portal/.env.prod`, etc.) and are swapped in by
`make use-dev-env` / `make use-prod-env`.

The repo-root `DB_*` values **must** match Laravel's `DB_USERNAME` /
`DB_PASSWORD` / `DB_DATABASE` in `portal/.env` — the former initialises the
Postgres image on first boot, the latter is how Laravel connects to it.

## Agent Plugin

`agent/epos-wp-agent/` is a WordPress plugin installed on every managed site.
It exposes REST endpoints under `/wp-json/epos-agent/v1/...` that the portal
calls for: health pings, plugin install/update/rollback, SMTP push, autologin
token exchange, 2FA / login / file-integrity monitoring, and order sync.

Each site registers itself with the portal; the portal stores connection
credentials in a vault (master key in `VAULT_MASTER_KEY`) and uses them to
authenticate every subsequent agent call. The agent must be **installed and
activated** on the site before the portal can talk to it — an inactive plugin
produces 404s on the REST routes.

## Custom Slash Commands

Project-specific skills live under `.qoder/skills/`:

- **`/code-review`** — Reviews uncommitted changes against project conventions
  before you commit.
- **`/create-docs`** — Generates semantic, versioned HTML documentation for
  the current change set (artifacts land in the repo root and are
  git-ignored).

## Contributing

1. Branch from `main` using a descriptive name (`feature/...`, `fix/...`,
   `chore/...`).
2. Implement the change; run `make lint`, `make typecheck`, and any relevant
   `make artisan cmd="test"` before pushing.
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`…).
4. First push of a new branch needs upstream:
   `git push --set-upstream origin <branch>`.
5. Open a PR and request review.
