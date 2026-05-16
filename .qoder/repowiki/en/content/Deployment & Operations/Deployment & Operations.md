# Deployment & Operations

<cite>
**Referenced Files in This Document**
- [docker-compose.yml](file://docker-compose.yml)
- [default.conf](file://docker/nginx/default.conf)
- [Dockerfile (PHP)](file://docker/php/Dockerfile)
- [Dockerfile (Node)](file://docker/node/Dockerfile)
- [app.php](file://portal/config/app.php)
- [database.php](file://portal/config/database.php)
- [logging.php](file://portal/config/logging.php)
- [composer.json](file://portal/composer.json)
- [web.php](file://portal/routes/web.php)
- [api.php](file://portal/routes/api.php)
- [2026_05_15_070001_create_hostings_table.php](file://portal/database/migrations/2026_05_15_070001_create_hostings_table.php)
- [2026_05_15_070002_create_sites_table.php](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php)
- [2026_05_15_080005_create_deployment_jobs_table.php](file://portal/database/migrations/2026_05_15_080005_create_deployment_jobs_table.php)
- [2026_05_15_080006_create_deployment_job_sites_table.php](file://portal/database/migrations/2026_05_15_080006_create_deployment_job_sites_table.php)
- [CheckSiteHealth.php](file://portal/app/Console/Commands/CheckSiteHealth.php)
- [SettingsController.php](file://portal/app/Http/Controllers/Portal/SettingsController.php)
- [ActivityLogService.php](file://portal/app/Services/ActivityLogService.php)
- [DeploymentController.php](file://portal/app/Http/Controllers/Portal/DeploymentController.php)
- [DeploymentJob.php](file://portal/app/Models/DeploymentJob.php)
- [DeploymentJobSite.php](file://portal/app/Models/DeploymentJobSite.php)
- [DispatchBulkDeployment.php](file://portal/app/Jobs/DispatchBulkDeployment.php)
- [PushPluginToSite.php](file://portal/app/Jobs/PushPluginToSite.php)
- [package.json](file://portal/frontend/package.json)
- [next.config.ts](file://portal/frontend/next.config.ts)
- [.gitignore (frontend)](file://portal/frontend/.gitignore)
- [deployments/page.tsx](file://portal/frontend/src/app/(dashboard)/deployments/page.tsx)
- [index.ts (types)](file://portal/frontend/src/types/index.ts)
</cite>

## Update Summary
**Changes Made**
- Added comprehensive deployment system documentation covering bulk deployment capabilities
- Documented new DeploymentController with support for multiple site deployments
- Added DeploymentJob and DeploymentJobSite models documentation
- Included frontend deployment detail interfaces with live monitoring
- Updated API surface to include deployment management endpoints
- Enhanced monitoring and progress tracking capabilities

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Deployment System](#deployment-system)
7. [Dependency Analysis](#dependency-analysis)
8. [Performance Considerations](#performance-considerations)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Conclusion](#conclusion)
11. [Appendices](#appendices)

## Introduction
This document provides comprehensive guidance for deploying and operating the platform using Docker-based containers. It covers container configuration, environment setup, scaling strategies, infrastructure requirements, CI/CD considerations, database migrations and backups, monitoring and logging, load balancing and reverse proxy with Nginx, SSL/TLS and security hardening, maintenance procedures, and disaster recovery.

**Updated** Added coverage of the new deployment system with bulk deployment capabilities, real-time progress tracking, and comprehensive job management.

## Project Structure
The deployment stack is orchestrated with Docker Compose and includes:
- PHP application service built from a custom PHP-FPM Dockerfile
- Nginx reverse proxy serving static assets and routing API requests to the PHP application
- PostgreSQL database for persistent relational data
- Redis for caching and queues
- Frontend development container running Next.js locally
- Optional queue and scheduler services for Horizon and scheduled tasks

```mermaid
graph TB
subgraph "Network: epos-network"
APP["PHP App<br/>epos-app"]
NGINX["Nginx<br/>epos-nginx"]
FRONT["Frontend Dev<br/>epos-frontend"]
DB["PostgreSQL<br/>epos-postgres"]
RDS["Redis<br/>epos-redis"]
QUEUE["Queue (Horizon)<br/>epos-queue"]
SCHED["Scheduler<br/>epos-scheduler"]
ENDPOINT["Deployment Controller<br/>API Endpoints"]
JOB["Deployment Job<br/>Database Tables"]
BULK["Bulk Deployment<br/>Queue Processing"]
ENDPOINT --> JOB
JOB --> BULK
BULK --> APP
ENDPOINT --> APP
ENDPOINT --> DB
JOB --> DB
BULK --> DB
BULK --> RDS
ENDPOINT --> RDS
ENDPOINT --> NGINX
```

**Diagram sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)
- [DeploymentController.php:15-215](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L15-L215)
- [DispatchBulkDeployment.php:14-37](file://portal/app/Jobs/DispatchBulkDeployment.php#L14-L37)

**Section sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)

## Core Components
- PHP Application Service
  - Built from a PHP 8.2 FPM base image with system extensions and Redis PECL module installed.
  - Non-root user is created and used for process isolation.
  - Mounted volume syncs the portal application code into the container.
  - Depends on PostgreSQL and Redis.

- Nginx Reverse Proxy
  - Serves the PHP application via FastCGI to port 9000 inside the app container.
  - Exposes port 80 mapped to the host via APP_PORT with defaults.
  - Provides CORS headers for local frontend development.
  - Denies access to hidden files except well-known paths.

- PostgreSQL Database
  - Named volume persists relational data.
  - Environment variables configure database name, user, and password.
  - Exposed on host port 5432 with configurable override.

- Redis
  - Named volume persists cached data and supports queues.
  - Exposed on host port 6379 with configurable override.

- Frontend Development Container
  - Node 20 Alpine image with npm scripts.
  - Mounts frontend code and runs Next.js dev server on port 3000.
  - Rewrites API requests to the backend for local development.

- Queue and Scheduler
  - Queue service runs Horizon to process queues.
  - Scheduler service periodically invokes scheduled tasks.

**Section sources**
- [docker/php/Dockerfile:1-46](file://docker/php/Dockerfile#L1-L46)
- [docker/node/Dockerfile:1-14](file://docker/node/Dockerfile#L1-L14)
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)
- [default.conf:1-41](file://docker/nginx/default.conf#L1-L41)

## Architecture Overview
The platform uses a reverse-proxy fronted PHP application. The frontend communicates with the backend via Nginx rewrites during development. Production deployments should expose Nginx to the internet and secure traffic with TLS termination or pass-through depending on the chosen strategy.

**Updated** Enhanced with deployment system architecture including bulk deployment processing and real-time monitoring.

```mermaid
sequenceDiagram
participant Browser as "Browser"
participant Nginx as "Nginx"
participant PHP as "PHP App"
participant DB as "PostgreSQL"
participant Cache as "Redis"
participant Queue as "Queue System"
Browser->>Nginx : "HTTP Request"
Nginx->>PHP : "FastCGI to : 9000"
PHP->>DB : "SQL Queries"
PHP->>Cache : "Cache Reads/Writes"
PHP->>Queue : "Deployment Jobs"
Queue->>PHP : "Process Deployments"
PHP-->>Nginx : "Response"
Nginx-->>Browser : "HTTP Response"
```

**Diagram sources**
- [docker-compose.yml:15-40](file://docker-compose.yml#L15-L40)
- [default.conf:30-35](file://docker/nginx/default.conf#L30-L35)
- [DeploymentController.php:24-82](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L24-L82)

## Detailed Component Analysis

### Reverse Proxy and Load Balancing (Nginx)
- Nginx listens on port 80 and serves the PHP application's public directory.
- Static asset limits and CORS headers are configured for local development.
- PHP requests are proxied to the PHP application container on port 9000.
- Access to hidden files is denied except for well-known paths.

Operational guidance:
- For production, bind Nginx to the host IP and configure TLS termination.
- Use upstream blocks and multiple Nginx instances behind a hardware or cloud load balancer for high availability.
- Enable gzip and cache headers for static assets.

**Section sources**
- [default.conf:1-41](file://docker/nginx/default.conf#L1-L41)
- [docker-compose.yml:15-26](file://docker-compose.yml#L15-L26)

### PHP Application Container
- PHP-FPM with required extensions and Redis support.
- Composer is available inside the container for dependency management.
- Non-root user ensures safer runtime execution.

Scaling considerations:
- Run multiple PHP application replicas behind a load balancer.
- Use sticky sessions if required by session storage; otherwise rely on external cache/session stores.

**Section sources**
- [docker/php/Dockerfile:1-46](file://docker/php/Dockerfile#L1-L46)
- [docker-compose.yml:2-13](file://docker-compose.yml#L2-L13)

### Frontend Development Container
- Next.js dev server runs on port 3000.
- Local rewrites route API calls to the backend for seamless development.

Production guidance:
- Build and deploy the frontend using a CDN or Nginx static serving.
- Configure environment variables for API base URL and feature flags.

**Section sources**
- [docker/node/Dockerfile:1-14](file://docker/node/Dockerfile#L1-L14)
- [next.config.ts:1-15](file://portal/frontend/next.config.ts#L1-L15)
- [.gitignore (frontend):1-42](file://portal/frontend/.gitignore#L1-L42)

### Database and Migrations
- Default connection is SQLite in the provided configuration.
- PostgreSQL and Redis configurations are available for production.
- Migrations define hostings, sites, and related tables.

**Updated** Added deployment-specific migrations for job tracking and progress monitoring.

Migration and backup procedures:
- Apply migrations using the application container.
- Back up PostgreSQL using logical dumps or managed services snapshots.
- Back up Redis persistence volume for cache continuity.

**Section sources**
- [database.php:20-117](file://portal/config/database.php#L20-L117)
- [2026_05_15_070001_create_hostings_table.php:1-27](file://portal/database/migrations/2026_05_15_070001_create_hostings_table.php#L1-L27)
- [2026_05_15_070002_create_sites_table.php:1-35](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php#L1-L35)
- [2026_05_15_080005_create_deployment_jobs_table.php:1-31](file://portal/database/migrations/2026_05_15_080005_create_deployment_jobs_table.php#L1-L31)
- [2026_05_15_080006_create_deployment_job_sites_table.php:1-27](file://portal/database/migrations/2026_05_15_080006_create_deployment_job_sites_table.php#L1-L27)

### Queues and Scheduled Tasks
- Queue service runs Horizon to process queues.
- Scheduler service executes scheduled tasks every minute.

**Updated** Enhanced with deployment-specific queue processing for bulk deployments.

Operational guidance:
- Scale queue workers horizontally as needed.
- Ensure Redis connectivity and proper queue configuration.
- Monitor Horizon UI for failed jobs and retry policies.
- Deployment jobs are processed on dedicated 'deployments' queue.

**Section sources**
- [docker-compose.yml:66-100](file://docker-compose.yml#L66-L100)
- [DispatchBulkDeployment.php:30-34](file://portal/app/Jobs/DispatchBulkDeployment.php#L30-L34)

### Health Monitoring and Site Status Checks
- A console command periodically evaluates site connectivity based on last ping timestamps and emits notifications.
- Activity logs are recorded for site disconnections and recoveries.

Operational guidance:
- Configure Telegram bot token and chat ID via settings endpoints.
- Schedule the health check command via the scheduler service.

**Section sources**
- [CheckSiteHealth.php:1-95](file://portal/app/Console/Commands/CheckSiteHealth.php#L1-L95)
- [SettingsController.php:1-49](file://portal/app/Http/Controllers/Portal/SettingsController.php#L1-L49)
- [ActivityLogService.php:1-49](file://portal/app/Services/ActivityLogService.php#L1-L49)

### Logging and Observability
- Default logging channel is stack-based with configurable daily rotation.
- Slack and Papertrail channels are available for external integrations.
- Stderr and syslog channels support centralized logging.

Operational guidance:
- Configure LOG_CHANNEL and LOG_LEVEL for environments.
- Integrate with external log aggregation systems using stderr or syslog.

**Section sources**
- [logging.php:1-133](file://portal/config/logging.php#L1-L133)
- [app.php:121-124](file://portal/config/app.php#L121-L124)

### API Surface and Authentication
- Public authentication endpoints and protected routes gated by Sanctum and role middleware.
- Admin-only endpoints for managing hostings, users, and settings.

**Updated** Added comprehensive deployment management endpoints.

Operational guidance:
- Enforce HTTPS in production and configure trusted proxies.
- Use role middleware to restrict administrative actions.
- Deployment endpoints are accessible to admin and dev roles.

**Section sources**
- [api.php:1-110](file://portal/routes/api.php#L1-L110)
- [web.php:1-8](file://portal/routes/web.php#L1-L8)

## Deployment System

### Overview
The platform now includes a comprehensive deployment system supporting bulk deployments across multiple WordPress sites with real-time progress tracking and job management capabilities.

### API Endpoints
The deployment system exposes the following REST endpoints:

- `POST /api/deployments` - Create a new deployment job
- `GET /api/deployments` - List deployment jobs
- `GET /api/deployments/{deploymentJob}` - Show deployment job details
- `GET /api/deployments/{deploymentJob}/progress` - Get progress counts
- `POST /api/deployments/{deploymentJob}/retry-failed` - Retry failed deployments
- `POST /api/deployments/{deploymentJob}/cancel` - Cancel deployment

### Deployment Workflow
1. **Job Creation**: Admin/Dev users create deployment jobs specifying plugin version and target sites
2. **Bulk Processing**: System fans out individual deployment tasks to each target site
3. **Real-time Tracking**: Progress is tracked per site with status updates
4. **Completion Handling**: Final status is determined based on success/failure ratios

### Database Schema
The deployment system introduces two new tables:

**deployment_jobs**
- Tracks overall deployment job state and statistics
- Stores plugin version, initiator, and timing information
- Maintains counts for success/failure tracking

**deployment_job_sites**
- Tracks individual site deployment progress
- Stores per-site status, error messages, and attempt counts
- Links deployment jobs to specific target sites

### Job Management Features
- **Bulk Deployment**: Deploy to multiple sites simultaneously
- **Real-time Progress**: Live monitoring of deployment status
- **Retry Mechanism**: Retry failed deployments selectively
- **Cancellation Support**: Cancel queued or running deployments
- **Error Tracking**: Comprehensive error logging and reporting
- **Activity Logging**: Audit trail of all deployment activities

### Frontend Integration
The deployment system includes comprehensive frontend interfaces:

- **Deployments Dashboard**: Lists all deployment jobs with status indicators
- **Progress Tracking**: Real-time progress bars and statistics
- **Detail Views**: Per-job breakdown with individual site status
- **Action Controls**: Retry and cancel operations from the UI

**Section sources**
- [DeploymentController.php:15-215](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L15-L215)
- [DeploymentJob.php:9-36](file://portal/app/Models/DeploymentJob.php#L9-L36)
- [DeploymentJobSite.php:8-26](file://portal/app/Models/DeploymentJobSite.php#L8-L26)
- [DispatchBulkDeployment.php:14-37](file://portal/app/Jobs/DispatchBulkDeployment.php#L14-L37)
- [PushPluginToSite.php:17-116](file://portal/app/Jobs/PushPluginToSite.php#L17-L116)
- [deployments/page.tsx:22-177](file://portal/frontend/src/app/(dashboard)/deployments/page.tsx#L22-L177)
- [index.ts (types):98-134](file://portal/frontend/src/types/index.ts#L98-L134)

## Dependency Analysis
The application depends on:
- PHP 8.2 runtime and extensions
- PostgreSQL for primary data
- Redis for caching and queues
- Composer for dependency management
- Next.js for frontend development

**Updated** Enhanced with deployment system dependencies including queue processing and real-time monitoring.

```mermaid
graph LR
PHP["PHP App"] --> PG["PostgreSQL"]
PHP --> RD["Redis"]
PHP --> CM["Composer"]
FE["Frontend Dev"] --> NG["Nginx"]
NG --> PHP
DEP["Deployment System"] --> PHP
DEP --> QUEUE["Queue Workers"]
DEP --> REDIS["Redis Queue"]
```

**Diagram sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)
- [composer.json:1-90](file://portal/composer.json#L1-L90)
- [DispatchBulkDeployment.php:30-34](file://portal/app/Jobs/DispatchBulkDeployment.php#L30-L34)

**Section sources**
- [docker-compose.yml:1-109](file://docker-compose.yml#L1-L109)
- [composer.json:1-90](file://portal/composer.json#L1-L90)

## Performance Considerations
- PHP OPcache and Bcmath/Intl extensions are enabled for improved performance.
- Redis configured for caching and queue backplane.
- Use persistent connections and connection pooling for PostgreSQL and Redis.
- Enable gzip and browser caching for static assets via Nginx.
- Scale PHP replicas behind Nginx and use Redis clustering for high throughput.

**Updated** Added deployment system performance considerations including queue scaling and concurrent processing.

- **Queue Scaling**: Deploy dedicated queue workers for deployment processing
- **Concurrent Execution**: Fan-out bulk deployments across multiple worker processes
- **Connection Pooling**: Optimize database connections for high-volume deployment operations
- **Memory Management**: Monitor memory usage during bulk deployment operations
- **Timeout Configuration**: Proper timeout handling for long-running deployment tasks

## Troubleshooting Guide
Common operational issues and resolutions:
- Application not reachable
  - Verify Nginx is listening on the expected port and routing to the PHP container.
  - Confirm CORS headers for local development and origin allowances for production.

- Database connectivity failures
  - Check PostgreSQL credentials and network reachability.
  - Ensure migrations are applied before startup.

- Queue processing not working
  - Confirm Redis is reachable and Horizon is running.
  - Review queue worker logs and retry policies.
  - Verify deployment-specific queue configuration.

- Deployment failures
  - Check individual site deployment logs for specific error messages.
  - Verify plugin version availability and download URLs.
  - Ensure target sites are connected and accessible.
  - Monitor queue worker capacity for deployment processing.

- Logging not appearing externally
  - Set LOG_CHANNEL to daily or stderr and forward container logs to a collector.
  - Validate Slack/Papertrail webhook URLs and credentials.

**Updated** Added deployment system troubleshooting guidance.

**Section sources**
- [default.conf:13-27](file://docker/nginx/default.conf#L13-L27)
- [docker-compose.yml:42-64](file://docker-compose.yml#L42-L64)
- [logging.php:76-113](file://portal/config/logging.php#L76-L113)
- [PushPluginToSite.php:64-71](file://portal/app/Jobs/PushPluginToSite.php#L64-L71)

## Conclusion
The platform is designed for containerized deployment with clear separation of concerns: Nginx for reverse proxy, PHP for application logic, PostgreSQL for persistence, and Redis for caching and queues. The new deployment system adds comprehensive bulk deployment capabilities with real-time monitoring and job management. By following the operational guidance—scaling horizontally, securing traffic, maintaining robust logging, and automating migrations—you can achieve reliable, observable, and maintainable operations.

**Updated** Enhanced conclusion to reflect the addition of comprehensive deployment system capabilities.

## Appendices

### Infrastructure Requirements
- Servers
  - Minimum: 2 vCPUs, 4 GB RAM, 50 GB SSD for development.
  - Production: Horizontal scaling with load balancer, auto-scaling groups, and managed PostgreSQL/Redis offerings.

**Updated** Added deployment system infrastructure requirements.

- **Queue Workers**: Dedicated deployment workers for bulk processing
- **Storage**: Additional disk space for plugin packages and deployment artifacts
- **Network**: Increased bandwidth for plugin distribution to multiple sites

### CI/CD Pipeline Setup
- Build stages
  - Build PHP container with Composer dependencies.
  - Build Node container for frontend assets.
- Test stages
  - Run unit and feature tests via Composer scripts.
- Deploy stages
  - Push images to a registry.
  - Orchestrate deployment with Docker Compose or Kubernetes.
- Automation
  - Use GitHub Actions or GitLab CI to automate builds, tests, and deployments.

**Updated** Deployment system CI/CD considerations.

- **Deployment Testing**: Automated testing of deployment workflows
- **Rollback Procedures**: Automated rollback for failed deployments
- **Monitoring Integration**: Deployment metrics and alerting integration

### SSL/TLS Certificate Management
- Option 1: TLS termination at Nginx with ACME automation.
- Option 2: TLS passthrough to PHP application if required by infrastructure.
- Rotate certificates and reload Nginx after renewal.

### Maintenance Procedures
- Updates and patches
  - Regularly update base images and dependencies.
  - Apply database migrations in maintenance windows.
- System health checks
  - Monitor Nginx, PHP, PostgreSQL, and Redis health.
  - Use scheduled tasks to validate connectivity and alert on failures.

**Updated** Added deployment system maintenance procedures.

- **Deployment Health**: Monitor deployment queue health and worker status
- **Plugin Management**: Regular plugin version updates and compatibility checks
- **Storage Monitoring**: Monitor disk usage for plugin packages and deployment logs
- **Performance Tuning**: Optimize queue worker scaling based on deployment volume

**Section sources**
- [CheckSiteHealth.php:16-73](file://portal/app/Console/Commands/CheckSiteHealth.php#L16-L73)

### Disaster Recovery and Backup
- Backups
  - PostgreSQL: Logical dumps or managed snapshots.
  - Redis: Persisted volume plus periodic snapshots.
  - Application code: Version-controlled and containerized.
- Restoration
  - Restore database from latest dump.
  - Recreate containers and re-run migrations.
  - Rehydrate caches from backups where applicable.

**Updated** Added deployment system disaster recovery considerations.

- **Deployment State**: Backup deployment job states and progress tracking
- **Plugin Artifacts**: Maintain plugin package versions for restoration
- **Queue Recovery**: Handle queue state recovery after system failures
- **Partial Deployment Recovery**: Ability to resume interrupted bulk deployments