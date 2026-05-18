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
DC = docker-compose
DC_PROD = docker-compose -f docker-compose.yml -f docker-compose.prod.yml
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

up: ## Start all containers (detached)
	$(DC) up -d

down: ## Stop all containers
	$(DC) down

restart: ## Restart all containers
	$(DC) restart

rebuild: ## Rebuild and restart containers
	$(DC) up -d --build

logs: ## Tail all container logs
	$(DC) logs -f

ps: ## Show running containers
	$(DC) ps

# ─── Production ──────────────────────────────────────────────────────────────

up-prod: ## Start prod stack (uses docker-compose.prod.yml overlay)
	$(DC_PROD) up -d

down-prod: ## Stop prod stack
	$(DC_PROD) down

restart-prod: ## Restart prod stack
	$(DC_PROD) restart

rebuild-prod: ## Rebuild and restart prod stack
	$(DC_PROD) up -d --build

logs-prod: ## Tail prod logs
	$(DC_PROD) logs -f

ps-prod: ## Show prod containers
	$(DC_PROD) ps

use-prod-env: ## Swap portal/.env -> portal/.env.production (backup current as .env.dev.bak)
	@cp -n portal/.env portal/.env.dev.bak 2>/dev/null || true
	cp portal/.env.production portal/.env
	@echo "✔ portal/.env now points at production. Backup at portal/.env.dev.bak"
	@echo "  Run: make up-prod && make artisan cmd=\"config:cache\""

use-dev-env: ## Restore portal/.env from portal/.env.dev.bak
	@test -f portal/.env.dev.bak || (echo "No portal/.env.dev.bak found"; exit 1)
	cp portal/.env.dev.bak portal/.env
	@echo "✔ portal/.env restored from dev backup."

prod-setup: ## First-time prod setup on this host: swap env, build, migrate, cache
	$(MAKE) use-prod-env
	$(DC_PROD) up -d --build
	$(DC_PROD) exec -T app chmod -R 777 /var/www/portal/storage /var/www/portal/bootstrap/cache
	$(DC_PROD) exec -T -w /var/www/portal app php artisan migrate --force
	$(DC_PROD) exec -T -w /var/www/portal app php artisan config:cache
	$(DC_PROD) exec -T -w /var/www/portal app php artisan route:cache
	@echo ""
	@echo "✔ Prod up. Tunnel should route portal.theshin.info -> :3000 and web-backend.theshin.info -> :8000"

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
