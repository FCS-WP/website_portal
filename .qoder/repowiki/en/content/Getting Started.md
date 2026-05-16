# Getting Started

<cite>
**Referenced Files in This Document**
- [composer.json](file://portal/composer.json)
- [package.json](file://portal/package.json)
- [docker-compose.yml](file://docker-compose.yml)
- [.env.example](file://portal/.env.example)
- [database.php](file://portal/config/database.php)
- [app.php](file://portal/config/app.php)
- [services.php](file://portal/config/services.php)
- [Dockerfile (PHP)](file://docker/php/Dockerfile)
- [Dockerfile (Node)](file://docker/node/Dockerfile)
- [Next Config](file://portal/frontend/next.config.ts)
- [Web Routes](file://portal/routes/web.php)
- [API Routes](file://portal/routes/api.php)
- [Create Users Migration](file://portal/database/migrations/0001_01_01_000000_create_users_table.php)
- [Permission Tables Migration](file://portal/database/migrations/2026_05_15_061634_create_permission_tables.php)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Installation Steps](#installation-steps)
4. [Environment Setup](#environment-setup)
5. [Database Configuration](#database-configuration)
6. [Application Bootstrapping](#application-bootstrapping)
7. [Verification and Basic Usage](#verification-and-basic-usage)
8. [Accessing the Web Interface](#accessing-the-web-interface)
9. [Initial Dashboard Layout](#initial-dashboard-layout)
10. [Common Installation Issues and Troubleshooting](#common-installation-issues-and-troubleshooting)
11. [Conclusion](#conclusion)

## Introduction
This guide helps you install and run EPOS Portal locally. It covers prerequisites, environment setup, database configuration, application bootstrapping, and initial verification. The project uses Laravel for the backend and Next.js for the frontend, orchestrated via Docker Compose.

## Prerequisites
Ensure your local machine meets the following requirements before installing EPOS Portal:

- PHP 8.2+ (required by the application)
- Node.js 18+ (required by the frontend build pipeline)
- Docker and Docker Compose (used to run the app, database, and cache services)
- PostgreSQL (required by the application)
- Redis (required by the application)

These requirements are enforced by the project configuration:
- PHP version constraint is defined in the backend package manager configuration.
- The frontend build pipeline requires Node.js 18+.
- Docker Compose runs PostgreSQL and Redis as services and PHP/Next.js containers for the app and frontend.
- The application’s database configuration supports PostgreSQL and Redis.

**Section sources**
- [composer.json:8-15](file://portal/composer.json#L8-L15)
- [package.json:1-18](file://portal/package.json#L1-L18)
- [docker-compose.yml:42-64](file://docker-compose.yml#L42-L64)
- [database.php:87-100](file://portal/config/database.php#L87-L100)

## Installation Steps
Follow these steps to clone the repository and prepare your environment:

1. Clone the repository to your local machine.
2. Navigate to the project root directory.
3. Prepare the environment variables by copying the example file and generating an application key.
4. Build and start the services using Docker Compose.
5. Install backend dependencies and build the frontend assets.
6. Run database migrations to initialize the schema.

These steps are automated by the scripts defined in the backend package manager configuration.

**Section sources**
- [composer.json:37-45](file://portal/composer.json#L37-L45)

## Environment Setup
Set up your environment variables and application key:

1. Copy the example environment file to create your own configuration.
2. Generate the application key for encryption and session signing.
3. Configure the application URL and environment as needed.

The environment file defines defaults for database, cache, queues, Redis, and mailers. Adjust these values according to your setup.

**Section sources**
- [composer.json:40-41](file://portal/composer.json#L40-L41)
- [composer.json:41](file://portal/composer.json#L41)
- [.env.example:1-66](file://portal/.env.example#L1-L66)
- [app.php:16, 29, 42, 55:16-55](file://portal/config/app.php#L16-L55)

## Database Configuration
EPOS Portal supports multiple database drivers. The default is SQLite, but PostgreSQL is recommended for production-like environments. The application’s configuration supports PostgreSQL, MySQL, MariaDB, SQL Server, and SQLite.

Key configuration points:
- Default connection is SQLite by default.
- PostgreSQL connection settings include host, port, database name, username, and password.
- Redis client, host, port, and database selection are configurable.

To use PostgreSQL:
- Set the default connection to PostgreSQL.
- Provide the host, port, database name, username, and password.
- Ensure the database exists and is reachable from the PHP container.

**Section sources**
- [database.php:20](file://portal/config/database.php#L20)
- [database.php:87-100](file://portal/config/database.php#L87-L100)
- [database.php:146-182](file://portal/config/database.php#L146-L182)
- [.env.example:23-28](file://portal/.env.example#L23-L28)
- [.env.example:45-48](file://portal/.env.example#L45-L48)

## Application Bootstrapping
Bootstrap the application by running the setup script, which performs the following actions:
- Installs backend dependencies.
- Copies the environment file if missing and generates the application key.
- Runs database migrations to create tables.
- Installs frontend dependencies.
- Builds the frontend assets.

This ensures the application is ready to run after the initial setup.

**Section sources**
- [composer.json:38-44](file://portal/composer.json#L38-L44)

## Verification and Basic Usage
After the setup completes, verify the installation:

- Confirm the frontend dev server is running and accessible.
- Verify the backend API responds to authentication endpoints.
- Log in using the initial admin user created during seeding.

Basic usage examples:
- Access the login page and authenticate.
- Navigate to the dashboard to view available sections.
- Manage hostings, users, and sites via the admin panel.

**Section sources**
- [API Routes:7-15](file://portal/routes/api.php#L7-L15)
- [Web Routes:5-7](file://portal/routes/web.php#L5-L7)

## Accessing the Web Interface
The application exposes the following ports by default:
- Frontend development server: Port 3000
- Nginx reverse proxy: Port 8080
- PostgreSQL: Port 5432
- Redis: Port 6379

Configure the frontend rewrite to route API requests to the backend API server.

**Section sources**
- [docker-compose.yml:18-19](file://docker-compose.yml#L18-L19)
- [docker-compose.yml:45-46](file://docker-compose.yml#L45-L46)
- [docker-compose.yml:59-60](file://docker-compose.yml#L59-L60)
- [Next Config:4-11](file://portal/frontend/next.config.ts#L4-L11)

## Initial Dashboard Layout
Upon successful login, the dashboard provides access to:
- Hostings management
- Sites management
- Users management
- Settings and notifications

The frontend uses a structured layout with header, sidebar navigation, and content areas. The routing groups permissions for admin, developer, and marketing roles.

**Section sources**
- [API Routes:17-38](file://portal/routes/api.php#L17-L38)

## Common Installation Issues and Troubleshooting
Below are common issues and their resolutions:

- PHP version mismatch
  - Ensure PHP 8.2+ is installed. The Docker PHP image uses PHP 8.2-fpm, and the backend requires PHP 8.2 or higher.
  - Reference: [PHP requirement:9-9](file://portal/composer.json#L9-L9), [PHP Dockerfile:1-1](file://docker/php/Dockerfile#L1-L1)

- Node.js version mismatch
  - Ensure Node.js 18+ is installed. The frontend build pipeline requires Node.js 18+.
  - Reference: [Node requirement:1-18](file://portal/package.json#L1-L18)

- Database connectivity errors
  - Verify PostgreSQL is running and the database credentials match the environment configuration.
  - Reference: [PostgreSQL service:42-54](file://docker-compose.yml#L42-L54), [PostgreSQL config:87-100](file://portal/config/database.php#L87-L100)

- Redis connectivity errors
  - Ensure Redis is running and the Redis host/port match the environment configuration.
  - Reference: [Redis service:56-64](file://docker-compose.yml#L56-L64), [Redis config:146-182](file://portal/config/database.php#L146-L182)

- Application key not set
  - Generate the application key using the setup script or manually.
  - Reference: [Setup script:40-41](file://portal/composer.json#L40-L41)

- Frontend build failures
  - Install frontend dependencies and rebuild the assets using the setup script.
  - Reference: [Setup script:43-44](file://portal/composer.json#L43-L44)

- API route access issues
  - Confirm the frontend rewrite configuration routes API calls to the backend API server.
  - Reference: [Next config rewrite:4-11](file://portal/frontend/next.config.ts#L4-L11)

- Permission-related errors
  - Ensure the permission tables are migrated and roles are assigned to users.
  - Reference: [Permission migrations:12-13](file://portal/database/migrations/2026_05_15_061634_create_permission_tables.php#L12-L13)

**Section sources**
- [composer.json:8-15](file://portal/composer.json#L8-L15)
- [package.json:1-18](file://portal/package.json#L1-18)
- [docker-compose.yml:42-64](file://docker-compose.yml#L42-L64)
- [database.php:87-100](file://portal/config/database.php#L87-L100)
- [database.php:146-182](file://portal/config/database.php#L146-L182)
- [composer.json:40-41](file://portal/composer.json#L40-L41)
- [composer.json:43-44](file://portal/composer.json#L43-L44)
- [Next Config:4-11](file://portal/frontend/next.config.ts#L4-L11)
- [Permission Tables Migration:12-13](file://portal/database/migrations/2026_05_15_061634_create_permission_tables.php#L12-L13)

## Conclusion
You have successfully prepared your environment, configured the database and caches, bootstrapped the application, and verified the installation. Use the web interface to explore the dashboard and manage hostings, sites, and users. If you encounter issues, refer to the troubleshooting section for targeted fixes.