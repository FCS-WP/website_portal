# Business Logic Services

<cite>
**Referenced Files in This Document**
- [ActivityLogService.php](file://portal/app/Services/ActivityLogService.php)
- [TelegramNotificationService.php](file://portal/app/Services/TelegramNotificationService.php)
- [PluginClassificationService.php](file://portal/app/Services/PluginClassificationService.php)
- [SitePluginIngestService.php](file://portal/app/Services/SitePluginIngestService.php)
- [SecurityScoreService.php](file://portal/app/Services/SecurityScoreService.php)
- [ApiResponse.php](file://portal/app/Traits/ApiResponse.php)
- [ActivityLog.php](file://portal/app/Models/ActivityLog.php)
- [User.php](file://portal/app/Models/User.php)
- [StoreUserRequest.php](file://portal/app/Http/Requests/User/StoreUserRequest.php)
- [UpdateUserRequest.php](file://portal/app/Http/Requests/User/UpdateUserRequest.php)
- [AgentController.php](file://portal/app/Http/Controllers/Agent/AgentController.php)
- [SendTelegramNotification.php](file://portal/app/Jobs/SendTelegramNotification.php)
- [AppServiceProvider.php](file://portal/app/Providers/AppServiceProvider.php)
- [ExternalPluginCache.php](file://portal/app/Models/ExternalPluginCache.php)
- [Plugin.php](file://portal/app/Models/Plugin.php)
- [SitePlugin.php](file://portal/app/Models/SitePlugin.php)
- [SiteSecurityScore.php](file://portal/app/Models/SiteSecurityScore.php)
- [SecurityAlert.php](file://portal/app/Models/SecurityAlert.php)
- [SiteVulnerability.php](file://portal/app/Models/SiteVulnerability.php)
- [2026_05_15_070004_create_activity_logs_table.php](file://portal/database/migrations/2026_05_15_070004_create_activity_logs_table.php)
- [2026_05_19_000001_phase6_external_plugin_management.php](file://portal/database/migrations/2026_05_19_000001_phase6_external_plugin_management.php)
- [PortalSetting.php](file://portal/app/Models/PortalSetting.php)
- [api.php](file://portal/routes/api.php)
- [services.php](file://portal/config/services.php)
</cite>

## Update Summary
**Changes Made**
- Added new PluginClassificationService for automatic plugin categorization into internal, wporg, or premium
- Added new SitePluginIngestService for comprehensive plugin metadata processing and ingestion
- Enhanced SecurityScoreService with comprehensive security assessment calculations
- Updated architecture diagrams to reflect new plugin management and security scoring capabilities
- Added new database schema for external plugin cache and enhanced site plugin tracking

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
This document explains the service layer architecture and business logic implementation in the portal application. It focuses on how services encapsulate complex operations, coordinate between models, repositories, and external systems, and enforce standardized response formatting. The document covers the activity logging service, notification service, plugin classification and ingestion services, and enhanced security scoring service. It documents request validation patterns via form request classes, illustrates service composition, error handling, and transaction management. It also covers testing strategies, dependency injection, and service lifecycle management, and explains the ApiResponse trait for consistent API responses.

## Project Structure
The service layer resides under the application namespace and integrates with controllers, models, requests, jobs, and configuration. The primary service files are:
- ActivityLogService: central logging utility for auditable actions
- TelegramNotificationService: synchronous and asynchronous notifications via Telegram
- PluginClassificationService: automatic plugin categorization into internal, wporg, or premium
- SitePluginIngestService: comprehensive plugin metadata processing and ingestion
- SecurityScoreService: comprehensive security assessment and scoring
- ApiResponse trait: standardized JSON response formatting
- Form Request classes: validation contracts for user creation and updates
- AgentController: demonstrates service usage in agent-facing endpoints
- SendTelegramNotification job: asynchronous delivery of Telegram messages
- AppServiceProvider: service provider for application-wide bindings
- ActivityLog model and migration: persistence and schema for activity logs
- ExternalPluginCache model: WP.org plugin metadata caching
- Plugin model: internal plugin registry
- SitePlugin model: site-specific plugin installations
- SiteSecurityScore model: security score tracking
- PortalSetting model: settings-backed configuration for services
- Routes and configuration: integration points and third-party service credentials

```mermaid
graph TB
subgraph "Controllers"
AC["AgentController"]
end
subgraph "Business Services"
ALS["ActivityLogService"]
TNS["TelegramNotificationService"]
PCS["PluginClassificationService"]
SPI["SitePluginIngestService"]
SSS["SecurityScoreService"]
end
subgraph "Data Models"
AL["ActivityLog"]
EP["ExternalPluginCache"]
PL["Plugin"]
SP["SitePlugin"]
SSS["SiteSecurityScore"]
end
subgraph "Requests & Jobs"
SUR["StoreUserRequest"]
UUR["UpdateUserRequest"]
STN["SendTelegramNotification"]
end
subgraph "Traits & Config"
AR["ApiResponse"]
PS["PortalSetting"]
end
AC --> ALS
AC --> SPI
AC --> AR
TNS --> PS
TNS --> STN
SPI --> PCS
SPI --> EP
SPI --> PL
SPI --> SP
SSS --> SSS
ALS --> AL
PCS --> EP
PCS --> PL
PCS --> PS
SSS --> SSS
SUR --> PS
UUR --> PS
```

**Diagram sources**
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PluginClassificationService.php:1-178](file://portal/app/Services/PluginClassificationService.php#L1-L178)
- [SitePluginIngestService.php:1-131](file://portal/app/Services/SitePluginIngestService.php#L1-L131)
- [SecurityScoreService.php:1-215](file://portal/app/Services/SecurityScoreService.php#L1-L215)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [UpdateUserRequest.php:1-27](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L1-L27)
- [ActivityLog.php:1-37](file://portal/app/Models/ActivityLog.php#L1-L37)
- [ExternalPluginCache.php:1-50](file://portal/app/Models/ExternalPluginCache.php#L1-L50)
- [Plugin.php:1-35](file://portal/app/Models/Plugin.php#L1-L35)
- [SitePlugin.php:1-63](file://portal/app/Models/SitePlugin.php#L1-L63)
- [SiteSecurityScore.php:1-31](file://portal/app/Models/SiteSecurityScore.php#L1-L31)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [PortalSetting.php:1-11](file://portal/app/Models/PortalSetting.php#L1-L11)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)

**Section sources**
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PluginClassificationService.php:1-178](file://portal/app/Services/PluginClassificationService.php#L1-L178)
- [SitePluginIngestService.php:1-131](file://portal/app/Services/SitePluginIngestService.php#L1-L131)
- [SecurityScoreService.php:1-215](file://portal/app/Services/SecurityScoreService.php#L1-L215)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [UpdateUserRequest.php:1-27](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L1-L27)
- [ActivityLog.php:1-37](file://portal/app/Models/ActivityLog.php#L1-L37)
- [ExternalPluginCache.php:1-50](file://portal/app/Models/ExternalPluginCache.php#L1-L50)
- [Plugin.php:1-35](file://portal/app/Models/Plugin.php#L1-L35)
- [SitePlugin.php:1-63](file://portal/app/Models/SitePlugin.php#L1-L63)
- [SiteSecurityScore.php:1-31](file://portal/app/Models/SiteSecurityScore.php#L1-L31)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [PortalSetting.php:1-11](file://portal/app/Models/PortalSetting.php#L1-L11)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [AppServiceProvider.php:1-25](file://portal/app/Providers/AppServiceProvider.php#L1-L25)
- [2026_05_15_070004_create_activity_logs_table.php:1-32](file://portal/database/migrations/2026_05_15_070004_create_activity_logs_table.php#L1-L32)
- [2026_05_19_000001_phase6_external_plugin_management.php:1-169](file://portal/database/migrations/2026_05_19_000001_phase6_external_plugin_management.php#L1-L169)
- [api.php:1-58](file://portal/routes/api.php#L1-L58)
- [services.php:1-39](file://portal/config/services.php#L1-L39)

## Core Components
- ActivityLogService: Provides centralized logging for auditable actions, supports optional subject polymorphism, metadata, and graceful fallback to application logs when the activity_logs table is unavailable.
- TelegramNotificationService: Offers synchronous sending for testing and asynchronous queuing for production, with cached configuration retrieval and explicit cache invalidation.
- PluginClassificationService: Automatic plugin categorization service that classifies plugins as internal, wporg, or premium based on company prefixes, WP.org cache, and API fallback checking.
- SitePluginIngestService: Comprehensive plugin ingestion service that processes agent plugin data, classifies plugin types, resolves versions, and maintains site plugin synchronization.
- SecurityScoreService: Enhanced security assessment service that calculates comprehensive security scores based on file integrity, vulnerabilities, login security, user security, 2FA compliance, maintenance, and plugin maintenance factors.
- ApiResponse trait: Standardizes success, error, and paginated responses with consistent keys and optional metadata.
- Form Request classes: Define strict validation rules for user creation and updates, enabling declarative validation in controllers.
- AgentController: Demonstrates service usage for agent handshake, plugin ingestion, and periodic ping, including activity logging and response formatting.
- SendTelegramNotification job: Implements retry logic with exponential backoff and failure handling for asynchronous Telegram messaging.
- AppServiceProvider: Application service provider for registering and binding services.
- ActivityLog model and migration: Persist activity logs with indexing and morph relations for subjects.
- ExternalPluginCache model: Stores WP.org plugin metadata with caching and abandonment detection.
- Plugin model: Manages internal plugin registry with version tracking.
- SitePlugin model: Tracks plugin installations per site with type classification and update availability.
- SiteSecurityScore model: Stores daily security scores with detailed breakdowns.
- PortalSetting model: Stores key-value settings consumed by services.

**Section sources**
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PluginClassificationService.php:1-178](file://portal/app/Services/PluginClassificationService.php#L1-L178)
- [SitePluginIngestService.php:1-131](file://portal/app/Services/SitePluginIngestService.php#L1-L131)
- [SecurityScoreService.php:1-215](file://portal/app/Services/SecurityScoreService.php#L1-L215)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [UpdateUserRequest.php:1-27](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L1-L27)
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [AppServiceProvider.php:1-25](file://portal/app/Providers/AppServiceProvider.php#L1-L25)
- [ActivityLog.php:1-37](file://portal/app/Models/ActivityLog.php#L1-L37)
- [ExternalPluginCache.php:1-50](file://portal/app/Models/ExternalPluginCache.php#L1-L50)
- [Plugin.php:1-35](file://portal/app/Models/Plugin.php#L1-L35)
- [SitePlugin.php:1-63](file://portal/app/Models/SitePlugin.php#L1-L63)
- [SiteSecurityScore.php:1-31](file://portal/app/Models/SiteSecurityScore.php#L1-L31)
- [2026_05_15_070004_create_activity_logs_table.php:1-32](file://portal/database/migrations/2026_05_15_070004_create_activity_logs_table.php#L1-L32)
- [2026_05_19_000001_phase6_external_plugin_management.php:1-169](file://portal/database/migrations/2026_05_19_000001_phase6_external_plugin_management.php#L1-L169)
- [PortalSetting.php:1-11](file://portal/app/Models/PortalSetting.php#L1-L11)

## Architecture Overview
The service layer sits between controllers and persistence/external systems. Controllers orchestrate requests, delegate validation to form requests, and invoke services for business logic. Services encapsulate cross-cutting concerns such as logging, notifications, plugin classification, ingestion, and security scoring, and coordinate with models and configuration.

```mermaid
sequenceDiagram
participant C as "AgentController"
participant SPI as "SitePluginIngestService"
participant PCS as "PluginClassificationService"
participant SP as "SitePlugin"
participant DB as "Database"
C->>C : "Validate request"
C->>C : "Process all_plugins payload"
C->>SPI : "ingest(site, allPlugins)"
SPI->>PCS : "classifyBatch(slugs)"
PCS->>DB : "Check company prefixes & cache"
PCS-->>SPI : "Classification results"
SPI->>DB : "Upsert site plugins with versions"
SPI->>DB : "Remove unreported plugins"
SPI-->>C : "Number of plugins processed"
C-->>C : "Return JSON response"
```

**Diagram sources**
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [SitePluginIngestService.php:30-110](file://portal/app/Services/SitePluginIngestService.php#L30-L110)
- [PluginClassificationService.php:43-161](file://portal/app/Services/PluginClassificationService.php#L43-L161)

**Section sources**
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [SitePluginIngestService.php:30-110](file://portal/app/Services/SitePluginIngestService.php#L30-L110)
- [PluginClassificationService.php:43-161](file://portal/app/Services/PluginClassificationService.php#L43-L161)
- [ActivityLog.php:9-37](file://portal/app/Models/ActivityLog.php#L9-L37)

## Detailed Component Analysis

### ActivityLogService
Purpose:
- Centralized logging for auditable actions with optional subject polymorphism and metadata.
- Graceful degradation when the activity_logs table is missing by falling back to application logs.

Key behaviors:
- Accepts action, optional subject (Eloquent model), optional user, optional IP address, and optional metadata.
- Detects subject type and ID via Eloquent introspection.
- Inserts into activity_logs if the table exists; otherwise logs via application logger.
- Encodes metadata to JSON before insertion; logs warnings on failures.

```mermaid
flowchart TD
Start(["log(action, subject?, user?, ip?, metadata?)"]) --> Build["Build base data payload"]
Build --> HasSubject{"Has subject?"}
HasSubject --> |Yes| AddSubject["Add subject_type and subject_id"]
HasSubject --> |No| MaybeMeta{"Has metadata?"}
AddSubject --> MaybeMeta
MaybeMeta --> |Yes| EncodeMeta["Encode metadata to JSON"]
MaybeMeta --> |No| CheckTable["Check if activity_logs table exists"]
EncodeMeta --> CheckTable
CheckTable --> Exists{"Table exists?"}
Exists --> |Yes| Insert["Insert into activity_logs"]
Exists --> |No| Fallback["Log via application logger"]
Insert --> Catch["Catch exceptions and warn"]
Fallback --> Catch
Catch --> End(["void"])
```

**Diagram sources**
- [ActivityLogService.php:16-48](file://portal/app/Services/ActivityLogService.php#L16-L48)

**Section sources**
- [ActivityLogService.php:16-48](file://portal/app/Services/ActivityLogService.php#L16-L48)
- [2026_05_15_070004_create_activity_logs_table.php:11-24](file://portal/database/migrations/2026_05_15_070004_create_activity_logs_table.php#L11-L24)
- [ActivityLog.php:13-25](file://portal/app/Models/ActivityLog.php#L13-L25)

### TelegramNotificationService
Purpose:
- Provide synchronous sending for testing and asynchronous queuing for production.
- Retrieve and cache Telegram bot token and default chat ID from settings.
- Support admin channel notifications and cache invalidation.

Key behaviors:
- send(chatId, message): synchronous HTTP call to Telegram Bot API with timeout and error logging.
- queue(chatId?, message): dispatches SendTelegramNotification job; defaults to cached default chat ID.
- notifyAdminChannel(message): convenience method to queue to default chat ID.
- getBotToken()/getDefaultChatId(): cached retrieval via PortalSetting.
- clearCache(): clears cached settings after configuration changes.

```mermaid
sequenceDiagram
participant C as "Caller"
participant S as "TelegramNotificationService"
participant Cache as "Cache"
participant DB as "PortalSetting"
participant Job as "SendTelegramNotification"
participant API as "Telegram Bot API"
C->>S : "queue(chatId?, message)"
S->>Cache : "get default chat ID (cached)"
alt "No chat ID"
S-->>C : "Log warning and return"
else "Has chat ID"
S->>Job : "dispatch(chatId, message)"
Job->>DB : "get telegram_bot_token"
Job->>API : "sendMessage"
alt "Successful"
API-->>Job : "2xx"
Job-->>S : "done"
else "Unsuccessful"
API-->>Job : "non-2xx"
Job-->>S : "throw to retry"
end
end
```

**Diagram sources**
- [TelegramNotificationService.php:53-105](file://portal/app/Services/TelegramNotificationService.php#L53-L105)
- [SendTelegramNotification.php:25-52](file://portal/app/Jobs/SendTelegramNotification.php#L25-L52)
- [PortalSetting.php:9](file://portal/app/Models/PortalSetting.php#L9)

**Section sources**
- [TelegramNotificationService.php:16-105](file://portal/app/Services/TelegramNotificationService.php#L16-L105)
- [SendTelegramNotification.php:25-60](file://portal/app/Jobs/SendTelegramNotification.php#L25-L60)
- [PortalSetting.php:9](file://portal/app/Models/PortalSetting.php#L9)

### PluginClassificationService
Purpose:
- Automatic plugin categorization service that classifies plugins as internal, wporg, or premium.
- Optimized batch processing with caching and WP.org API fallback checking.

Key behaviors:
- classify(slug): single plugin classification using company prefixes, internal registry, and WP.org cache.
- classifyBatch(slugs): batch classification with optimized database queries and API calls.
- getCompanyPrefixes(): retrieves configured company plugin prefixes from PortalSetting.
- WP.org API integration with rate limiting and cache population.
- Abandonment detection based on last_updated timestamps (>730 days).

```mermaid
flowchart TD
Start(["classifyBatch(slugs)"]) --> FetchPrefixes["Fetch company prefixes"]
FetchPrefixes --> InternalCheck["Check internal plugins"]
InternalCheck --> WporgCheck["Check WP.org cache"]
WporgCheck --> PremiumCheck["Mark remaining as premium"]
PremiumCheck --> ApiFallback["API fallback for uncached premium"]
ApiFallback --> RateLimit["200ms delay per request"]
RateLimit --> CachePopulate["Populate external cache"]
CachePopulate --> Result["Return classification map"]
```

**Diagram sources**
- [PluginClassificationService.php:43-161](file://portal/app/Services/PluginClassificationService.php#L43-L161)

**Section sources**
- [PluginClassificationService.php:12-178](file://portal/app/Services/PluginClassificationService.php#L12-L178)
- [PortalSetting.php:9](file://portal/app/Models/PortalSetting.php#L9)
- [ExternalPluginCache.php:18-24](file://portal/app/Models/ExternalPluginCache.php#L18-L24)
- [Plugin.php:15-18](file://portal/app/Models/Plugin.php#L15-L18)

### SitePluginIngestService
Purpose:
- Comprehensive plugin ingestion service that processes agent plugin data and maintains site plugin synchronization.
- Handles plugin classification, version resolution, and cleanup of unreported plugins.

Key behaviors:
- ingest(site, allPlugins): processes plugin payload with transactional upserts.
- Classifies plugin types using PluginClassificationService.
- Resolves latest versions from internal registry or WP.org cache.
- Maintains synchronization by removing plugins no longer reported by agents.
- Handles edge cases like empty payloads and missing slugs.

```mermaid
sequenceDiagram
participant AC as "AgentController"
participant SPI as "SitePluginIngestService"
participant PCS as "PluginClassificationService"
participant DB as "Database"
AC->>SPI : "ingest(site, allPlugins)"
SPI->>PCS : "classifyBatch(slugs)"
PCS-->>SPI : "type classifications"
SPI->>DB : "Transaction begin"
loop For each plugin
SPI->>DB : "Resolve latest version"
SPI->>DB : "Upsert SitePlugin"
end
SPI->>DB : "Delete unreported plugins"
SPI->>DB : "Transaction commit"
SPI-->>AC : "Count of upserted plugins"
```

**Diagram sources**
- [SitePluginIngestService.php:30-110](file://portal/app/Services/SitePluginIngestService.php#L30-L110)
- [PluginClassificationService.php:43-161](file://portal/app/Services/PluginClassificationService.php#L43-L161)

**Section sources**
- [SitePluginIngestService.php:23-131](file://portal/app/Services/SitePluginIngestService.php#L23-L131)
- [PluginClassificationService.php:43-161](file://portal/app/Services/PluginClassificationService.php#L43-L161)
- [SitePlugin.php:35-41](file://portal/app/Models/SitePlugin.php#L35-L41)
- [Plugin.php:15-18](file://portal/app/Models/Plugin.php#L15-L18)
- [ExternalPluginCache.php:18-24](file://portal/app/Models/ExternalPluginCache.php#L18-L24)

### SecurityScoreService
Purpose:
- Enhanced security assessment service that calculates comprehensive security scores based on multiple risk factors.
- Provides both total scores and detailed breakdowns for transparency.

Key behaviors:
- calculateScore(site): computes final security score (0-100) by applying deductions.
- calculateBreakdown(site): returns detailed deduction breakdown by category.
- recalculateAndStore(site): persists daily security scores with calculated timestamps.
- Deduction categories: file integrity, vulnerabilities, login security, user security, 2FA compliance, maintenance, plugin maintenance.

```mermaid
flowchart TD
Start(["calculateScore(site)"]) --> Init["score = 100"]
Init --> FileIntegrity["Apply file integrity deductions"]
FileIntegrity --> Vulnerabilities["Apply vulnerability deductions"]
Vulnerabilities --> LoginSecurity["Apply login security deductions"]
LoginSecurity --> UserSecurity["Apply user security deductions"]
UserSecurity --> TwoFa["Apply 2FA deductions"]
TwoFa --> Maintenance["Apply maintenance deductions"]
Maintenance --> PluginMaintenance["Apply plugin maintenance deductions"]
PluginMaintenance --> Clamp["Clamp to 0-100 range"]
Clamp --> Result["Return final score"]
```

**Diagram sources**
- [SecurityScoreService.php:17-29](file://portal/app/Services/SecurityScoreService.php#L17-L29)

**Section sources**
- [SecurityScoreService.php:15-215](file://portal/app/Services/SecurityScoreService.php#L15-L215)
- [SiteSecurityScore.php:12-24](file://portal/app/Models/SiteSecurityScore.php#L12-L24)
- [SecurityAlert.php:47-61](file://portal/app/Models/SecurityAlert.php#L47-L61)
- [SiteVulnerability.php:49-58](file://portal/app/Models/SiteVulnerability.php#L49-L58)

### ApiResponse Trait
Purpose:
- Standardize API responses across controllers with consistent keys and optional metadata.

Key behaviors:
- successResponse(data?, message?, code=200, meta[]): constructs success envelope with optional message and meta.
- errorResponse(message, code=400, errors?): constructs error envelope with optional errors.
- paginatedResponse(paginator, resource?): wraps items with pagination metadata.

```mermaid
classDiagram
class ApiResponse {
+successResponse(data, message, code, meta) JsonResponse
+errorResponse(message, code, errors) JsonResponse
+paginatedResponse(paginator, resource) JsonResponse
}
```

**Diagram sources**
- [ApiResponse.php:9-54](file://portal/app/Traits/ApiResponse.php#L9-L54)

**Section sources**
- [ApiResponse.php:9-54](file://portal/app/Traits/ApiResponse.php#L9-L54)

### Form Request Classes (Validation Patterns)
Purpose:
- Declarative validation for user creation and updates, enforcing business rules at the boundary.

Key behaviors:
- StoreUserRequest: validates required fields, unique email, role enumeration, and optional booleans.
- UpdateUserRequest: conditionally validates fields and ignores current user's email uniqueness during update.

```mermaid
flowchart TD
Start(["Form Request Validation"]) --> Rules["Define rules per field"]
Rules --> Authorize["authorize() returns true"]
Authorize --> Controller["Controller receives validated data"]
Controller --> Use["Use validated data in service/controller"]
Use --> End(["Proceed with business logic"])
```

**Diagram sources**
- [StoreUserRequest.php:14-24](file://portal/app/Http/Requests/User/StoreUserRequest.php#L14-L24)
- [UpdateUserRequest.php:15-25](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L15-L25)

**Section sources**
- [StoreUserRequest.php:14-24](file://portal/app/Http/Requests/User/StoreUserRequest.php#L14-L24)
- [UpdateUserRequest.php:15-25](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L15-L25)

### AgentController Integration
Purpose:
- Demonstrate service composition in agent-facing endpoints: handshake, plugin ingestion, and ping.

Key behaviors:
- handshake: validates agent-provided metadata, updates site state, and logs "site.connected" with metadata.
- Plugin ingestion: processes comprehensive plugin lists with classification and synchronization.
- ping: validates heartbeat payload, recovers disconnected sites, logs "site.recovered" if needed, and updates timestamps.

```mermaid
sequenceDiagram
participant Agent as "WP Agent"
participant AC as "AgentController"
participant SPI as "SitePluginIngestService"
participant ALS as "ActivityLogService"
participant Site as "Site model"
Agent->>AC : "POST /api/agent/handshake"
AC->>AC : "validate()"
AC->>Site : "update(status, versions, timestamps)"
AC->>ALS : "log('site.connected', site, null, ip, metadata)"
Agent->>AC : "POST /api/agent/ping"
AC->>AC : "validate()"
AC->>Site : "update(last_ping_at)"
alt "Has all_plugins"
AC->>SPI : "ingest(site, allPlugins)"
SPI-->>AC : "plugins processed count"
end
AC-->>Agent : "JSON success"
```

**Diagram sources**
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [ActivityLogService.php:16-48](file://portal/app/Services/ActivityLogService.php#L16-L48)
- [SitePluginIngestService.php:30-110](file://portal/app/Services/SitePluginIngestService.php#L30-L110)

**Section sources**
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [ActivityLogService.php:16-48](file://portal/app/Services/ActivityLogService.php#L16-L48)
- [SitePluginIngestService.php:30-110](file://portal/app/Services/SitePluginIngestService.php#L30-L110)

### Notification Job (Asynchronous Delivery)
Purpose:
- Asynchronously deliver Telegram notifications with retries and failure handling.

Key behaviors:
- handle(): retrieves token, sends message, logs outcomes, and throws on failure to trigger retry.
- failed(): logs permanent failure details.

```mermaid
flowchart TD
Dispatch["Dispatch SendTelegramNotification(job)"] --> Handle["handle()"]
Handle --> Token["Get telegram_bot_token"]
Token --> Empty{"Token empty?"}
Empty --> |Yes| Warn["Log warning and return"]
Empty --> |No| Send["HTTP sendMessage"]
Send --> Resp{"Response successful?"}
Resp --> |Yes| Done["Log success"]
Resp --> |No| Throw["Throw to retry"]
Throw --> Retry["Retry with backoff"]
Done --> End["End"]
Warn --> End
```

**Diagram sources**
- [SendTelegramNotification.php:25-60](file://portal/app/Jobs/SendTelegramNotification.php#L25-L60)

**Section sources**
- [SendTelegramNotification.php:25-60](file://portal/app/Jobs/SendTelegramNotification.php#L25-L60)

### Service Lifecycle and Dependency Injection
- AppServiceProvider: placeholder for registering and binding services; can be extended to bind interfaces to implementations or configure singleton lifecycles.
- Jobs: leverage Laravel's queue infrastructure; constructor injection of primitive parameters is supported by the framework.

Recommendations:
- Bind interfaces in a service provider for testability and flexibility.
- Use queued jobs for long-running or external API calls to keep controllers responsive.
- Keep services stateless where possible to simplify lifecycle management.

**Section sources**
- [AppServiceProvider.php:12-23](file://portal/app/Providers/AppServiceProvider.php#L12-L23)
- [SendTelegramNotification.php:20-23](file://portal/app/Jobs/SendTelegramNotification.php#L20-L23)

## Dependency Analysis
- Controllers depend on services and traits for business logic and response formatting.
- Services depend on models and configuration for persistence and settings.
- Jobs depend on services for configuration retrieval and external APIs.
- Form requests decouple validation from controllers, promoting reuse and clarity.
- PluginClassificationService depends on ExternalPluginCache, Plugin, and PortalSetting models.
- SitePluginIngestService depends on PluginClassificationService, ExternalPluginCache, Plugin, and SitePlugin models.
- SecurityScoreService depends on multiple security-related models for comprehensive assessment.

```mermaid
graph LR
AC["AgentController"] --> ALS["ActivityLogService"]
AC --> SPI["SitePluginIngestService"]
AC --> AR["ApiResponse"]
TNS["TelegramNotificationService"] --> PS["PortalSetting"]
TNS --> STN["SendTelegramNotification"]
SPI --> PCS["PluginClassificationService"]
SPI --> EP["ExternalPluginCache"]
SPI --> PL["Plugin"]
SPI --> SP["SitePlugin"]
PCS --> EP
PCS --> PL
PCS --> PS
SSS["SecurityScoreService"] --> SSS["SiteSecurityScore"]
SSS --> SA["SecurityAlert"]
SSS --> SV["SiteVulnerability"]
ALS --> AL["ActivityLog"]
ALS --> USR["User"]
SUR["StoreUserRequest"] --> USR
UUR["UpdateUserRequest"] --> USR
```

**Diagram sources**
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PluginClassificationService.php:1-178](file://portal/app/Services/PluginClassificationService.php#L1-L178)
- [SitePluginIngestService.php:1-131](file://portal/app/Services/SitePluginIngestService.php#L1-L131)
- [SecurityScoreService.php:1-215](file://portal/app/Services/SecurityScoreService.php#L1-L215)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [ActivityLog.php:1-37](file://portal/app/Models/ActivityLog.php#L1-L37)
- [ExternalPluginCache.php:1-50](file://portal/app/Models/ExternalPluginCache.php#L1-L50)
- [Plugin.php:1-35](file://portal/app/Models/Plugin.php#L1-L35)
- [SitePlugin.php:1-63](file://portal/app/Models/SitePlugin.php#L1-L63)
- [SiteSecurityScore.php:1-31](file://portal/app/Models/SiteSecurityScore.php#L1-L31)
- [SecurityAlert.php:1-62](file://portal/app/Models/SecurityAlert.php#L1-L62)
- [SiteVulnerability.php:1-59](file://portal/app/Models/SiteVulnerability.php#L1-L59)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [PortalSetting.php:1-11](file://portal/app/Models/PortalSetting.php#L1-L11)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [UpdateUserRequest.php:1-27](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L1-L27)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)

**Section sources**
- [AgentController.php:126-155](file://portal/app/Http/Controllers/Agent/AgentController.php#L126-L155)
- [ActivityLogService.php:1-50](file://portal/app/Services/ActivityLogService.php#L1-L50)
- [TelegramNotificationService.php:1-107](file://portal/app/Services/TelegramNotificationService.php#L1-L107)
- [PluginClassificationService.php:1-178](file://portal/app/Services/PluginClassificationService.php#L1-L178)
- [SitePluginIngestService.php:1-131](file://portal/app/Services/SitePluginIngestService.php#L1-L131)
- [SecurityScoreService.php:1-215](file://portal/app/Services/SecurityScoreService.php#L1-L215)
- [SendTelegramNotification.php:1-62](file://portal/app/Jobs/SendTelegramNotification.php#L1-L62)
- [ActivityLog.php:1-37](file://portal/app/Models/ActivityLog.php#L1-L37)
- [ExternalPluginCache.php:1-50](file://portal/app/Models/ExternalPluginCache.php#L1-L50)
- [Plugin.php:1-35](file://portal/app/Models/Plugin.php#L1-L35)
- [SitePlugin.php:1-63](file://portal/app/Models/SitePlugin.php#L1-L63)
- [SiteSecurityScore.php:1-31](file://portal/app/Models/SiteSecurityScore.php#L1-L31)
- [SecurityAlert.php:1-62](file://portal/app/Models/SecurityAlert.php#L1-L62)
- [SiteVulnerability.php:1-59](file://portal/app/Models/SiteVulnerability.php#L1-L59)
- [User.php:1-38](file://portal/app/Models/User.php#L1-L38)
- [PortalSetting.php:1-11](file://portal/app/Models/PortalSetting.php#L1-L11)
- [StoreUserRequest.php:1-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L1-L26)
- [UpdateUserRequest.php:1-27](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L1-L27)
- [ApiResponse.php:1-56](file://portal/app/Traits/ApiResponse.php#L1-L56)

## Performance Considerations
- ActivityLogService: Uses lightweight inserts when the table exists; falls back to logs otherwise. Consider batching or asynchronous logging for high-volume scenarios.
- TelegramNotificationService: Caches tokens and chat IDs to reduce database queries; still performs HTTP calls. Use queueing for bursty traffic.
- PluginClassificationService: Implements batch processing with optimized database queries and WP.org API rate limiting (200ms delay per request).
- SitePluginIngestService: Uses database transactions to ensure atomicity and performs bulk operations to minimize query overhead.
- SecurityScoreService: Calculates scores incrementally with multiple model relationships; consider caching for frequently accessed sites.
- SendTelegramNotification: Includes retry attempts and backoff; ensure queue workers are scaled appropriately.
- ApiResponse: Keep payloads lean; avoid unnecessary serialization overhead.

## Troubleshooting Guide
Common issues and resolutions:
- Activity logs not persisted:
  - Verify the activity_logs table exists and is migrated.
  - Confirm database connectivity and permissions.
  - Review fallback logs for warnings indicating failures.
- Telegram notifications fail:
  - Check that the bot token and default chat ID are set and cached.
  - Inspect job worker logs for retry attempts and permanent failures.
  - Validate network reachability to the Telegram Bot API.
- Plugin classification failures:
  - Verify company plugin prefixes are configured in PortalSetting.
  - Check WP.org API connectivity and rate limiting.
  - Monitor ExternalPluginCache for proper population.
- Site plugin ingestion issues:
  - Ensure agent is sending proper plugin data structure.
  - Verify database constraints and unique indexes are intact.
  - Check transaction rollback scenarios.
- Security score calculation problems:
  - Verify all security-related models have proper relationships.
  - Check SiteSecurityScore table schema and indexing.
  - Review calculation logic for specific deduction categories.
- Validation errors:
  - Ensure form requests are applied in controllers.
  - Confirm unique constraints and rule applicability for updates.

**Section sources**
- [ActivityLogService.php:34-47](file://portal/app/Services/ActivityLogService.php#L34-L47)
- [TelegramNotificationService.php:18-47](file://portal/app/Services/TelegramNotificationService.php#L18-L47)
- [PluginClassificationService.php:153-157](file://portal/app/Services/PluginClassificationService.php#L153-L157)
- [SitePluginIngestService.php:32-36](file://portal/app/Services/SitePluginIngestService.php#L32-L36)
- [SecurityScoreService.php:17-29](file://portal/app/Services/SecurityScoreService.php#L17-L29)
- [SendTelegramNotification.php:40-60](file://portal/app/Jobs/SendTelegramNotification.php#L40-L60)
- [StoreUserRequest.php:14-24](file://portal/app/Http/Requests/User/StoreUserRequest.php#L14-L24)
- [UpdateUserRequest.php:15-25](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L15-L25)

## Conclusion
The service layer cleanly separates business logic from controllers and persistence, enabling maintainability, testability, and scalability. ActivityLogService, TelegramNotificationService, PluginClassificationService, SitePluginIngestService, and SecurityScoreService demonstrate robust error handling, graceful fallbacks, and asynchronous processing. ApiResponse ensures consistent API responses. Form requests enforce validation close to the boundary. With proper queueing, caching, provider bindings, and comprehensive plugin management, the system supports reliable operations across agent integrations, administrative tasks, and advanced security monitoring.

## Appendices

### Transaction Management
- For multi-step operations, wrap service calls in database transactions to ensure atomicity.
- Use explicit transactions around writes to activity logs, plugin ingestion, and security score calculations.
- Roll back on exceptions and surface user-friendly errors via ApiResponse.
- SitePluginIngestService uses transactions to maintain data consistency during plugin synchronization.

### Testing Strategies
- Unit tests:
  - Mock external APIs (e.g., Telegram, WP.org) and database for isolated testing.
  - Test validation rules via form request classes.
  - Mock PluginClassificationService for SitePluginIngestService testing.
- Feature tests:
  - Simulate agent handshake, plugin ingestion, and ping requests; assert logged activities and response formats.
  - Verify queued jobs and retry behavior.
  - Test SecurityScoreService calculations with various security scenarios.
- Service tests:
  - Validate success/error responses and pagination envelopes using ApiResponse.
  - Test PluginClassificationService with different plugin types and edge cases.

### Integration Points and Configuration
- Routes define protected and role-based access; ensure services honor middleware constraints.
- Third-party service credentials are managed via configuration; integrate with services that require external tokens.
- Company plugin prefixes are configured via PortalSetting for PluginClassificationService.
- Database schema migrations support comprehensive plugin management and security scoring.

**Section sources**
- [api.php:13-57](file://portal/routes/api.php#L13-L57)
- [services.php:17-36](file://portal/config/services.php#L17-L36)
- [2026_05_19_000001_phase6_external_plugin_management.php:10-169](file://portal/database/migrations/2026_05_19_000001_phase6_external_plugin_management.php#L10-L169)
- [PortalSetting.php:9](file://portal/app/Models/PortalSetting.php#L9)