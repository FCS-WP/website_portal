.PHONY: help up down restart rebuild logs ps \
       up-prod down-prod restart-prod rebuild-prod logs-prod ps-prod \
       prod-setup use-prod-env use-dev-env \
       migrate migrate-fresh seed tinker artisan composer clear \
       dev build lint typecheck fe-install \
       db-shell \
       queue queue-stop queue-restart schedule schedule-run \
       workers-up workers-down workers-logs \
       ping \
       wp-cron \
       fresh setup env-copy

# Variables
#
# This laptop still has the legacy `docker-compose` v1 binary, while the prod
# box only ships the v2 plugin (`docker compose`, two words). Rather than
# forcing one or the other, dev targets use DC (v1) and prod targets use
# DC_BIN (v2). Both read the same docker-compose.yml.
DC      = docker-compose
DC_BIN  = docker compose
# Dev/prod are selected via docker-compose `profiles:` (defined in
# docker-compose.yml). The frontend-dev and frontend-prod services are
# mutually exclusive; queue + scheduler live under the `worker` profile so
# they're only on when explicitly requested.
#
# DC_PROD stacks `--profile prod --profile worker` so production always runs
# the queue worker and the artisan scheduler alongside the prod frontend.
# Without those, scheduled jobs (WP.org cache refresh, sites:ping, etc.)
# and queued deployment dispatches silently never run.
DC_DEV  = $(DC) --profile dev
DC_PROD = $(DC_BIN) --profile prod --profile worker
EXEC = $(DC) exec -T -w /var/www/portal app
EXEC_IT = $(DC) exec -w /var/www/portal app
FRONTEND_DIR = portal/frontend

# Default target
help: ## Show this help
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─── Docker ──────────────────────────────────────────────────────────────────

up: ## Start DEV stack (next dev + HMR). Run `make use-dev-env` first.
	$(DC_DEV) up -d

down: ## Stop ALL containers (any profile)
	$(DC) --profile dev --profile prod down

restart: ## Restart DEV containers
	$(DC_DEV) restart

rebuild: ## Rebuild + restart DEV
	$(DC_DEV) up -d --build

logs: ## Tail DEV logs
	$(DC_DEV) logs -f

ps: ## Show running containers (any profile)
	$(DC) ps

# ─── Production ──────────────────────────────────────────────────────────────

up-prod: ## Start PROD stack (next build + start). Run `make use-prod-env` first.
	$(DC_PROD) up -d

down-prod: ## Stop PROD containers
	$(DC_PROD) down

restart-prod: ## Restart PROD containers
	$(DC_PROD) restart

rebuild-prod: ## Rebuild + restart PROD
	$(DC_PROD) up -d --build

logs-prod: ## Tail PROD logs
	$(DC_PROD) logs -f

ps-prod: ## Show PROD containers
	$(DC_PROD) ps

use-dev-env: ## Switch to DEV mode (copies .env.dev templates into live envs)
	@test -f portal/.env.dev || (echo "✗ portal/.env.dev missing — run snapshot first" && exit 1)
	@test -f portal/frontend/.env.local.dev || (echo "✗ portal/frontend/.env.local.dev missing" && exit 1)
	cp portal/.env.dev portal/.env
	cp portal/frontend/.env.local.dev portal/frontend/.env.local
	@echo "✔ Switched to DEV mode."
	@echo "  Next: 'make down && docker compose --profile dev up -d --build' (or 'make up')"

use-prod-env: ## Switch to PROD mode (copies .env.prod templates into live envs)
	@test -f portal/.env.prod || (echo "✗ portal/.env.prod missing — run snapshot first" && exit 1)
	@test -f portal/frontend/.env.local.prod || (echo "✗ portal/frontend/.env.local.prod missing" && exit 1)
	cp portal/.env.prod portal/.env
	cp portal/frontend/.env.local.prod portal/frontend/.env.local
	@echo "✔ Switched to PROD mode."
	@echo "  Next: 'make down && docker compose --profile prod up -d --build'"

prod-setup: ## First-time prod bring-up: swap to prod env, build, migrate, cache routes
	$(MAKE) use-prod-env
	$(DC_PROD) up -d --build
	$(DC_BIN) exec -T app chmod -R 777 /var/www/portal/storage /var/www/portal/bootstrap/cache
	$(DC_BIN) exec -T -w /var/www/portal app php artisan migrate --force
	$(DC_BIN) exec -T -w /var/www/portal app php artisan config:cache
	$(DC_BIN) exec -T -w /var/www/portal app php artisan route:cache
	@echo ""
	@echo "✔ Prod up. Tunnel should route portal.theshin.info -> :3000 and web-backend.theshin.info -> :8000"
	@echo "   Queue + scheduler are running (worker profile auto-included)."
	@echo "   Raw command if 'make' is unavailable on the prod box:"
	@echo "     docker compose --profile prod --profile worker up -d --build"

# ─── Backend (Laravel) ───────────────────────────────────────────────────────

migrate: ## Run database migrations
	$(EXEC) php artisan migrate

migrate-fresh: ## Fresh migration with seed
	$(EXEC) php artisan migrate:fresh --seed

seed: ## Run database seeders
	$(EXEC) php artisan db:seed

