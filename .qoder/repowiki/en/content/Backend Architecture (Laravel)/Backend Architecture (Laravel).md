# Backend Architecture (Laravel)

<cite>
**Referenced Files in This Document**
- [Controller.php](file://portal/app/Http/Controllers/Controller.php)
- [AuthController.php](file://portal/app/Http/Controllers/Auth/AuthController.php)
- [HostingController.php](file://portal/app/Http/Controllers/Portal/HostingController.php)
- [SettingsController.php](file://portal/app/Http/Controllers/Portal/SettingsController.php)
- [SiteController.php](file://portal/app/Http/Controllers/Portal/SiteController.php)
- [UserController.php](file://portal/app/Http/Controllers/Portal/UserController.php)
- [SmtpController.php](file://portal/app/Http/Controllers/Portal/SmtpController.php)
- [RoleMiddleware.php](file://portal/app/Http/Middleware/RoleMiddleware.php)
- [AgentAuthMiddleware.php](file://portal/app/Http/Middleware/AgentAuthMiddleware.php)
- [EnsureUserIsActive.php](file://portal/app/Http/Middleware/EnsureUserIsActive.php)
- [StoreUserRequest.php](file://portal/app/Http/Requests/User/StoreUserRequest.php)
- [SendTelegramNotification.php](file://portal/app/Jobs/SendTelegramNotification.php)
- [PushSmtpToSite.php](file://portal/app/Jobs/PushSmtpToSite.php)
- [ActivityLogService.php](file://portal/app/Services/ActivityLogService.php)
- [PortalMailConfigService.php](file://portal/app/Services/PortalMailConfigService.php)
- [SiteSmtpSeederService.php](file://portal/app/Services/SiteSmtpSeederService.php)
- [TelegramNotificationService.php](file://portal/app/Services/TelegramNotificationService.php)
- [SignedUrlService.php](file://portal/app/Services/SignedUrlService.php)
- [User.php](file://portal/app/Models/User.php)
- [Hosting.php](file://portal/app/Models/Hosting.php)
- [Site.php](file://portal/app/Models/Site.php)
- [SiteSmtpSetting.php](file://portal/app/Models/SiteSmtpSetting.php)
- [ActivityLog.php](file://portal/app/Models/ActivityLog.php)
- [PortalSetting.php](file://portal/app/Models/PortalSetting.php)
- [ApiResponse.php](file://portal/app/Traits/ApiResponse.php)
- [api.php](file://portal/routes/api.php)
- [auth.php](file://portal/config/auth.php)
- [sanctum.php](file://portal/config/sanctum.php)
- [permission.php](file://portal/config/permission.php)
- [2026_05_15_061634_create_permission_tables.php](file://portal/database/migrations/2026_05_15_061634_create_permission_tables.php)
- [2026_05_15_070001_create_hostings_table.php](file://portal/database/migrations/2026_05_15_070001_create_hostings_table.php)
- [2026_05_15_070002_create_sites_table.php](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php)
- [2026_05_15_070003_create_site_users_table.php](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php)
- [2026_05_15_070004_create_activity_logs_table.php](file://portal/database/migrations/2026_05_15_070004_create_activity_logs_table.php)
- [2026_05_15_070005_create_portal_settings_table.php](file://portal/database/migrations/2026_05_15_070005_create_portal_settings_table.php)
- [2026_05_19_000002_create_site_smtp_settings_table.php](file://portal/database/migrations/2026_05_19_000002_create_site_smtp_settings_table.php)
- [AppServiceProvider.php](file://portal/app/Providers/AppServiceProvider.php)
</cite>

## Update Summary
**Changes Made**
- Added comprehensive SMTP configuration system with portal-wide and per-site SMTP settings
- Integrated PortalMailConfigService for runtime SMTP configuration application
- Added SiteSmtpSetting model for per-site encrypted SMTP credentials
- Implemented PushSmtpToSite job for secure credential transmission to WordPress agents
- Added SiteSmtpSeederService for bulk SMTP configuration application
- Enhanced AppServiceProvider with SMTP configuration service registration and boot application
- Updated SignedUrlService with improved portal base URL handling for agent accessibility

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [SMTP Configuration System](#smtp-configuration-system)
7. [Dependency Analysis](#dependency-analysis)
8. [Performance Considerations](#performance-considerations)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Conclusion](#conclusion)

## Introduction
This document describes the Laravel backend architecture for the EPOS Portal. It explains how the MVC pattern is implemented, how controllers, models, services, middleware, jobs, and requests work together, and how the request lifecycle flows from HTTP requests through middleware to controllers and services. It also documents the authentication and authorization systems using Laravel Sanctum and Spatie Permission, the service layer and business logic encapsulation, the middleware chain and custom middleware for role-based access control, the queue system for background processing, and the new comprehensive SMTP configuration system for portal-wide and per-site email delivery.

## Project Structure
The backend follows a layered MVC architecture with clear separation of concerns:
- HTTP layer: routes define entry points; middleware enforces policies; controllers orchestrate responses.
- Domain layer: models represent entities and relationships; requests encapsulate validation rules.
- Application layer: services encapsulate business logic; jobs handle background tasks.
- Infrastructure: configuration files define guards, Sanctum, permissions, and queues.

```mermaid
graph TB
subgraph "HTTP Layer"
R["Routes (api.php)"]
MW1["Middleware (RoleMiddleware)"]
MW2["Middleware (AgentAuthMiddleware)"]
MW3["Middleware (EnsureUserIsActive)"]
C["Controllers"]
SMTPCTRL["Controllers (SmtpController)"]
end
subgraph "Domain Layer"
M1["Models (User, Site, Hosting, ActivityLog, PortalSetting)"]
M2["Models (SiteSmtpSetting)"]
REQ["Form Requests (StoreUserRequest, ...)"]
end
subgraph "Application Layer"
SVC1["Services (ActivityLogService, TelegramNotificationService)"]
SVC2["Services (PortalMailConfigService, SiteSmtpSeederService, SignedUrlService)"]
JOB["Jobs (SendTelegramNotification, PushSmtpToSite)"]
TRAIT["Traits (ApiResponse)"]
end
subgraph "Infrastructure"
CFG1["Config (auth.php, sanctum.php, permission.php)"]
DB["Migrations & Seeders"]
END
R --> MW1 --> MW2 --> MW3 --> C
C --> SMTPCTRL
SMTPCTRL --> SVC2
C --> REQ
C --> SVC1
SVC1 --> JOB
SVC2 --> JOB
SVC2 --> M1
SVC2 --> M2
C --> M1
C --> M2
SVC1 --> M1
JOB --> M1
JOB --> M2
TRAIT --> C
CFG1 --> C
CFG1 --> MW1
CFG1 --> MW2
CFG1 --> MW3
DB --> M1
DB --> M2
```

**Diagram sources**
- [api.php:1-193](file://portal/routes/api.php#L1-L193)
- [SmtpController.php:1-288](file://portal/app/Http/Controllers/Portal/SmtpController.php#L1-L288)
- [RoleMiddleware.php:1-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L1-L37)
- [AgentAuthMiddleware.php:1-57](file://portal/app/Http/Middleware/AgentAuthMiddleware.php#L1-L57)
- [EnsureUserIsActive.php](file://portal/app/Http/Middleware/EnsureUserIsActive.php)
- [AuthController.php:1-135](file://portal/app/Http/Controllers/Auth/AuthController.php#L1-L135)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [PortalMailConfigService.php:1-77](file://portal/app/Services/PortalMailConfigService.php#L1-L77)
- [SiteSmtpSeederService.php:1-134](file://portal/app/Services/SiteSmtpSeederService.php#L1-L134)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)
- [auth.php:1-118](file://portal/config/auth.php#L1-L118)
- [sanctum.php:1-88](file://portal/config/sanctum.php#L1-L88)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [Site.php:1-76](file://portal/app/Models/Site.php#L1-L76)
- [SiteSmtpSetting.php:1-44](file://portal/app/Models/SiteSmtpSetting.php#L1-L44)
- [Hosting.php:1-31](file://portal/app/Models/Hosting.php#L1-L31)
- [ActivityLog.php](file://portal/app/Models/ActivityLog.php)
- [PortalSetting.php](file://portal/app/Models/PortalSetting.php)

**Section sources**
- [api.php:1-193](file://portal/routes/api.php#L1-L193)
- [auth.php:1-118](file://portal/config/auth.php#L1-L118)
- [sanctum.php:1-88](file://portal/config/sanctum.php#L1-L88)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)

## Core Components
- Controllers: Handle HTTP requests, delegate to services, and return standardized JSON responses via a shared trait.
- Models: Define entity schemas, relationships, scopes, and attributes.
- Services: Encapsulate business logic and cross-cutting concerns (e.g., notifications, activity logging, SMTP configuration).
- Middleware: Enforce authentication, agent authentication, role checks, and user activation.
- Jobs: Asynchronous tasks for background processing (e.g., sending Telegram notifications, pushing SMTP settings).
- Requests: Validation and authorization rules for incoming data.
- Traits: Shared response formatting utilities.

**Section sources**
- [Controller.php:1-9](file://portal/app/Http/Controllers/Controller.php#L1-L9)
- [AuthController.php:1-135](file://portal/app/Http/Controllers/Auth/AuthController.php#L1-L135)
- [SmtpController.php:1-288](file://portal/app/Http/Controllers/Portal/SmtpController.php#L1-L288)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [Site.php:1-76](file://portal/app/Models/Site.php#L1-L76)
- [SiteSmtpSetting.php:1-44](file://portal/app/Models/SiteSmtpSetting.php#L1-L44)
- [Hosting.php:1-31](file://portal/app/Models/Hosting.php#L1-L31)
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [PortalMailConfigService.php:1-77](file://portal/app/Services/PortalMailConfigService.php#L1-L77)
- [SiteSmtpSeederService.php:1-134](file://portal/app/Services/SiteSmtpSeederService.php#L1-L134)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)
- [SignedUrlService.php:1-69](file://portal/app/Services/SignedUrlService.php#L1-L69)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)

## Architecture Overview
The request lifecycle begins at the route, passes through middleware, reaches the controller, and delegates to services for business logic. Responses are standardized using a shared trait. Authentication uses Sanctum personal access tokens; authorization uses Spatie Permissions with custom role middleware. The new SMTP configuration system provides comprehensive email delivery management for both portal-wide and per-site scenarios.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Routes as "Routes (api.php)"
participant MW_Auth as "Middleware (auth : sanctum)"
participant MW_Active as "Middleware (active)"
participant MW_Role as "Middleware (role : admin/dev/mkt)"
participant Ctrl as "Controllers"
participant Svc as "Services"
participant SMTPSvc as "SMTP Services"
participant Job as "Jobs"
participant DB as "Database"
Client->>Routes : "HTTP Request"
Routes->>MW_Auth : "Authenticate via Sanctum"
MW_Auth-->>Routes : "Authenticated user or 401"
Routes->>MW_Active : "Ensure user is active"
MW_Active-->>Routes : "Active user or 403"
Routes->>MW_Role : "Check role if required"
MW_Role-->>Routes : "Allowed or 403"
Routes->>Ctrl : "Dispatch to controller"
Ctrl->>Svc : "Invoke service methods"
Ctrl->>SMTPSvc : "Handle SMTP configuration"
SMTPSvc->>Job : "Dispatch queued job"
Job->>DB : "Persist or fetch data"
Ctrl-->>Client : "Standardized JSON response"
```

**Diagram sources**
- [api.php:1-193](file://portal/routes/api.php#L1-L193)
- [auth.php:1-118](file://portal/config/auth.php#L1-L118)
- [sanctum.php:1-88](file://portal/config/sanctum.php#L1-L88)
- [RoleMiddleware.php:1-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L1-L37)
- [EnsureUserIsActive.php](file://portal/app/Http/Middleware/EnsureUserIsActive.php)
- [AuthController.php:1-135](file://portal/app/Http/Controllers/Auth/AuthController.php#L1-L135)
- [SmtpController.php:1-288](file://portal/app/Http/Controllers/Portal/SmtpController.php#L1-L288)
- [PortalMailConfigService.php:1-77](file://portal/app/Services/PortalMailConfigService.php#L1-L77)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)

## Detailed Component Analysis

### Authentication and Authorization
- Authentication: Sanctum personal access tokens are used for stateful SPA authentication. Guards and middleware are configured to support session and token-based auth.
- Authorization: Spatie Permission models and tables manage roles and permissions. A custom role middleware enforces role-based access control.

```mermaid
classDiagram
class User {
+string name
+string email
+string role
+bool is_active
+createToken(name) string
+tokens() Tokens
}
class RoleMiddleware {
+handle(request, next, roles) Response
}
class SanctumConfig {
+stateful array
+guard array
+middleware array
}
class PermissionConfig {
+models array
+tables array
+cache array
}
User <.. SanctumConfig : "auth guard"
RoleMiddleware ..> User : "reads role"
SanctumConfig --> RoleMiddleware : "applies after auth"
PermissionConfig --> RoleMiddleware : "complements roles"
```

**Diagram sources**
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [RoleMiddleware.php:1-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L1-L37)
- [sanctum.php:1-88](file://portal/config/sanctum.php#L1-L88)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)

**Section sources**
- [auth.php:1-118](file://portal/config/auth.php#L1-L118)
- [sanctum.php:1-88](file://portal/config/sanctum.php#L1-L88)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)
- [RoleMiddleware.php:1-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L1-L37)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)

### Request Processing Pipeline
- Routes define protected groups and role-based subgroups.
- Middleware stack: auth:sanctum, active, and optional role middleware.
- Controllers validate input via Form Requests and return standardized responses.

```mermaid
flowchart TD
Start(["Incoming Request"]) --> RouteMatch["Route Match (api.php)"]
RouteMatch --> AuthCheck["Auth Guard (Sanctum)"]
AuthCheck --> ActiveCheck["Ensure User Is Active"]
ActiveCheck --> RoleCheck{"Role Required?"}
RoleCheck --> |Yes| RoleMW["Role Middleware"]
RoleCheck --> |No| Controller["Controller Action"]
RoleMW --> Controller
Controller --> Validation["Form Request Validation"]
Validation --> BusinessLogic["Service Methods"]
BusinessLogic --> Response["Standardized JSON Response"]
Response --> End(["HTTP Response"])
```

**Diagram sources**
- [api.php:1-193](file://portal/routes/api.php#L1-L193)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [AuthController.php:1-135](file://portal/app/Http/Controllers/Auth/AuthController.php#L1-L135)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)

**Section sources**
- [api.php:1-193](file://portal/routes/api.php#L1-L193)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [AuthController.php:1-135](file://portal/app/Http/Controllers/Auth/AuthController.php#L1-L135)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)

### Service Layer and Business Logic Encapsulation
- ActivityLogService: Centralized activity logging with fallback to logs if the table does not exist.
- TelegramNotificationService: Provides synchronous and asynchronous notification delivery, with caching of settings and queue dispatch.
- PortalMailConfigService: Runtime SMTP configuration application for portal-wide email settings.
- SiteSmtpSeederService: Bulk application of SMTP settings to multiple sites with detailed reporting.

```mermaid
classDiagram
class ActivityLogService {
+log(action, subject, user, ipAddress, metadata) void
}
class TelegramNotificationService {
+send(chatId, message) bool
+queue(chatId, message) void
+notifyAdminChannel(message) void
+clearCache() void
}
class PortalMailConfigService {
+apply() void
}
class SiteSmtpSeederService {
+getDefaults() array|null
+seedSite(site, overwrite, actorUserId) string
+seedMany(sites, overwrite, actorUserId) array
}
class SendTelegramNotification {
+handle() void
+failed(exception) void
}
class PushSmtpToSite {
+handle() void
}
ActivityLogService --> ActivityLog : "writes logs"
TelegramNotificationService --> SendTelegramNotification : "dispatches job"
PortalMailConfigService --> PortalSetting : "reads settings"
SiteSmtpSeederService --> SiteSmtpSetting : "creates per-site configs"
TelegramNotificationService --> PortalSetting : "reads cached settings"
SendTelegramNotification --> PortalSetting : "reads token"
PushSmtpToSite --> SiteSmtpSetting : "reads encrypted credentials"
```

**Diagram sources**
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PortalMailConfigService.php:1-77](file://portal/app/Services/PortalMailConfigService.php#L1-L77)
- [SiteSmtpSeederService.php:1-134](file://portal/app/Services/SiteSmtpSeederService.php#L1-L134)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)
- [ActivityLog.php](file://portal/app/Models/ActivityLog.php)
- [PortalSetting.php](file://portal/app/Models/PortalSetting.php)
- [SiteSmtpSetting.php](file://portal/app/Models/SiteSmtpSetting.php)

**Section sources**
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PortalMailConfigService.php:1-77](file://portal/app/Services/PortalMailConfigService.php#L1-L77)
- [SiteSmtpSeederService.php:1-134](file://portal/app/Services/SiteSmtpSeederService.php#L1-L134)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)

### Middleware Chain and Custom Middleware
- RoleMiddleware: Enforces role-based access control by checking the authenticated user's role against allowed roles.
- AgentAuthMiddleware: Validates agent requests using a hashed API key derived from the site URL.
- EnsureUserIsActive: Ensures the authenticated user is active before allowing access.

```mermaid
flowchart TD
Req["HTTP Request"] --> Auth["auth:sanctum"]
Auth --> Active["EnsureUserIsActive"]
Active --> RoleCheck{"Route requires role?"}
RoleCheck --> |Yes| Role["RoleMiddleware"]
RoleCheck --> |No| Controller
Role --> Controller
Controller --> Resp["Response"]
```

**Diagram sources**
- [RoleMiddleware.php:1-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L1-L37)
- [AgentAuthMiddleware.php:1-57](file://portal/app/Http/Middleware/AgentAuthMiddleware.php#L1-L57)
- [EnsureUserIsActive.php](file://portal/app/Http/Middleware/EnsureUserIsActive.php)
- [api.php:1-193](file://portal/routes/api.php#L1-L193)

**Section sources**
- [RoleMiddleware.php:1-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L1-L37)
- [AgentAuthMiddleware.php:1-57](file://portal/app/Http/Middleware/AgentAuthMiddleware.php#L1-L57)
- [EnsureUserIsActive.php](file://portal/app/Http/Middleware/EnsureUserIsActive.php)

### Queue System and Background Processing
- Jobs: The Telegram notification job sends messages asynchronously and retries on failure.
- Queue configuration: Jobs are dispatched via the queue system and retried with backoff.
- SMTP Jobs: PushSmtpToSite handles secure credential transmission to WordPress agents.

```mermaid
sequenceDiagram
participant Svc as "TelegramNotificationService"
participant SMTPSvc as "SiteSmtpSeederService"
participant Job as "SendTelegramNotification"
participant SMTPJob as "PushSmtpToSite"
participant Q as "Queue Worker"
participant API as "Telegram API"
participant Agent as "WordPress Agent"
Svc->>Job : "dispatch(chatId, message)"
SMTPSvc->>SMTPJob : "dispatch(rowId)"
Job->>Q : "push to queue"
SMTPJob->>Q : "push to queue"
Q->>Job : "process job"
Q->>SMTPJob : "process job"
Job->>API : "POST sendMessage"
SMTPJob->>Agent : "POST /smtp/update"
API-->>Job : "response"
Agent-->>SMTPJob : "acknowledgment"
Job-->>Q : "success or retry"
SMTPJob-->>Q : "success or retry"
```

**Diagram sources**
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [SiteSmtpSeederService.php:1-134](file://portal/app/Services/SiteSmtpSeederService.php#L1-L134)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)

**Section sources**
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [SiteSmtpSeederService.php:1-134](file://portal/app/Services/SiteSmtpSeederService.php#L1-L134)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)

### Data Models and Relationships
- User: Authenticatable with Sanctum tokens and Spatie roles; includes role and activity fields.
- Site: Belongs to Hosting and User; many-to-many with User via site_users; scoped by user assignment.
- SiteSmtpSetting: Per-site SMTP configuration with encrypted password storage.
- Hosting: Creator relationship to User; has many Sites.
- ActivityLog: Optional centralized audit trail.
- PortalSetting: Stores configuration values (e.g., Telegram bot token and default chat ID).

```mermaid
erDiagram
USER {
int id PK
string name
string email
string role
boolean is_active
}
HOSTING {
int id PK
string name
string provider
int created_by FK
}
SITE {
int id PK
int hosting_id FK
string name
string url
string api_key_encrypted
string status
boolean woo_active
datetime last_ping_at
json tags
int created_by FK
}
SITE_USERS {
int site_id FK
int user_id FK
}
SITE_SMTP_SETTINGS {
int id PK
int site_id FK U
string host
smallint port
string username
text password_encrypted
string encryption
string from_email
string from_name
boolean enabled
datetime last_pushed_at
int updated_by FK
}
ACTIVITY_LOG {
int id PK
string action
int user_id FK
string subject_type
int subject_id
string ip_address
json metadata
}
PORTAL_SETTING {
int id PK
string key
text value
}
USER ||--o{ SITE : "created_by"
HOSTING ||--o{ SITE : "created_by"
USER ||--o{ ACTIVITY_LOG : "user_id"
SITE ||--o{ ACTIVITY_LOG : "subject_id"
SITE ||--|| SITE_SMTP_SETTINGS : "site_id"
USER ||--o{ SITE_USERS : "user_id"
SITE ||--o{ SITE_USERS : "site_id"
```

**Diagram sources**
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [Hosting.php:1-31](file://portal/app/Models/Hosting.php#L1-L31)
- [Site.php:1-76](file://portal/app/Models/Site.php#L1-L76)
- [SiteSmtpSetting.php:1-44](file://portal/app/Models/SiteSmtpSetting.php#L1-L44)
- [ActivityLog.php](file://portal/app/Models/ActivityLog.php)
- [PortalSetting.php](file://portal/app/Models/PortalSetting.php)
- [2026_05_15_061634_create_permission_tables.php](file://portal/database/migrations/2026_05_15_061634_create_permission_tables.php)
- [2026_05_15_070001_create_hostings_table.php](file://portal/database/migrations/2026_05_15_070001_create_hostings_table.php)
- [2026_05_15_070002_create_sites_table.php](file://portal/database/migrations/2026_05_15_070002_create_sites_table.php)
- [2026_05_15_070003_create_site_users_table.php](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php)
- [2026_05_15_070004_create_activity_logs_table.php](file://portal/database/migrations/2026_05_15_070004_create_activity_logs_table.php)
- [2026_05_15_070005_create_portal_settings_table.php](file://portal/database/migrations/2026_05_15_070005_create_portal_settings_table.php)
- [2026_05_19_000002_create_site_smtp_settings_table.php](file://portal/database/migrations/2026_05_19_000002_create_site_smtp_settings_table.php)

**Section sources**
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [Hosting.php:1-31](file://portal/app/Models/Hosting.php#L1-L31)
- [Site.php:1-76](file://portal/app/Models/Site.php#L1-L76)
- [SiteSmtpSetting.php:1-44](file://portal/app/Models/SiteSmtpSetting.php#L1-L44)
- [ActivityLog.php](file://portal/app/Models/ActivityLog.php)
- [PortalSetting.php](file://portal/app/Models/PortalSetting.php)

### Controllers and Standardized Responses
- AuthController: Handles login, logout, profile update, and password change with standardized responses.
- SmtpController: Comprehensive SMTP configuration management for portal-wide and per-site settings.
- Other controllers: Follow the same pattern, delegating to services and returning structured JSON.

```mermaid
classDiagram
class AuthController {
+login(request) Response
+logout(request) Response
+me(request) Response
+updateProfile(request) Response
+changePassword(request) Response
}
class SmtpController {
+showPortal() Response
+updatePortal(request) Response
+applyToSites(request, seeder) Response
+testPortal(request) Response
+showSite(request, site) Response
+updateSite(request, site) Response
+testSite(request, site) Response
}
class ApiResponse {
+successResponse(data, message, code, meta) JsonResponse
+errorResponse(message, code, errors) JsonResponse
+paginatedResponse(paginator, resource) JsonResponse
}
AuthController ..> ApiResponse : "uses"
SmtpController ..> ApiResponse : "uses"
```

**Diagram sources**
- [AuthController.php:1-135](file://portal/app/Http/Controllers/Auth/AuthController.php#L1-L135)
- [SmtpController.php:1-288](file://portal/app/Http/Controllers/Portal/SmtpController.php#L1-L288)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)

**Section sources**
- [AuthController.php:1-135](file://portal/app/Http/Controllers/Auth/AuthController.php#L1-L135)
- [SmtpController.php:1-288](file://portal/app/Http/Controllers/Portal/SmtpController.php#L1-L288)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)

## SMTP Configuration System

### Overview
The SMTP configuration system provides comprehensive email delivery management for both portal-wide and per-site scenarios. It includes encrypted credential storage, secure transmission to WordPress agents, and bulk application capabilities.

### Key Components

#### PortalMailConfigService
Runtime SMTP configuration application that reads portal-wide settings from PortalSetting and applies them to Laravel's mail configuration at runtime.

```mermaid
flowchart TD
Start(["AppServiceProvider Boot"]) --> LoadSettings["Load Portal SMTP Settings"]
LoadSettings --> CheckEnabled{"Enabled & Host Set?"}
CheckEnabled --> |No| Return["Return (fallback to .env)"]
CheckEnabled --> |Yes| DecryptPassword["Decrypt Password (if present)"]
DecryptPassword --> SetConfig["Set Mail Configuration"]
SetConfig --> ApplyConfig["Apply to config('mail.*')"]
ApplyConfig --> End(["Portal Mail Uses SMTP"])
```

**Diagram sources**
- [PortalMailConfigService.php:26-75](file://portal/app/Services/PortalMailConfigService.php#L26-L75)
- [AppServiceProvider.php:22-28](file://portal/app/Providers/AppServiceProvider.php#L22-L28)

#### SiteSmtpSetting Model
Per-site SMTP configuration with encrypted password storage using CredentialEncryptionService.

```mermaid
classDiagram
class SiteSmtpSetting {
+site_id : int
+host : string
+port : int
+username : string
+password_encrypted : text
+encryption : string
+from_email : string
+from_name : string
+enabled : boolean
+last_pushed_at : datetime
+updated_by : int
+site() BelongsTo
+updatedBy() BelongsTo
}
SiteSmtpSetting --> Site : "belongsTo"
SiteSmtpSetting --> User : "belongsTo(updated_by)"
```

**Diagram sources**
- [SiteSmtpSetting.php:8-43](file://portal/app/Models/SiteSmtpSetting.php#L8-L43)

#### PushSmtpToSite Job
Secure transmission of SMTP credentials to WordPress agents via HTTPS API calls with proper error handling and retry logic.

```mermaid
sequenceDiagram
participant Ctrl as "SmtpController"
participant Seeder as "SiteSmtpSeederService"
participant Job as "PushSmtpToSite"
participant Agent as "WordPress Agent"
Ctrl->>Job : "dispatch(rowId)"
Seeder->>Job : "dispatch(rowId)"
Job->>Agent : "POST /wp-json/epos-agent/v1/smtp/update"
Agent-->>Job : "200 OK or Error"
Job-->>Job : "Update last_pushed_at"
```

**Diagram sources**
- [PushSmtpToSite.php:35-87](file://portal/app/Jobs/PushSmtpToSite.php#L35-L87)
- [SmtpController.php:247](file://portal/app/Http/Controllers/Portal/SmtpController.php#L247)
- [SiteSmtpSeederService.php:90](file://portal/app/Services/SiteSmtpSeederService.php#L90)

#### SiteSmtpSeederService
Bulk application of SMTP settings to multiple sites with detailed reporting and overwrite handling.

```mermaid
flowchart TD
GetDefaults["Get Portal SMTP Defaults"] --> CheckDefaults{"Defaults Exist?"}
CheckDefaults --> |No| NoDefaults["Return no_defaults"]
CheckDefaults --> |Yes| IterateSites["Iterate Through Sites"]
IterateSites --> CheckExisting{"Site Has Existing Config?"}
CheckExisting --> |Yes & Overwrite| Overwrite["Overwrite Existing"]
CheckExisting --> |Yes & No Overwrite| Skip["Skip Existing"]
CheckExisting --> |No| Create["Create New Config"]
Overwrite --> Dispatch["Dispatch PushSmtpToSite"]
Create --> Dispatch
Skip --> NextSite["Next Site"]
Dispatch --> NextSite
NextSite --> Done["Return Tally"]
```

**Diagram sources**
- [SiteSmtpSeederService.php:70-93](file://portal/app/Services/SiteSmtpSeederService.php#L70-L93)
- [SiteSmtpSeederService.php:101-132](file://portal/app/Services/SiteSmtpSeederService.php#L101-L132)

### API Endpoints
The SMTP system exposes comprehensive API endpoints for both portal-wide and per-site configuration management.

**Section sources**
- [SmtpController.php:1-288](file://portal/app/Http/Controllers/Portal/SmtpController.php#L1-L288)
- [PortalMailConfigService.php:1-77](file://portal/app/Services/PortalMailConfigService.php#L1-L77)
- [SiteSmtpSetting.php:1-44](file://portal/app/Models/SiteSmtpSetting.php#L1-L44)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)
- [SiteSmtpSeederService.php:1-134](file://portal/app/Services/SiteSmtpSeederService.php#L1-L134)
- [2026_05_19_000002_create_site_smtp_settings_table.php:1-35](file://portal/database/migrations/2026_05_19_000002_create_site_smtp_settings_table.php#L1-L35)

## Dependency Analysis
The application exhibits low coupling and high cohesion:
- Controllers depend on services and models, not on each other.
- Services encapsulate domain logic and coordinate with jobs and models.
- Middleware is reusable and composable via route groups.
- Requests decouple validation from controllers.
- SMTP services integrate seamlessly with existing architecture.

```mermaid
graph LR
Routes["routes/api.php"] --> MW["Middleware"]
MW --> Ctrl["Controllers"]
Ctrl --> Req["Form Requests"]
Ctrl --> Svc["Services"]
Ctrl --> SMTPCtrl["SmtpController"]
SMTPCtrl --> SMTPSvc["SMTP Services"]
SMTPSvc --> Job["Jobs"]
SMTPSvc --> Models["Models"]
Svc --> Job
Svc --> Models
Ctrl --> Models
Svc --> Config["Config Files"]
MW --> Config
```

**Diagram sources**
- [api.php:1-193](file://portal/routes/api.php#L1-L193)
- [RoleMiddleware.php:1-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L1-L37)
- [AgentAuthMiddleware.php:1-57](file://portal/app/Http/Middleware/AgentAuthMiddleware.php#L1-L57)
- [AuthController.php:1-135](file://portal/app/Http/Controllers/Auth/AuthController.php#L1-L135)
- [SmtpController.php:1-288](file://portal/app/Http/Controllers/Portal/SmtpController.php#L1-L288)
- [PortalMailConfigService.php:1-77](file://portal/app/Services/PortalMailConfigService.php#L1-L77)
- [SiteSmtpSeederService.php:1-134](file://portal/app/Services/SiteSmtpSeederService.php#L1-L134)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PushSmtpToSite.php:1-89](file://portal/app/Jobs/PushSmtpToSite.php#L1-L89)
- [auth.php:1-118](file://portal/config/auth.php#L1-L118)
- [sanctum.php:1-88](file://portal/config/sanctum.php#L1-L88)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)

**Section sources**
- [api.php:1-193](file://portal/routes/api.php#L1-L193)
- [auth.php:1-118](file://portal/config/auth.php#L1-L118)
- [sanctum.php:1-88](file://portal/config/sanctum.php#L1-L88)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)

## Performance Considerations
- Use caching for frequently accessed settings (e.g., Telegram bot token and default chat ID) to reduce database queries.
- Leverage database indexing on commonly filtered columns (e.g., site URL, user roles).
- Minimize N+1 queries by eager-loading relationships in controllers and services.
- Offload long-running tasks to the queue to keep HTTP requests responsive.
- Keep middleware logic lightweight; avoid heavy computations inside middleware.
- **SMTP Optimization**: Use encrypted credential storage to avoid repeated decryption operations; cache SMTP configuration where appropriate.

## Troubleshooting Guide
- Authentication failures: Verify Sanctum guard configuration and ensure tokens are properly issued and included in requests.
- Authorization failures: Confirm role middleware is applied to protected routes and that users have the correct roles.
- Queue processing: Monitor queue workers and job retries; inspect logs for Telegram API errors and exceptions.
- Database migrations: Ensure permission tables and portal-related tables are created and up to date.
- **SMTP Issues**: Check PortalSetting entries for proper SMTP configuration; verify encrypted password storage; monitor PushSmtpToSite job logs for agent communication failures.
- **Agent Communication**: Verify WordPress agent API keys are properly configured and accessible; check network connectivity between portal and agent servers.

**Section sources**
- [sanctum.php:1-88](file://portal/config/sanctum.php#L1-L88)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [PortalMailConfigService.php:26-75](file://portal/app/Services/PortalMailConfigService.php#L26-L75)
- [PushSmtpToSite.php:35-87](file://portal/app/Jobs/PushSmtpToSite.php#L35-L87)
- [2026_05_15_061634_create_permission_tables.php](file://portal/database/migrations/2026_05_15_061634_create_permission_tables.php)
- [2026_05_15_070005_create_portal_settings_table.php](file://portal/database/migrations/2026_05_15_070005_create_portal_settings_table.php)
- [2026_05_19_000002_create_site_smtp_settings_table.php](file://portal/database/migrations/2026_05_19_000002_create_site_smtp_settings_table.php)

## Conclusion
The EPOS Portal backend leverages Laravel's MVC architecture with clear separation between HTTP handling, domain models, application services, and infrastructure concerns. Sanctum and Spatie Permission provide robust authentication and authorization, while middleware ensures consistent policy enforcement. The service layer encapsulates business logic, and the queue system handles background tasks efficiently. The new comprehensive SMTP configuration system enhances email delivery capabilities with secure credential management, per-site customization, and seamless integration with WordPress agents. This design promotes maintainability, testability, and scalability while providing enterprise-grade email infrastructure management.