# Site Management System

<cite>
**Referenced Files in This Document**
- [Site.php](file://portal/app/Models/Site.php)
- [Hosting.php](file://portal/app/Models/Hosting.php)
- [User.php](file://portal/app/Models/User.php)
- [SiteController.php](file://portal/app/Http/Controllers/Portal/SiteController.php)
- [HostingController.php](file://portal/app/Http/Controllers/Portal/HostingController.php)
- [UserController.php](file://portal/app/Http/Controllers/Portal/UserController.php)
- [CheckSiteHealth.php](file://portal/app/Console/Commands/CheckSiteHealth.php)
- [ActivityLogService.php](file://portal/app/Services/ActivityLogService.php)
- [TelegramNotificationService.php](file://portal/app/Services/TelegramNotificationService.php)
- [2026_05_15_070002_create_sites_table.php](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php)
- [2026_05_15_070001_create_hostings_table.php](file://portal/database/migrations/2026_05_15_070001_create_hostings_table.php)
- [2026_05_15_070003_create_site_users_table.php](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php)
- [StoreSiteRequest.php](file://portal/app/Http/Requests/Site/StoreSiteRequest.php)
- [UpdateSiteRequest.php](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php)
- [api.php](file://portal/routes/api.php)
- [agent.php](file://portal/routes/agent.php)
- [class-api.php](file://agent/epos-wp-agent/includes/class-api.php)
- [class-ping.php](file://agent/epos-wp-agent/includes/class-ping.php)
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
This document describes the Site Management System used to manage multiple WordPress sites. It covers the WordPress site registration and onboarding process, including API key generation and initial configuration. It documents the site monitoring and health-check system with periodic status tracking and alerting. It explains user management enabling administrators to assign users to specific sites with delegated permissions. It outlines the site lifecycle from registration through decommissioning. It details the database schema for site records, relationships with hosting providers, and user assignments. Finally, it addresses scaling considerations and performance optimization strategies for managing many WordPress sites.

## Project Structure
The system comprises:
- Backend portal built with Laravel, exposing REST APIs for site, hosting, user, and settings management.
- WordPress plugin agent that communicates with the portal to receive commands, report status, and send periodic pings.
- Database schema with migrations for sites, hostings, site-user assignments, and activity logs.

```mermaid
graph TB
subgraph "Portal (Laravel)"
R_API["Routes: api.php"]
R_AGENT["Routes: agent.php"]
C_SITE["SiteController"]
C_HOST["HostingController"]
C_USER["UserController"]
M_SITE["Site Model"]
M_HOST["Hosting Model"]
M_USER["User Model"]
CMD_HEALTH["Console: CheckSiteHealth"]
SVC_LOG["ActivityLogService"]
SVC_TG["TelegramNotificationService"]
end
subgraph "WordPress Agent"
A_API["class-api.php"]
A_PING["class-ping.php"]
end
R_API --> C_SITE
R_API --> C_HOST
R_API --> C_USER
R_AGENT --> A_API
A_PING --> R_AGENT
C_SITE --> M_SITE
C_HOST --> M_HOST
C_USER --> M_USER
CMD_HEALTH --> M_SITE
CMD_HEALTH --> SVC_LOG
CMD_HEALTH --> SVC_TG
```

**Diagram sources**
- [api.php:1-48](file://portal/routes/api.php#L1-L48)
- [agent.php:1-20](file://portal/routes/agent.php#L1-L20)
- [SiteController.php:1-204](file://portal/app/Http/Controllers/Portal/SiteController.php#L1-L204)
- [HostingController.php:1-83](file://portal/app/Http/Controllers/Portal/HostingController.php#L1-L83)
- [UserController.php:1-137](file://portal/app/Http/Controllers/Portal/UserController.php#L1-L137)
- [Site.php:1-76](file://portal/app/Models/Site.php#L1-L76)
- [Hosting.php:1-31](file://portal/app/Models/Hosting.php#L1-L31)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [CheckSiteHealth.php:1-95](file://portal/app/Console/Commands/CheckSiteHealth.php#L1-L95)
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [class-api.php:1-110](file://agent/epos-wp-agent/includes/class-api.php#L1-L110)
- [class-ping.php:1-83](file://agent/epos-wp-agent/includes/class-ping.php#L1-L83)

**Section sources**
- [api.php:1-48](file://portal/routes/api.php#L1-L48)
- [agent.php:1-20](file://portal/routes/agent.php#L1-L20)

## Core Components
- Site model encapsulates site metadata, API key hashing, status, versions, tags, and relationships to hosting, creator, and users. It includes an access scope for filtering sites by user assignment.
- Hosting model represents hosting provider records and links to sites.
- User model supports roles and permissions via Spatie, with API tokens for authentication.
- SiteController handles listing, creation, updates, deletion, API key regeneration, and activity logs retrieval with access controls.
- HostingController manages hosting providers with counts of associated sites.
- UserController manages users, roles, and activity logging.
- CheckSiteHealth console command periodically evaluates site connectivity based on last ping timestamps and emits notifications.
- ActivityLogService centralizes activity logging with fallback to logs if the table does not exist.
- TelegramNotificationService provides synchronous and queued Telegram messaging with caching of settings.

**Section sources**
- [Site.php:1-76](file://portal/app/Models/Site.php#L1-L76)
- [Hosting.php:1-31](file://portal/app/Models/Hosting.php#L1-L31)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [SiteController.php:1-204](file://portal/app/Http/Controllers/Portal/SiteController.php#L1-L204)
- [HostingController.php:1-83](file://portal/app/Http/Controllers/Portal/HostingController.php#L1-L83)
- [UserController.php:1-137](file://portal/app/Http/Controllers/Portal/UserController.php#L1-L137)
- [CheckSiteHealth.php:1-95](file://portal/app/Console/Commands/CheckSiteHealth.php#L1-L95)
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)

## Architecture Overview
The system uses a client-server pattern:
- Portal (Laravel) exposes REST endpoints for management and monitoring.
- WordPress Agent plugin runs on each site and communicates via authenticated endpoints.
- Health checks run on the server to detect disconnections and recoveries.
- Notifications are sent via Telegram.

```mermaid
sequenceDiagram
participant Admin as "Admin/User"
participant Portal as "Portal API"
participant Agent as "WP Agent"
participant Cron as "WP Cron"
participant Health as "sites : check-health"
Admin->>Portal : "Create Site (with API key)"
Portal-->>Admin : "Return plain API key once"
Agent->>Portal : "Handshake / Ping with X-Agent-Key"
Portal-->>Agent : "OK (200)"
Cron->>Agent : "Trigger every 5 minutes"
Agent->>Portal : "POST /api/agent/ping"
Portal-->>Agent : "OK (200)"
Health->>Portal : "Run daily/periodic"
Portal-->>Health : "Sites needing status change"
Portal-->>Admin : "Telegram alerts"
```

**Diagram sources**
- [SiteController.php:62-92](file://portal/app/Http/Controllers/Portal/SiteController.php#L62-L92)
- [class-api.php:15-45](file://agent/epos-wp-agent/includes/class-api.php#L15-L45)
- [class-ping.php:29-81](file://agent/epos-wp-agent/includes/class-ping.php#L29-L81)
- [CheckSiteHealth.php:16-73](file://portal/app/Console/Commands/CheckSiteHealth.php#L16-L73)
- [agent.php:16-19](file://portal/routes/agent.php#L16-L19)

## Detailed Component Analysis

### Site Registration and Onboarding
- API key generation: During site creation, a random 64-character plaintext key is generated and stored as a SHA-256 hash. The plaintext key is returned once to the caller for secure storage.
- Initial configuration: New sites are created with status pending and optional associations to hosting and user assignments.
- Access control: Listing and viewing are filtered by user assignment for non-admin users.

```mermaid
sequenceDiagram
participant Admin as "Admin/User"
participant API as "SiteController@store"
participant DB as "Sites Table"
participant Log as "ActivityLogService"
Admin->>API : "POST /api/sites"
API->>API : "Generate 64-char key"
API->>DB : "Insert site with hashed key"
API->>Log : "Log site.created"
API-->>Admin : "Return site + plain key"
```

**Diagram sources**
- [SiteController.php:62-92](file://portal/app/Http/Controllers/Portal/SiteController.php#L62-L92)
- [2026_05_15_070002_create_sites_table.php:11-27](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php#L11-L27)
- [ActivityLogService.php:16-48](file://portal/app/Services/ActivityLogService.php#L16-L48)

**Section sources**
- [SiteController.php:62-92](file://portal/app/Http/Controllers/Portal/SiteController.php#L62-L92)
- [StoreSiteRequest.php:14-26](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L14-L26)
- [2026_05_15_070002_create_sites_table.php:11-27](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php#L11-L27)

### Site Monitoring and Health Checks
- Heartbeat: The WordPress agent sends periodic pings to the portal with site URL and payload. Successful pings set connection status to connected; failures set it to error.
- Health evaluation: A scheduled command inspects last_ping_at timestamps against a threshold derived from the configured ping interval multiplied by a multiplier. Sites exceeding the threshold are marked disconnected; recent pings restore connected status.
- Alerts: Disconnection and recovery events trigger Telegram notifications.

```mermaid
flowchart TD
Start(["Run sites:check-health"]) --> Threshold["Compute threshold = now - (ping_interval * 3)"]
Threshold --> FindDisc["Find sites.status=connected AND last_ping_at < threshold"]
FindDisc --> MarkDisc["Set status=disconnected"]
MarkDisc --> LogDisc["Log site.disconnected"]
LogDisc --> NotifyDisc["Queue Telegram notification"]
Threshold --> FindRec["Find sites.status=disconnected AND last_ping_at >= threshold"]
FindRec --> MarkRec["Set status=connected"]
MarkRec --> LogRec["Log site.recovered"]
LogRec --> NotifyRec["Queue Telegram notification"]
NotifyDisc --> End(["Complete"])
NotifyRec --> End
```

**Diagram sources**
- [CheckSiteHealth.php:16-73](file://portal/app/Console/Commands/CheckSiteHealth.php#L16-L73)
- [TelegramNotificationService.php:53-76](file://portal/app/Services/TelegramNotificationService.php#L53-L76)

**Section sources**
- [class-ping.php:29-81](file://agent/epos-wp-agent/includes/class-ping.php#L29-L81)
- [CheckSiteHealth.php:16-73](file://portal/app/Console/Commands/CheckSiteHealth.php#L16-L73)
- [TelegramNotificationService.php:53-76](file://portal/app/Services/TelegramNotificationService.php#L53-L76)

### Site User Management and Delegated Permissions
- Assignment: Administrators can assign users to sites during creation or update via a user_ids array. The relationship is many-to-many via a pivot table.
- Access filtering: Non-admin users can only view sites they are assigned to; listing is scoped accordingly.
- Roles and permissions: Users are managed with roles; role changes are logged.

```mermaid
classDiagram
class Site {
+int id
+string name
+string url
+string status
+timestamp last_ping_at
+users()
}
class User {
+int id
+string name
+string email
+string role
}
class site_users {
+int site_id
+int user_id
}
Site "1" <---> "n" site_users : "many-to-many"
User "1" <---> "n" site_users : "many-to-many"
```

**Diagram sources**
- [Site.php:51-54](file://portal/app/Models/Site.php#L51-L54)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [2026_05_15_070003_create_site_users_table.php:11-17](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php#L11-L17)

**Section sources**
- [SiteController.php:75-78](file://portal/app/Http/Controllers/Portal/SiteController.php#L75-L78)
- [SiteController.php:118-121](file://portal/app/Http/Controllers/Portal/SiteController.php#L118-L121)
- [Site.php:65-74](file://portal/app/Models/Site.php#L65-L74)
- [2026_05_15_070003_create_site_users_table.php:11-17](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php#L11-L17)

### Site Lifecycle Management
- Creation: Admin/Dev creates a site with name, URL, optional hosting, tags, and initial user assignments. API key is generated and returned once.
- Operation: Agents ping the portal periodically; status reflects connectivity.
- Updates: Admin/Dev can modify site attributes and reassign users.
- Decommissioning: Sites can be deleted; activity is logged.

```mermaid
stateDiagram-v2
[*] --> Pending
Pending --> Connected : "Agent pings OK"
Connected --> Disconnected : "Exceeds health threshold"
Disconnected --> Connected : "Recent ping recovers"
Pending --> Deleted : "Delete site"
Connected --> Deleted : "Delete site"
Disconnected --> Deleted : "Delete site"
Deleted --> [*]
```

**Diagram sources**
- [SiteController.php:62-92](file://portal/app/Http/Controllers/Portal/SiteController.php#L62-L92)
- [CheckSiteHealth.php:22-68](file://portal/app/Console/Commands/CheckSiteHealth.php#L22-L68)
- [SiteController.php:138-150](file://portal/app/Http/Controllers/Portal/SiteController.php#L138-L150)

**Section sources**
- [SiteController.php:62-92](file://portal/app/Http/Controllers/Portal/SiteController.php#L62-L92)
- [SiteController.php:114-133](file://portal/app/Http/Controllers/Portal/SiteController.php#L114-L133)
- [SiteController.php:138-150](file://portal/app/Http/Controllers/Portal/SiteController.php#L138-L150)

### Database Schema and Relationships
- Sites: Contains identifiers, URLs, API key hash, status, versions, tags, timestamps, soft deletes, and foreign keys to hosting and creator.
- Hostings: Provider metadata and creator linkage.
- Site-Users Pivot: Many-to-many with unique constraint and timestamps.
- Activity Logs: Centralized audit trail with subject type/id and metadata.

```mermaid
erDiagram
HOSTINGS {
bigint id PK
string name
string provider
text note
bigint created_by FK
timestamps
soft_delete
}
SITES {
bigint id PK
bigint hosting_id FK
string name
string url UK
text description
string api_secret_key
enum status
string wp_version
string php_version
boolean woo_active
timestamp last_ping_at
json tags
bigint created_by FK
timestamps
soft_delete
}
SITE_USERS {
bigint id PK
bigint site_id FK
bigint user_id FK
timestamps
}
USERS {
bigint id PK
string name
string email
string role
boolean is_active
timestamps
}
HOSTINGS ||--o{ SITES : "hosts"
USERS ||--o{ SITE_USERS : "assigned_to"
SITES ||--o{ SITE_USERS : "assigned_users"
```

**Diagram sources**
- [2026_05_15_070002_create_sites_table.php:11-27](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php#L11-L27)
- [2026_05_15_070001_create_hostings_table.php:11-19](file://portal/database/migrations/2026_05_15_070001_create_hostings_table.php#L11-L19)
- [2026_05_15_070003_create_site_users_table.php:11-17](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php#L11-L17)
- [Site.php:41-54](file://portal/app/Models/Site.php#L41-L54)
- [Hosting.php:21-24](file://portal/app/Models/Hosting.php#L21-L24)
- [User.php:15-22](file://portal/app/Models/User.php#L15-L22)

**Section sources**
- [2026_05_15_070002_create_sites_table.php:11-27](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php#L11-L27)
- [2026_05_15_070001_create_hostings_table.php:11-19](file://portal/database/migrations/2026_05_15_070001_create_hostings_table.php#L11-L19)
- [2026_05_15_070003_create_site_users_table.php:11-17](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php#L11-L17)
- [Site.php:41-54](file://portal/app/Models/Site.php#L41-L54)
- [Hosting.php:21-24](file://portal/app/Models/Hosting.php#L21-L24)
- [User.php:15-22](file://portal/app/Models/User.php#L15-L22)

### Agent Communication and Authentication
- Authentication: Agent endpoints require a custom X-Agent-Key header validated against the stored hashed key.
- Endpoints: Plugin install/update, SMTP update/test, and status retrieval are exposed for administrative commands.
- Heartbeat: Agent posts periodic pings with site URL and payload; response determines connection status.

```mermaid
sequenceDiagram
participant Agent as "WP Agent"
participant API as "Agent Routes"
participant Auth as "AgentAuthMiddleware"
participant Ctrl as "AgentController"
participant Site as "Sites"
Agent->>API : "POST /api/agent/ping<br/>Headers : X-Agent-Key, X-Site-Url"
API->>Auth : "Verify X-Agent-Key"
Auth-->>API : "Authorized"
API->>Ctrl : "Dispatch ping"
Ctrl->>Site : "Update last_ping_at"
Ctrl-->>Agent : "200 OK"
```

**Diagram sources**
- [agent.php:16-19](file://portal/routes/agent.php#L16-L19)
- [class-api.php:50-71](file://agent/epos-wp-agent/includes/class-api.php#L50-L71)
- [class-ping.php:50-81](file://agent/epos-wp-agent/includes/class-ping.php#L50-L81)

**Section sources**
- [class-api.php:15-45](file://agent/epos-wp-agent/includes/class-api.php#L15-L45)
- [class-api.php:50-71](file://agent/epos-wp-agent/includes/class-api.php#L50-L71)
- [class-ping.php:29-81](file://agent/epos-wp-agent/includes/class-ping.php#L29-L81)
- [agent.php:16-19](file://portal/routes/agent.php#L16-L19)

## Dependency Analysis
- Controllers depend on models, requests, services, and middleware for authorization and role checks.
- Models define relationships and scopes; Site includes an access scope for non-admin filtering.
- Console command depends on Site model, settings lookup, and notification service.
- Agent routes depend on custom middleware to validate X-Agent-Key.

```mermaid
graph LR
API["routes/api.php"] --> CTRL_SITE["SiteController"]
API --> CTRL_HOST["HostingController"]
API --> CTRL_USER["UserController"]
CTRL_SITE --> MODEL_SITE["Site Model"]
CTRL_HOST --> MODEL_HOST["Hosting Model"]
CTRL_USER --> MODEL_USER["User Model"]
HEALTH["CheckSiteHealth"] --> MODEL_SITE
HEALTH --> SVC_TG["TelegramNotificationService"]
AGENT["routes/agent.php"] --> API_AUTH["AgentAuthMiddleware"]
API_AUTH --> CTRL_AGENT["AgentController"]
```

**Diagram sources**
- [api.php:10-47](file://portal/routes/api.php#L10-L47)
- [SiteController.php:1-204](file://portal/app/Http/Controllers/Portal/SiteController.php#L1-L204)
- [HostingController.php:1-83](file://portal/app/Http/Controllers/Portal/HostingController.php#L1-L83)
- [UserController.php:1-137](file://portal/app/Http/Controllers/Portal/UserController.php#L1-L137)
- [Site.php:1-76](file://portal/app/Models/Site.php#L1-L76)
- [Hosting.php:1-31](file://portal/app/Models/Hosting.php#L1-L31)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [CheckSiteHealth.php:1-95](file://portal/app/Console/Commands/CheckSiteHealth.php#L1-L95)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [agent.php:1-20](file://portal/routes/agent.php#L1-L20)

**Section sources**
- [api.php:10-47](file://portal/routes/api.php#L10-L47)
- [agent.php:16-19](file://portal/routes/agent.php#L16-L19)

## Performance Considerations
- Indexing and constraints: Unique indexes on URL and API key reduce lookup overhead; foreign keys maintain referential integrity.
- Pagination: Listing endpoints paginate results to limit memory and response size.
- Background jobs: Telegram notifications are queued to avoid blocking request threads.
- Caching: Telegram settings are cached to minimize repeated reads from settings storage.
- Scoping: Accessible-by-user scopes prevent unnecessary joins and filtering.
- Health thresholds: Configurable ping intervals and tripping thresholds balance sensitivity and noise.
- Soft deletes: Soft deletes enable recovery without costly schema changes.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Unauthorized agent requests: Ensure X-Agent-Key matches the stored hashed key; verify the portal URL and API key are correctly configured in the agent.
- Missing or expired API key: Regenerate the API key via the admin endpoint; the plaintext key is returned only once.
- Disconnected sites: Confirm agent cron is running and network connectivity; review last_ping_at and health thresholds.
- No Telegram alerts: Verify bot token and default chat ID are configured; check queued job processing.
- Access denied: Non-admin users can only view sites they are assigned to; confirm site-user assignments.

**Section sources**
- [class-api.php:50-71](file://agent/epos-wp-agent/includes/class-api.php#L50-L71)
- [SiteController.php:156-182](file://portal/app/Http/Controllers/Portal/SiteController.php#L156-L182)
- [CheckSiteHealth.php:75-93](file://portal/app/Console/Commands/CheckSiteHealth.php#L75-L93)
- [TelegramNotificationService.php:81-96](file://portal/app/Services/TelegramNotificationService.php#L81-L96)

## Conclusion
The Site Management System provides a robust foundation for registering, operating, and monitoring many WordPress sites. It enforces secure authentication via hashed API keys, tracks site health with automated checks and alerts, and enables delegated administration through user-site assignments. The database schema supports scalability with soft deletes, indexing, and normalized relationships. With background jobs and caching, the system remains responsive under load while maintaining strong auditability and operational visibility.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definitions

- Create Site
  - Method: POST
  - Path: /api/sites
  - Authenticated: Yes
  - Roles: admin, dev
  - Body fields: name*, url* (unique), hosting_id (optional), description (optional), tags (optional), user_ids (optional)
  - Returns: site object including api_secret_key_plain (once)
  - Notes: api_secret_key is stored as SHA-256 hash

- Update Site
  - Method: PUT
  - Path: /api/sites/{site}
  - Authenticated: Yes
  - Roles: admin, dev
  - Body fields: same as create except using “sometimes” rules
  - Returns: updated site object

- Delete Site
  - Method: DELETE
  - Path: /api/sites/{site}
  - Authenticated: Yes
  - Roles: admin, dev

- Regenerate API Key
  - Method: POST
  - Path: /api/sites/{site}/regenerate-key
  - Authenticated: Yes
  - Roles: admin
  - Returns: new api_secret_key_plain and message

- List Sites
  - Method: GET
  - Path: /api/sites
  - Authenticated: Yes
  - Roles: admin, dev, marketing
  - Query params: status, hosting_id, tag, search, page
  - Returns: paginated list with hosting and user counts

- View Site
  - Method: GET
  - Path: /api/sites/{site}
  - Authenticated: Yes
  - Roles: admin, dev, marketing
  - Returns: site with hosting and users loaded

- Site Activity Logs
  - Method: GET
  - Path: /api/sites/{site}/activity
  - Authenticated: Yes
  - Roles: admin, dev, marketing
  - Returns: paginated activity logs

- Agent Ping
  - Method: POST
  - Path: /api/agent/ping
  - Middleware: AgentAuthMiddleware
  - Headers: X-Agent-Key*, X-Site-Url*
  - Body: company_plugins, orders (when applicable)
  - Returns: 200 OK on success

- Agent Handshake
  - Method: POST
  - Path: /api/agent/handshake
  - Middleware: AgentAuthMiddleware
  - Returns: handshake response

**Section sources**
- [api.php:10-47](file://portal/routes/api.php#L10-L47)
- [agent.php:16-19](file://portal/routes/agent.php#L16-L19)
- [SiteController.php:23-56](file://portal/app/Http/Controllers/Portal/SiteController.php#L23-L56)
- [SiteController.php:97-109](file://portal/app/Http/Controllers/Portal/SiteController.php#L97-L109)
- [SiteController.php:187-202](file://portal/app/Http/Controllers/Portal/SiteController.php#L187-L202)
- [class-api.php:15-45](file://agent/epos-wp-agent/includes/class-api.php#L15-L45)
- [class-ping.php:50-81](file://agent/epos-wp-agent/includes/class-ping.php#L50-L81)