tinker: ## Open Tinker (interactive)
	$(EXEC_IT) php artisan tinker

artisan: ## Run artisan command (e.g. make artisan cmd="route:list")
	$(EXEC) php artisan $(cmd)

composer: ## Run composer command (e.g. make composer cmd="require package")
	$(EXEC) composer $(cmd)

clear: ## Clear all Laravel caches
	$(EXEC) php artisan config:clear
	$(EXEC) php artisan route:clear
	$(EXEC) php artisan view:clear
	$(EXEC) php artisan cache:clear

# ─── Frontend ────────────────────────────────────────────────────────────────

dev: ## Start Next.js dev server
	cd $(FRONTEND_DIR) && pnpm dev

build: ## Build frontend for production
	cd $(FRONTEND_DIR) && pnpm build

lint: ## Run ESLint
	cd $(FRONTEND_DIR) && pnpm lint

typecheck: ## Run TypeScript type check
	cd $(FRONTEND_DIR) && pnpm tsc --noEmit

fe-install: ## Install frontend dependencies with pnpm
	cd $(FRONTEND_DIR) && pnpm install

# ─── Queue & Scheduler ──────────────────────────────────────────────────────

queue: ## Start queue worker (foreground)
	$(EXEC) php artisan queue:work --queue=default,deployments --tries=3 --timeout=90

queue-stop: ## Stop all queue workers gracefully
	$(EXEC) php artisan queue:restart

queue-restart: ## Restart queue worker (stop + start)
	$(EXEC) php artisan queue:restart
	@echo "Queue workers signaled to restart. Run 'make queue' to start a new worker."

schedule: ## Run the scheduler daemon (every minute)
	$(EXEC) php artisan schedule:work

schedule-run: ## Run scheduled commands once (for testing)
	$(EXEC) php artisan schedule:run

# ─── Workers (Production) ───────────────────────────────────────────────────

workers-up: ## Start queue + scheduler containers (production)
	$(DC) --profile worker up -d queue scheduler

workers-down: ## Stop queue + scheduler containers
	$(DC) --profile worker stop queue scheduler

workers-logs: ## Tail queue + scheduler logs
	$(DC) --profile worker logs -f queue scheduler

# ─── Database ────────────────────────────────────────────────────────────────

db-shell: ## Open psql shell inside DB container
	$(DC) exec postgres psql -U $${DB_USERNAME:-epos} -d $${DB_DATABASE:-epos_portal}

# ─── Site Monitoring ────────────────────────────────────────────────────────

ping: ## Ping all sites to check connectivity
	$(EXEC) php artisan sites:ping

# ─── WP Agent ──────────────────────────────────────────────────────────────

wp-cron: ## Trigger WP cron manually (for testing)
	docker exec epos_com curl -s http://localhost/wp-cron.php?doing_wp_cron

# ─── Utilities ───────────────────────────────────────────────────────────────

fresh: ## Full reset: migrate fresh + seed + clear caches
	$(EXEC) php artisan migrate:fresh --seed
	$(EXEC) php artisan config:clear
	$(EXEC) php artisan route:clear
	$(EXEC) php artisan view:clear
	$(EXEC) php artisan cache:clear

env-copy: ## Copy *.example -> live env files (idempotent, never overwrites)
	@if [ ! -f .env ]; then cp .env.example .env; echo "✔ Copied .env (repo root)"; else echo "↷ .env already exists at repo root — skipped"; fi
	@if [ ! -f portal/.env ]; then cp portal/.env.example portal/.env; echo "✔ Copied portal/.env"; else echo "↷ portal/.env already exists — skipped"; fi
	@if [ ! -f portal/frontend/.env.local ]; then cp portal/frontend/.env.local.example portal/frontend/.env.local; echo "✔ Copied portal/frontend/.env.local"; else echo "↷ portal/frontend/.env.local already exists — skipped"; fi

setup: env-copy ## First-time setup: copy envs, start containers, install deps, migrate, seed
	@echo ""
	@echo "→ Bringing up the stack so composer/artisan have somewhere to run…"
	$(DC) up -d --build
	@echo ""
	@echo "→ Installing Laravel dependencies…"
	$(EXEC) composer install
	@echo ""
	@echo "→ Generating APP_KEY if missing…"
	@if grep -q '^APP_KEY=$$' portal/.env; then $(EXEC) php artisan key:generate; else echo "↷ APP_KEY already set — skipped"; fi
	@echo ""
	@echo "→ Running migrations + seed…"
	$(EXEC) php artisan migrate --seed
	@echo ""
	@echo "✔ Setup complete."
	@echo "   • Backend:  http://localhost:8000"
	@echo "   • Frontend: http://localhost:3000  (give next dev ~30s on first start)"
	@echo "   • Workers:  run 'make workers-up' to start the scheduler + queue containers"
	@echo ""
	@echo "⚠  Before you log in: open portal/.env and set SEED_ADMIN_EMAIL,"
	@echo "   SEED_ADMIN_PASSWORD, and VAULT_MASTER_KEY (generate the vault key with:"
	@echo "   make artisan cmd=\"tinker --execute='echo bin2hex(random_bytes(32));'\")."
	@echo "   Then re-run: make artisan cmd=\"db:seed --force\""
