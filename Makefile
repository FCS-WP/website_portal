.PHONY: help up down restart rebuild logs ps \
       migrate migrate-fresh seed tinker artisan composer clear \
       dev build lint typecheck fe-install \
       db-shell \
       queue queue-stop queue-restart schedule schedule-run \
       workers-up workers-down workers-logs \
       ping \
       wp-cron \
       fresh setup

# Variables
DC = docker-compose
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

setup: ## First-time setup: copy .env, install deps, migrate, seed
	@if [ ! -f portal/.env ]; then cp portal/.env.example portal/.env; echo "Copied .env"; fi
	$(EXEC) composer install
	$(EXEC) php artisan key:generate
	$(EXEC) php artisan migrate --seed
	cd $(FRONTEND_DIR) && pnpm install
	@echo ""
	@echo "✔ Setup complete. Run 'make up' to start containers, then 'make dev' for frontend."
