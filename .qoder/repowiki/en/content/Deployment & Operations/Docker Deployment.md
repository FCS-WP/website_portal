# Docker Deployment

<cite>
**Referenced Files in This Document**
- [docker-compose.yml](file://docker-compose.yml)
- [php/Dockerfile](file://docker/php/Dockerfile)
- [node/Dockerfile](file://docker/node/Dockerfile)
- [nginx/default.conf](file://docker/nginx/default.conf)
- [portal/composer.json](file://portal/composer.json)
- [portal/package.json](file://portal/package.json)
- [portal/config/database.php](file://portal/config/database.php)
- [portal/config/cache.php](file://portal/config/cache.php)
- [portal/config/session.php](file://portal/config/session.php)
- [portal/config/app.php](file://portal/config/app.php)
- [portal/config/filesystems.php](file://portal/config/filesystems.php)
- [portal/config/queue.php](file://portal/config/queue.php)
- [portal/config/services.php](file://portal/config/services.php)
- [portal/.env.example](file://portal/.env.example)
- [portal/vite.config.js](file://portal/vite.config.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document provides comprehensive guidance for deploying the portal stack using Docker and Docker Compose. It covers container orchestration, service definitions, networking, volumes, and environment-driven configuration. It documents the PHP application container (Laravel), the Nginx reverse proxy, the Node.js frontend development environment, and supporting infrastructure including PostgreSQL and Redis. It also includes step-by-step deployment instructions, health checks, troubleshooting, scaling strategies, and resource allocation recommendations.

## Project Structure
The deployment is orchestrated by a single Docker Compose file that defines services for the PHP application, Nginx, Node.js frontend, PostgreSQL, and Redis. Supporting containers include a queue worker and a scheduler. Volumes are used for persistent data and shared application code. Networking is handled via a dedicated bridge network.

```mermaid
graph TB
subgraph "Network: epos-network"
APP["Service: app<br/>PHP-FPM"]
NGINX["Service: nginx<br/>Nginx"]
FRONTEND["Service: frontend<br/>Node.js"]
POSTGRES["Service: postgres<br/>PostgreSQL"]
REDIS["Service: redis<br/>Redis"]
QUEUE["Service: queue<br/>Horizon"]
SCHED["Service: scheduler<br/>Scheduler loop"]
end
NGINX --> APP
FRONTEND --> NGINX
APP --> POSTGRES
APP --> REDIS
QUEUE --> APP
QUEUE --> POSTGRES
QUEUE --> REDIS
SCHED --> APP
SCHED --> POSTGRES
SCHED --> REDIS
```

**Diagram sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

**Section sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

## Core Components
- PHP Application Container (Laravel)
  - Built from a custom PHP-FPM base image with system dependencies and extensions installed.
  - Non-root user is created and used for process isolation.
  - Application code is mounted from the host for local development iteration.
  - Depends on PostgreSQL and Redis.

- Nginx Reverse Proxy
  - Serves static assets and proxies PHP requests to the PHP-FPM app container.
  - CORS headers are configured for the frontend origin during development.
  - Exposes the configured application port to the host.

- Node.js Frontend Container
  - Runs the Next.js/Vite development server for the frontend.
  - Mounts the frontend directory for live reload and iterative development.
  - Exposes the development server port to the host.

- PostgreSQL Database
  - Provides relational data persistence with named volume for durability.
  - Configured via environment variables for database name, user, and password.

- Redis
  - Provides caching and session storage for the application.
  - Uses a named volume for persistence.

- Queue Worker and Scheduler
  - Separate containers running Laravel Horizon and a scheduled task runner.
  - Both depend on the app, PostgreSQL, and Redis.
  - Profiles enable selective startup in environments where workers are desired.

**Section sources**
- [docker/php/Dockerfile:1-46](file://docker/php/Dockerfile#L1-L46)
- [docker/node/Dockerfile:1-14](file://docker/node/Dockerfile#L1-L14)
- [docker/nginx/default.conf:1-41](file://docker/nginx/default.conf#L1-L41)
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

## Architecture Overview
The system uses a bridge network to connect all services. Nginx fronts the application and forwards PHP requests to the PHP-FPM app container. The frontend runs independently and communicates with the backend via the Nginx gateway. PostgreSQL and Redis provide persistence and caching respectively. Queue and scheduler containers run alongside the app to handle background tasks and cron-like jobs.

```mermaid
graph TB
CLIENT["Browser / Client"]
NGINX["Nginx"]
APP["PHP-FPM App"]
POSTGRES["PostgreSQL"]
REDIS["Redis"]
FRONTEND["Node.js Dev Server"]
CLIENT --> NGINX
NGINX --> APP
APP --> POSTGRES
APP --> REDIS
FRONTEND -. "development proxy" .-> NGINX
```

**Diagram sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)
- [docker/nginx/default.conf:1-41](file://docker/nginx/default.conf#L1-L41)

## Detailed Component Analysis

### PHP Application Container (Laravel)
- Base Image and Dependencies
  - PHP-FPM base image with system packages and PHP extensions for GD, ZIP, ICU, EXIF, PCNTL, OPcache, and Redis extension.
  - Composer is installed and available for dependency management.
  - Non-root user is created and used for runtime security.

- Working Directory and User
  - Working directory is set to the application root.
  - Runtime user is switched to a non-root user for safer execution.

- Volume Mount
  - Application code is mounted from the host to enable live development.

- Dependencies and Scripts
  - Composer dependencies are declared for Laravel and related packages.
  - Scripts include setup, dev, and test commands.

```mermaid
flowchart TD
Start(["Build PHP App"]) --> InstallDeps["Install system deps<br/>and PHP extensions"]
InstallDeps --> AddComposer["Install Composer"]
AddComposer --> CreateUser["Create non-root user"]
CreateUser --> SetWorkDir["Set working directory"]
SetWorkDir --> SwitchUser["Switch to non-root user"]
SwitchUser --> Ready(["Ready"])
```

**Diagram sources**
- [docker/php/Dockerfile:1-46](file://docker/php/Dockerfile#L1-L46)
- [portal/composer.json:1-90](file://portal/composer.json#L1-L90)

**Section sources**
- [docker/php/Dockerfile:1-46](file://docker/php/Dockerfile#L1-L46)
- [portal/composer.json:1-90](file://portal/composer.json#L1-L90)

### Nginx Reverse Proxy
- Listening and Root
  - Listens on port 80 and serves content from the application public directory.
  - Index files include PHP and HTML fallbacks.

- CORS Configuration
  - Adds CORS headers for the frontend origin during development.
  - Handles preflight OPTIONS requests explicitly.

- PHP Request Handling
  - Proxies PHP requests to the PHP-FPM app container on port 9000.
  - Includes FastCGI parameters and hides server signature.

- Security
  - Denies access to hidden files except well-known paths.

```mermaid
sequenceDiagram
participant C as "Client"
participant N as "Nginx"
participant A as "PHP-FPM App"
C->>N : "HTTP Request"
N->>N : "try_files / index.php"
N->>A : "FastCGI to app : 9000"
A-->>N : "PHP Response"
N-->>C : "HTTP Response"
```

**Diagram sources**
- [docker/nginx/default.conf:1-41](file://docker/nginx/default.conf#L1-L41)
- [docker-compose.yml:15-27](file://docker-compose.yml#L15-L27)

**Section sources**
- [docker/nginx/default.conf:1-41](file://docker/nginx/default.conf#L1-L41)
- [docker-compose.yml:15-27](file://docker-compose.yml#L15-L27)

### Node.js Frontend Container
- Base Image and Working Directory
  - Alpine Node.js base image with working directory set to the frontend path.

- Dependency Management
  - Copies package manifest and installs dependencies.
  - Copies frontend source and exposes the development server port.

- Command
  - Starts the development server with hot reload.

```mermaid
flowchart TD
Build(["Build Node Frontend"]) --> CopyPkg["Copy package manifests"]
CopyPkg --> InstallDeps["Install dependencies"]
InstallDeps --> CopySrc["Copy source code"]
CopySrc --> ExposePort["Expose port 3000"]
ExposePort --> RunDev["Run dev server"]
```

**Diagram sources**
- [docker/node/Dockerfile:1-14](file://docker/node/Dockerfile#L1-L14)
- [portal/package.json:1-18](file://portal/package.json#L1-L18)

**Section sources**
- [docker/node/Dockerfile:1-14](file://docker/node/Dockerfile#L1-L14)
- [portal/package.json:1-18](file://portal/package.json#L1-L18)

### Database Container (PostgreSQL)
- Image and Persistence
  - Uses an Alpine PostgreSQL image.
  - Persists data in a named volume mapped to the container’s data directory.

- Environment Variables
  - Configures database name, user, and password via environment variables.

- Ports
  - Exposes the PostgreSQL port to the host with configurable mapping.

```mermaid
flowchart TD
Start(["Start PostgreSQL"]) --> InitEnv["Load env vars<br/>DB name, user, pass"]
InitEnv --> MountVol["Mount postgres-data volume"]
MountVol --> ExposePort["Expose 5432"]
ExposePort --> Ready(["Ready"])
```

**Diagram sources**
- [docker-compose.yml:42-54](file://docker-compose.yml#L42-L54)

**Section sources**
- [docker-compose.yml:42-54](file://docker-compose.yml#L42-L54)

### Redis Container
- Image and Persistence
  - Uses an Alpine Redis image.
  - Persists data in a named volume under the container’s data directory.

- Ports
  - Exposes the Redis port to the host with configurable mapping.

```mermaid
flowchart TD
Start(["Start Redis"]) --> MountVol["Mount redis-data volume"]
MountVol --> ExposePort["Expose 6379"]
ExposePort --> Ready(["Ready"])
```

**Diagram sources**
- [docker-compose.yml:56-64](file://docker-compose.yml#L56-L64)

**Section sources**
- [docker-compose.yml:56-64](file://docker-compose.yml#L56-L64)

### Queue Worker and Scheduler Containers
- Queue Worker (Horizon)
  - Runs the Horizon command to process queues.
  - Depends on app, PostgreSQL, and Redis.
  - Controlled by a profile for selective startup.

- Scheduler
  - Runs a loop to periodically trigger scheduled tasks.
  - Depends on app, PostgreSQL, and Redis.
  - Controlled by a profile for selective startup.

```mermaid
sequenceDiagram
participant Q as "Queue Container"
participant APP as "PHP App"
participant DB as "PostgreSQL"
participant R as "Redis"
Q->>APP : "php artisan horizon"
APP->>DB : "Read/write jobs"
APP->>R : "Cache/session ops"
Q->>Q : "Restart unless-stopped"
```

**Diagram sources**
- [docker-compose.yml:66-100](file://docker-compose.yml#L66-L100)

**Section sources**
- [docker-compose.yml:66-100](file://docker-compose.yml#L66-L100)

### PHP Application Configuration (Environment and Storage)
- Environment Variables
  - Application name, environment, debug, URL, locale, and maintenance settings are defined.
  - Database defaults to SQLite locally; production should override with PostgreSQL values.
  - Session and cache drivers are configured for database and Redis.
  - Redis defaults point to localhost; in Docker they must be overridden to the service name.

- Database Configuration
  - Supports multiple drivers including SQLite, MySQL/MariaDB, PostgreSQL, SQL Server.
  - PostgreSQL settings include host, port, database, username, password, charset, collation, and SSL mode.

- Cache and Session Configuration
  - Cache default is database; Redis cache connection is configurable.
  - Session driver defaults to database; Redis-backed sessions are supported.
  - Cookie and SameSite policies are configurable.

- Filesystems
  - Local disks for private and public storage.
  - Public disk URL is derived from the application URL.

- Queues
  - Supports sync, database, Beanstalkd, SQS, and Redis backends.
  - Redis queue connection is configurable.

- Services
  - Credentials for external services (Mailgun, Postmark, SES, Slack) are environment-driven.

```mermaid
flowchart TD
Env[".env.example"] --> AppCfg["Application config"]
Env --> DB["Database config"]
Env --> Cache["Cache config"]
Env --> Session["Session config"]
Env --> FS["Filesystems config"]
Env --> Queue["Queue config"]
Env --> Services["Services config"]
```

**Diagram sources**
- [portal/.env.example:1-66](file://portal/.env.example#L1-L66)
- [portal/config/app.php:1-127](file://portal/config/app.php#L1-L127)
- [portal/config/database.php:1-185](file://portal/config/database.php#L1-L185)
- [portal/config/cache.php:1-118](file://portal/config/cache.php#L1-L118)
- [portal/config/session.php:1-218](file://portal/config/session.php#L1-L218)
- [portal/config/filesystems.php:1-81](file://portal/config/filesystems.php#L1-L81)
- [portal/config/queue.php:1-130](file://portal/config/queue.php#L1-L130)
- [portal/config/services.php:1-39](file://portal/config/services.php#L1-L39)

**Section sources**
- [portal/.env.example:1-66](file://portal/.env.example#L1-L66)
- [portal/config/app.php:1-127](file://portal/config/app.php#L1-L127)
- [portal/config/database.php:1-185](file://portal/config/database.php#L1-L185)
- [portal/config/cache.php:1-118](file://portal/config/cache.php#L1-L118)
- [portal/config/session.php:1-218](file://portal/config/session.php#L1-L218)
- [portal/config/filesystems.php:1-81](file://portal/config/filesystems.php#L1-L81)
- [portal/config/queue.php:1-130](file://portal/config/queue.php#L1-L130)
- [portal/config/services.php:1-39](file://portal/config/services.php#L1-L39)

## Dependency Analysis
- Service Dependencies
  - app depends on postgres and redis.
  - nginx depends on app.
  - frontend depends on nginx.
  - queue and scheduler depend on app, postgres, and redis.

- Network
  - All services join the same bridge network for internal communication.

- Volumes
  - postgres-data and redis-data volumes persist database and cache data.

```mermaid
graph LR
APP["app"] --> POSTGRES["postgres"]
APP --> REDIS["redis"]
NGINX["nginx"] --> APP
FRONTEND["frontend"] --> NGINX
QUEUE["queue"] --> APP
QUEUE --> POSTGRES
QUEUE --> REDIS
SCHED["scheduler"] --> APP
SCHED --> POSTGRES
SCHED --> REDIS
```

**Diagram sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

**Section sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

## Performance Considerations
- PHP-FPM and Nginx
  - Use PHP-FPM with appropriate process and thread settings aligned with CPU cores.
  - Tune Nginx worker processes and connections for concurrent load.

- PostgreSQL
  - Configure connection limits and autovacuum settings.
  - Use SSD-backed storage for improved I/O performance.

- Redis
  - Enable persistence modes (RDB/AOF) as needed.
  - Monitor memory usage and eviction policies.

- Frontend
  - Use Vite’s production build for optimized assets in staging/production.
  - Enable gzip/brotli compression in Nginx for reduced payload sizes.

- Resource Allocation
  - Assign CPU and memory limits per service in Compose for predictable performance.
  - Use separate containers for queue and scheduler to isolate workloads.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Cannot reach the application in the browser
  - Verify Nginx is listening on the expected port and serving the correct root.
  - Confirm PHP requests are proxied to app:9000.

- PHP errors or blank pages
  - Check PHP-FPM logs and ensure the app container is healthy.
  - Validate database connectivity and credentials.

- Database connection failures
  - Ensure the postgres container is running and accepting connections.
  - Confirm the application’s database host is set to the service name.

- Redis connection failures
  - Ensure the redis container is running and accessible.
  - Verify Redis host and port in application configuration.

- CORS errors in development
  - Confirm CORS headers are present for the frontend origin.
  - Check that preflight OPTIONS requests are handled.

- Frontend not updating
  - Confirm the frontend container is running the dev server.
  - Verify the development port is exposed and mapped correctly.

- Queue or scheduler not running
  - Confirm the worker profile is enabled if using profiles.
  - Check logs for errors and dependencies.

**Section sources**
- [docker/nginx/default.conf:1-41](file://docker/nginx/default.conf#L1-L41)
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

## Conclusion
This Docker-based deployment provides a robust, modular, and scalable foundation for the portal stack. By leveraging Compose, environment-driven configuration, and dedicated containers for each component, teams can develop, test, and deploy efficiently. The architecture supports horizontal scaling of the app container and separation of concerns for queues and scheduling.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Step-by-Step Deployment Instructions
- Prerequisites
  - Install Docker and Docker Compose.
  - Clone the repository and navigate to the project root.

- Prepare Environment
  - Copy the example environment file to a new environment file and adjust values for your environment.
  - Ensure ports for the application, frontend, PostgreSQL, and Redis are available on the host.

- Build and Start Services
  - Bring up the stack with Compose.
  - Wait for all services to become healthy.

- Initial Setup
  - Run application setup scripts to install dependencies, generate keys, and migrate the database.
  - Start the frontend development server.

- Access the Application
  - Open the application URL in a browser.
  - Access the frontend at the configured development port.

- Scale and Operate
  - Scale the app container horizontally as needed.
  - Use separate profiles to start workers when required.

**Section sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)
- [portal/composer.json:1-90](file://portal/composer.json#L1-L90)
- [portal/package.json:1-18](file://portal/package.json#L1-L18)
- [portal/vite.config.js:1-19](file://portal/vite.config.js#L1-L19)

### Health Checks
- Define explicit health checks for each service:
  - app: probe the PHP-FPM socket or a simple endpoint.
  - nginx: probe the application root or a dedicated health endpoint.
  - postgres: use a database probe script or psql command.
  - redis: use redis-cli ping.
  - frontend: probe the development server port.

- Compose Healthcheck Fields
  - Add healthcheck directives to each service definition to enable automatic restarts on failure.

**Section sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

### Scaling Strategies
- Horizontal Scaling
  - Scale the app service to multiple replicas behind a load balancer.
  - Ensure shared state is externalized (PostgreSQL, Redis).

- Worker Scaling
  - Run multiple queue and scheduler containers for increased throughput.
  - Use distinct queues and priorities for critical tasks.

- Resource Allocation
  - Set CPU and memory limits per service.
  - Use placement constraints for resource-intensive workloads.

**Section sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

### Resource Allocation
- CPU and Memory
  - Assign reservations and limits to each service.
  - Monitor utilization and adjust based on observed load.

- Storage
  - Use bind mounts or volumes for persistent data.
  - Back up volumes regularly and monitor disk usage.

**Section sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)