# Site User Management

<cite>
**Referenced Files in This Document**
- [Site.php](file://portal/app/Models/Site.php)
- [User.php](file://portal/app/Models/User.php)
- [AuthorizesSiteAccess.php](file://portal/app/Traits/AuthorizesSiteAccess.php)
- [2026_05_15_070003_create_site_users_table.php](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php)
- [SiteController.php](file://portal/app/Http/Controllers/Portal/SiteController.php)
- [SitePluginController.php](file://portal/app/Http/Controllers/Portal/SitePluginController.php)
- [DeploymentController.php](file://portal/app/Http/Controllers/Portal/DeploymentController.php)
- [ExternalPluginController.php](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php)
- [UserController.php](file://portal/app/Http/Controllers/Portal/UserController.php)
- [StoreSiteRequest.php](file://portal/app/Http/Requests/Site/StoreSiteRequest.php)
- [UpdateSiteRequest.php](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php)
- [StoreUserRequest.php](file://portal/app/Http/Requests/User/StoreUserRequest.php)
- [UpdateUserRequest.php](file://portal/app/Http/Requests/User/UpdateUserRequest.php)
- [RoleMiddleware.php](file://portal/app/Http/Middleware/RoleMiddleware.php)
- [EnsureUserIsActive.php](file://portal/app/Http/Middleware/EnsureUserIsActive.php)
- [permission.php](file://portal/config/permission.php)
- [api.php](file://portal/routes/api.php)
- [sites.ts](file://portal/frontend/src/lib/services/sites.ts)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/page.tsx)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/[id]/page.tsx)
</cite>

## Update Summary
**Changes Made**
- Added comprehensive documentation for the new centralized AuthorizesSiteAccess trait
- Updated access control section to reflect the new centralized authorization system
- Added documentation for all controllers using the AuthorizesSiteAccess trait
- Enhanced security implementation details with the new trait-based approach
- Updated architecture diagrams to show the centralized access control pattern

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

## Introduction
This document explains the site user management functionality, focusing on how administrators assign users to specific sites, how delegated permissions are enforced, and how the system restricts access to only those sites a user is assigned to. The system now features a centralized access control approach through the AuthorizesSiteAccess trait, ensuring consistent authorization logic across all site-related endpoints. It covers the site-users relationship via a dedicated pivot table, the synchronization mechanism for updating assignments, access control enforcement, and the user-role-to-site-permission mapping. It also documents the user assignment workflow during site creation and updates, and provides examples of request and response patterns for site management endpoints.

## Project Structure
The site user management feature spans backend models, controllers, traits, requests, middleware, and frontend components:
- Backend models define the site-user relationship and access scoping.
- Controllers implement CRUD operations and enforce access checks through the centralized AuthorizesSiteAccess trait.
- The AuthorizesSiteAccess trait provides a unified method for validating site access across all site-related endpoints.
- Requests validate user-provided data, including user assignment arrays.
- Middleware enforces role-based access and active user status.
- Frontend components collect user assignment data and render assigned users.

```mermaid
graph TB
subgraph "Backend"
M_Site["Model: Site<br/>portal/app/Models/Site.php"]
M_User["Model: User<br/>portal/app/Models/User.php"]
T_Authorizes["Trait: AuthorizesSiteAccess<br/>portal/app/Traits/AuthorizesSiteAccess.php"]
C_Site["Controller: SiteController<br/>portal/app/Http/Controllers/Portal/SiteController.php"]
C_SitePlugin["Controller: SitePluginController<br/>portal/app/Http/Controllers/Portal/SitePluginController.php"]
C_Deployment["Controller: DeploymentController<br/>portal/app/Http/Controllers/Portal/DeploymentController.php"]
C_ExternalPlugin["Controller: ExternalPluginController<br/>portal/app/Http/Controllers/Portal/ExternalPluginController.php"]
C_User["Controller: UserController<br/>portal/app/Http/Controllers/Portal/UserController.php"]
R_StoreSite["Request: StoreSiteRequest<br/>portal/app/Http/Requests/Site/StoreSiteRequest.php"]
R_UpdateSite["Request: UpdateSiteRequest<br/>portal/app/Http/Requests/Site/UpdateSiteRequest.php"]
R_StoreUser["Request: StoreUserRequest<br/>portal/app/Http/Requests/User/StoreUserRequest.php"]
R_UpdateUser["Request: UpdateUserRequest<br/>portal/app/Http/Requests/User/UpdateUserRequest.php"]
MW_Role["Middleware: RoleMiddleware<br/>portal/app/Http/Middleware/RoleMiddleware.php"]
MW_Active["Middleware: EnsureUserIsActive<br/>portal/app/Http/Middleware/EnsureUserIsActive.php"]
CFG_Perms["Config: permission.php<br/>portal/config/permission.php"]
DB_SiteUsers["DB: site_users pivot<br/>portal/database/migrations/2026_05_15_070003_create_site_users_table.php"]
end
subgraph "Routes"
R_API["Routes: api.php<br/>portal/routes/api.php"]
end
subgraph "Frontend"
FE_Svc["Service: sites.ts<br/>portal/frontend/src/lib/services/sites.ts"]
FE_List["Page: Sites List<br/>portal/frontend/src/app/(dashboard)/sites/page.tsx"]
FE_Detail["Page: Site Detail<br/>portal/frontend/src/app/(dashboard)/sites/[id]/page.tsx"]
end
M_Site --> DB_SiteUsers
M_User --> DB_SiteUsers
T_Authorizes --> M_Site
C_Site --> T_Authorizes
C_SitePlugin --> T_Authorizes
C_Deployment --> T_Authorizes
C_ExternalPlugin --> T_Authorizes
R_API --> C_Site
R_API --> C_SitePlugin
R_API --> C_Deployment
R_API --> C_ExternalPlugin
R_API --> C_User
FE_Svc --> R_API
FE_List --> FE_Svc
FE_Detail --> FE_Svc
MW_Role --> R_API
MW_Active --> R_API
CFG_Perms --> C_User
```

**Diagram sources**
- [Site.php:12-85](file://portal/app/Models/Site.php#L12-L85)
- [User.php:11-38](file://portal/app/Models/User.php#L11-L38)
- [AuthorizesSiteAccess.php:28-53](file://portal/app/Traits/AuthorizesSiteAccess.php#L28-L53)
- [SiteController.php:17-21](file://portal/app/Http/Controllers/Portal/SiteController.php#L17-L21)
- [SitePluginController.php:11-15](file://portal/app/Http/Controllers/Portal/SitePluginController.php#L11-L15)
- [DeploymentController.php:15-25](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L15-L25)
- [ExternalPluginController.php:15-25](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php#L15-L25)
- [UserController.php:15-18](file://portal/app/Http/Controllers/Portal/UserController.php#L15-L18)
- [StoreSiteRequest.php:7-27](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L7-L27)
- [UpdateSiteRequest.php:7-27](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php#L7-L27)
- [StoreUserRequest.php:7-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L7-L26)
- [UpdateUserRequest.php:8-27](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L8-L27)
- [RoleMiddleware.php:9-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L9-L37)
- [EnsureUserIsActive.php:9-26](file://portal/app/Http/Middleware/EnsureUserIsActive.php#L9-L26)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)
- [2026_05_15_070003_create_site_users_table.php:7-25](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php#L7-L25)
- [api.php:1-52](file://portal/routes/api.php#L1-L52)
- [sites.ts:1-13](file://portal/frontend/src/lib/services/sites.ts#L1-L13)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/page.tsx#L36-L361)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/[id]/page.tsx#L175-L209)

**Section sources**
- [Site.php:12-85](file://portal/app/Models/Site.php#L12-L85)
- [User.php:11-38](file://portal/app/Models/User.php#L11-L38)
- [AuthorizesSiteAccess.php:28-53](file://portal/app/Traits/AuthorizesSiteAccess.php#L28-L53)
- [2026_05_15_070003_create_site_users_table.php:7-25](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php#L7-L25)
- [SiteController.php:17-21](file://portal/app/Http/Controllers/Portal/SiteController.php#L17-L21)
- [SitePluginController.php:11-15](file://portal/app/Http/Controllers/Portal/SitePluginController.php#L11-L15)
- [DeploymentController.php:15-25](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L15-L25)
- [ExternalPluginController.php:15-25](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php#L15-L25)
- [UserController.php:15-18](file://portal/app/Http/Controllers/Portal/UserController.php#L15-L18)
- [StoreSiteRequest.php:7-27](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L7-L27)
- [UpdateSiteRequest.php:7-27](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php#L7-L27)
- [StoreUserRequest.php:7-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L7-L26)
- [UpdateUserRequest.php:8-27](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L8-L27)
- [RoleMiddleware.php:9-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L9-L37)
- [EnsureUserIsActive.php:9-26](file://portal/app/Http/Middleware/EnsureUserIsActive.php#L9-L26)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)
- [api.php:1-52](file://portal/routes/api.php#L1-L52)
- [sites.ts:1-13](file://portal/frontend/src/lib/services/sites.ts#L1-L13)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/page.tsx#L36-L361)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/[id]/page.tsx#L175-L209)

## Core Components
- Site model defines the belongs-to-many relationship with User through the site_users pivot table and provides an access-scoping method for non-admin users.
- User model integrates role-based permissions via the HasRoles trait.
- AuthorizesSiteAccess trait centralizes site access validation logic with a unified assertSiteAccess method.
- SiteController handles listing, creating, updating, and viewing sites, enforcing access checks through the centralized trait.
- SitePluginController, DeploymentController, and ExternalPluginController enforce access checks for plugin management operations.
- UserController manages user lifecycle and role assignments.
- Requests validate user assignment arrays and other fields.
- Middleware enforces role-based access and active user status.
- Routes group endpoints by role and access level.

**Section sources**
- [Site.php:51-84](file://portal/app/Models/Site.php#L51-L84)
- [User.php:11-38](file://portal/app/Models/User.php#L11-L38)
- [AuthorizesSiteAccess.php:28-53](file://portal/app/Traits/AuthorizesSiteAccess.php#L28-L53)
- [SiteController.php:23-133](file://portal/app/Http/Controllers/Portal/SiteController.php#L23-L133)
- [SitePluginController.php:16-35](file://portal/app/Http/Controllers/Portal/SitePluginController.php#L16-L35)
- [DeploymentController.php:374-388](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L374-L388)
- [ExternalPluginController.php:488-498](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php#L488-L498)
- [UserController.php:33-112](file://portal/app/Http/Controllers/Portal/UserController.php#L33-L112)
- [StoreSiteRequest.php:14-26](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L14-L26)
- [UpdateSiteRequest.php:14-25](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php#L14-L25)
- [RoleMiddleware.php:15-35](file://portal/app/Http/Middleware/RoleMiddleware.php#L15-L35)
- [EnsureUserIsActive.php:11-24](file://portal/app/Http/Middleware/EnsureUserIsActive.php#L11-L24)
- [api.php:13-51](file://portal/routes/api.php#L13-L51)

## Architecture Overview
The site user management architecture centers around a many-to-many relationship between sites and users, enforced by a dedicated pivot table. A new centralized access control system ensures that all site-related endpoints consistently validate user access through the AuthorizesSiteAccess trait. This trait encapsulates the authorization logic that determines whether a user can access a specific site, with administrators having unrestricted access and other roles limited to sites where they are assigned. The system maintains consistent authorization across all site-related operations including site management, plugin operations, deployment actions, and activity monitoring.

```mermaid
classDiagram
class Site {
+int id
+string name
+string url
+string status
+users() BelongsToMany
+scopeAccessibleBy(query, user) Builder
}
class User {
+int id
+string name
+string email
+string role
+is_active bool
}
class AuthorizesSiteAccess {
+assertSiteAccess(request, site) void
}
class SiteController {
+index() Response
+show(request, site) Response
+update(request, site) Response
+destroy(request, site) Response
}
class SitePluginController {
+index(request, site) Response
}
class DeploymentController {
+rollbackHistory(request, site) Response
}
class ExternalPluginController {
+sitePlugins(request, site) Response
+activate(request, site) Response
+deactivate(request, site) Response
+uninstall(request, site) Response
+updateAllOnSite(request, site) Response
}
Site "1" -- "many" User : "belongsToMany"
SiteController --> AuthorizesSiteAccess : "uses"
SitePluginController --> AuthorizesSiteAccess : "uses"
DeploymentController --> AuthorizesSiteAccess : "uses"
ExternalPluginController --> AuthorizesSiteAccess : "uses"
```

**Diagram sources**
- [Site.php:12-85](file://portal/app/Models/Site.php#L12-L85)
- [User.php:11-38](file://portal/app/Models/User.php#L11-L38)
- [AuthorizesSiteAccess.php:28-53](file://portal/app/Traits/AuthorizesSiteAccess.php#L28-L53)
- [SiteController.php:17-21](file://portal/app/Http/Controllers/Portal/SiteController.php#L17-L21)
- [SitePluginController.php:11-15](file://portal/app/Http/Controllers/Portal/SitePluginController.php#L11-L15)
- [DeploymentController.php:15-25](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L15-L25)
- [ExternalPluginController.php:15-25](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php#L15-L25)

## Detailed Component Analysis

### Centralized Site Access Control System
**Updated** The system now features a centralized AuthorizesSiteAccess trait that provides consistent authorization logic across all site-related endpoints.

- The AuthorizesSiteAccess trait implements a unified assertSiteAccess method that validates user access to specific sites.
- The trait handles authentication checking and throws HttpResponseException with standardized JSON error responses.
- All site-related controllers now use this trait to enforce consistent access control.
- Administrators bypass the site assignment check entirely, while other users must be assigned to the target site.

```mermaid
sequenceDiagram
participant Controller as "Any Site Controller"
participant Trait as "AuthorizesSiteAccess"
participant SiteModel as "Site Model"
participant User as "Authenticated User"
Controller->>Trait : "assertSiteAccess(request, site)"
Trait->>User : "Check if user exists"
User-->>Trait : "Authenticated user"
Trait->>SiteModel : "Site : : accessibleBy(user)"
SiteModel-->>Trait : "Query builder"
Trait->>SiteModel : "whereKey(site->id)->exists()"
SiteModel-->>Trait : "Boolean result"
alt Access granted
Trait-->>Controller : "Continue execution"
else Access denied
Trait-->>Controller : "Throw 403 HttpResponseException"
end
```

**Diagram sources**
- [AuthorizesSiteAccess.php:35-52](file://portal/app/Traits/AuthorizesSiteAccess.php#L35-L52)
- [Site.php:140-149](file://portal/app/Models/Site.php#L140-L149)

**Section sources**
- [AuthorizesSiteAccess.php:28-53](file://portal/app/Traits/AuthorizesSiteAccess.php#L28-L53)
- [Site.php:140-149](file://portal/app/Models/Site.php#L140-L149)

### Site-User Relationship and Pivot Table
- The Site model declares a belongs-to-many relationship with User using the site_users table and timestamps.
- The pivot table enforces uniqueness on the site_id and user_id pair and cascades deletes.
- The access-scoping method filters sites for non-admin users to those where the user is assigned.

```mermaid
erDiagram
SITES {
int id PK
string name
string url
string status
}
USERS {
int id PK
string name
string email
string role
bool is_active
}
SITE_USERS {
int id PK
int site_id FK
int user_id FK
timestamp created_at
timestamp updated_at
}
SITES ||--o{ SITE_USERS : "has many"
USERS ||--o{ SITE_USERS : "has many"
```

**Diagram sources**
- [Site.php:51-54](file://portal/app/Models/Site.php#L51-L54)
- [2026_05_15_070003_create_site_users_table.php:11-17](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php#L11-L17)

**Section sources**
- [Site.php:51-84](file://portal/app/Models/Site.php#L51-L84)
- [2026_05_15_070003_create_site_users_table.php:11-17](file://portal/database/migrations/2026_05_15_070003_create_site_users_table.php#L11-L17)

### Syncing User Assignments
- During site creation and updates, the controller checks for a user_ids array and synchronizes assignments using a method that replaces existing assignments with the provided set.
- This ensures the site's user set matches exactly what is sent in the request.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Route as "Routes api.php"
participant Ctrl as "SiteController"
participant Model as "Site Model"
participant DB as "DB : site_users"
Client->>Route : "POST /api/sites" with { user_ids }
Route->>Ctrl : "store()"
Ctrl->>Model : "create(validated data)"
Model-->>Ctrl : "Site instance"
Ctrl->>Model : "users()->sync(user_ids)"
Model->>DB : "insert/remove rows to match user_ids"
Ctrl-->>Client : "201 Created + api_secret_key_plain"
```

**Diagram sources**
- [SiteController.php:62-92](file://portal/app/Http/Controllers/Portal/SiteController.php#L62-L92)
- [StoreSiteRequest.php:23-24](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L23-L24)
- [Site.php:51-54](file://portal/app/Models/Site.php#L51-L54)

**Section sources**
- [SiteController.php:75-78](file://portal/app/Http/Controllers/Portal/SiteController.php#L75-L78)
- [StoreSiteRequest.php:23-24](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L23-L24)

### Access Control and Delegated Permissions
**Updated** Access control is now enforced through a centralized AuthorizesSiteAccess trait that provides consistent authorization logic across all site-related endpoints.

- The AuthorizesSiteAccess trait centralizes the "can this user touch this site" validation logic.
- Non-admin users are restricted to sites they are assigned to via the Site::accessibleBy scope.
- The assertSiteAccess method handles both authentication and authorization checks.
- All site-related controllers (SiteController, SitePluginController, DeploymentController, ExternalPluginController) use this trait.
- RoleMiddleware enforces role-based access for admin-only endpoints.
- EnsureUserIsActive middleware blocks inactive users.

```mermaid
flowchart TD
Start(["Request to any site endpoint"]) --> CheckAuth["Is user authenticated?"]
CheckAuth --> |No| Unauthorized["Return 401 Unauthorized"]
CheckAuth --> |Yes| CheckRole["Is user admin?"]
CheckRole --> |Yes| LoadData["Load site with relations"]
CheckRole --> |No| CheckAssignment["Does Site::accessibleBy include current user?"]
CheckAssignment --> |Yes| LoadData
CheckAssignment --> |No| Forbidden["Return 403 Forbidden"]
LoadData --> ReturnOK["Return 200 OK"]
```

**Diagram sources**
- [AuthorizesSiteAccess.php:35-52](file://portal/app/Traits/AuthorizesSiteAccess.php#L35-L52)
- [Site.php:140-149](file://portal/app/Models/Site.php#L140-L149)
- [RoleMiddleware.php:15-35](file://portal/app/Http/Middleware/RoleMiddleware.php#L15-L35)
- [EnsureUserIsActive.php:11-24](file://portal/app/Http/Middleware/EnsureUserIsActive.php#L11-L24)

**Section sources**
- [AuthorizesSiteAccess.php:28-53](file://portal/app/Traits/AuthorizesSiteAccess.php#L28-L53)
- [Site.php:140-149](file://portal/app/Models/Site.php#L140-L149)
- [SiteController.php:118-125](file://portal/app/Http/Controllers/Portal/SiteController.php#L118-L125)
- [SitePluginController.php:16-18](file://portal/app/Http/Controllers/Portal/SitePluginController.php#L16-L18)
- [DeploymentController.php:374-376](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L374-L376)
- [ExternalPluginController.php:488-490](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php#L488-L490)
- [RoleMiddleware.php:15-35](file://portal/app/Http/Middleware/RoleMiddleware.php#L15-L35)
- [EnsureUserIsActive.php:11-24](file://portal/app/Http/Middleware/EnsureUserIsActive.php#L11-L24)

### User Assignment Workflow During Site Creation and Updates
- Validation allows optional user_ids array; each ID must exist in the users table.
- On creation, the controller creates the site and immediately syncs user assignments.
- On update, the controller updates attributes and syncs user assignments if provided.

```mermaid
sequenceDiagram
participant FE as "Frontend Sites Page"
participant API as "Sites Service"
participant Route as "Routes api.php"
participant Ctrl as "SiteController"
participant Req as "UpdateSiteRequest"
FE->>API : "PUT /sites/{id} { user_ids }"
API->>Route : "Dispatch request"
Route->>Ctrl : "update()"
Ctrl->>Req : "validate()"
Req-->>Ctrl : "validated data"
Ctrl->>Ctrl : "update attributes"
Ctrl->>Ctrl : "users()->sync(user_ids)"
Ctrl-->>API : "200 OK + site with users"
```

**Diagram sources**
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/page.tsx#L90-L122)
- [sites.ts:7-8](file://portal/frontend/src/lib/services/sites.ts#L7-L8)
- [api.php:36-38](file://portal/routes/api.php#L36-L38)
- [SiteController.php:114-133](file://portal/app/Http/Controllers/Portal/SiteController.php#L114-L133)
- [UpdateSiteRequest.php:22-23](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php#L22-L23)

**Section sources**
- [UpdateSiteRequest.php:22-23](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php#L22-L23)
- [SiteController.php:118-121](file://portal/app/Http/Controllers/Portal/SiteController.php#L118-L121)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/page.tsx#L90-L122)

### Automatic Loading of User Associations
- The show endpoint loads hosting and users relationships for display.
- The frontend renders assigned users on the site detail page.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Route as "Routes api.php"
participant Ctrl as "SiteController"
participant Model as "Site Model"
Client->>Route : "GET /api/sites/{id}"
Route->>Ctrl : "show()"
Ctrl->>Model : "load(['hosting','users'])"
Model-->>Ctrl : "Site with users"
Ctrl-->>Client : "200 OK"
```

**Diagram sources**
- [SiteController.php](file://portal/app/Http/Controllers/Portal/SiteController.php#L106)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/[id]/page.tsx#L175-L209)

**Section sources**
- [SiteController.php](file://portal/app/Http/Controllers/Portal/SiteController.php#L106)
- [page.tsx](file://portal/frontend/src/app/(dashboard)/sites/[id]/page.tsx#L175-L209)

### Relationship Between User Roles and Site-Level Permissions
- The User model integrates role-based permissions via the HasRoles trait.
- The permission configuration file defines table names and caching behavior for roles and permissions.
- RoleMiddleware enforces role-based access for admin-only endpoints.
- While the site-user pivot controls assignment, role-based middleware governs who can access which endpoints.
- The AuthorizesSiteAccess trait ensures consistent enforcement across all site-related operations.

```mermaid
graph LR
User["User Model<br/>HasRoles trait"] --> RoleMiddleware["RoleMiddleware<br/>role:admin,admin,dev"]
User --> UserController["UserController"]
User --> SiteController["SiteController"]
User --> SitePluginController["SitePluginController"]
User --> DeploymentController["DeploymentController"]
User --> ExternalPluginController["ExternalPluginController"]
CFG["permission.php<br/>table names, cache"] --> User
```

**Diagram sources**
- [User.php:11-13](file://portal/app/Models/User.php#L11-L13)
- [permission.php:35-76](file://portal/config/permission.php#L35-L76)
- [RoleMiddleware.php:15-35](file://portal/app/Http/Middleware/RoleMiddleware.php#L15-L35)
- [UserController.php:33-65](file://portal/app/Http/Controllers/Portal/UserController.php#L33-L65)
- [SiteController.php:17-21](file://portal/app/Http/Controllers/Portal/SiteController.php#L17-L21)
- [SitePluginController.php:11-15](file://portal/app/Http/Controllers/Portal/SitePluginController.php#L11-L15)
- [DeploymentController.php:15-25](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L15-L25)
- [ExternalPluginController.php:15-25](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php#L15-L25)

**Section sources**
- [User.php:11-13](file://portal/app/Models/User.php#L11-L13)
- [permission.php:35-76](file://portal/config/permission.php#L35-L76)
- [RoleMiddleware.php:15-35](file://portal/app/Http/Middleware/RoleMiddleware.php#L15-L35)
- [UserController.php:44-45](file://portal/app/Http/Controllers/Portal/UserController.php#L44-L45)

### Examples of User Assignment Requests and Responses
- Creating a site with user assignments:
  - Request: POST /api/sites with fields including name, url, hosting_id, description, tags, and user_ids.
  - Response: 201 Created with the created site and api_secret_key_plain (shown once).
- Updating a site's user assignments:
  - Request: PUT /api/sites/{id} with user_ids array.
  - Response: 200 OK with the updated site including users relationship.
- Listing sites (filtered by assignment for non-admins):
  - Request: GET /api/sites with optional filters (status, hosting_id, tag, search).
  - Response: Paginated list of sites with users_count and filtered by accessible sites.

Note: The examples reference the endpoints and validation rules documented above.

**Section sources**
- [StoreSiteRequest.php:14-26](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L14-L26)
- [UpdateSiteRequest.php:14-25](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php#L14-L25)
- [SiteController.php:62-92](file://portal/app/Http/Controllers/Portal/SiteController.php#L62-L92)
- [SiteController.php:114-133](file://portal/app/Http/Controllers/Portal/SiteController.php#L114-L133)
- [SiteController.php:23-56](file://portal/app/Http/Controllers/Portal/SiteController.php#L23-L56)

## Dependency Analysis
**Updated** The site user management feature now depends on the centralized AuthorizesSiteAccess trait for consistent authorization across all site-related controllers.

The system now includes:
- Eloquent relationships and scopes for access filtering.
- AuthorizesSiteAccess trait for centralized authorization logic.
- Request validation ensuring user_ids are valid.
- Middleware for role enforcement and active user checks.
- Routes grouping endpoints by role and access level.

```mermaid
graph TB
R["Routes api.php"] --> SC["SiteController"]
R --> SPC["SitePluginController"]
R --> DC["DeploymentController"]
R --> EPC["ExternalPluginController"]
R --> UC["UserController"]
SC --> TASA["AuthorizesSiteAccess trait"]
SPC --> TASA
DC --> TASA
EPC --> TASA
SC --> SR["StoreSiteRequest"]
SC --> UR["UpdateSiteRequest"]
UC --> URU["UpdateUserRequest"]
UC --> SRU["StoreUserRequest"]
SC --> SM["Site Model"]
SC --> UM["User Model"]
SM --> PU["site_users pivot"]
UM --> PU
R --> RM["RoleMiddleware"]
R --> AM["EnsureUserIsActive"]
UC --> PC["permission.php"]
```

**Diagram sources**
- [api.php:13-51](file://portal/routes/api.php#L13-L51)
- [SiteController.php:17-21](file://portal/app/Http/Controllers/Portal/SiteController.php#L17-L21)
- [SitePluginController.php:11-15](file://portal/app/Http/Controllers/Portal/SitePluginController.php#L11-L15)
- [DeploymentController.php:15-25](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L15-L25)
- [ExternalPluginController.php:15-25](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php#L15-L25)
- [UserController.php:15-18](file://portal/app/Http/Controllers/Portal/UserController.php#L15-L18)
- [AuthorizesSiteAccess.php:28-53](file://portal/app/Traits/AuthorizesSiteAccess.php#L28-L53)
- [StoreSiteRequest.php:7-27](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L7-L27)
- [UpdateSiteRequest.php:7-27](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php#L7-L27)
- [UpdateUserRequest.php:8-27](file://portal/app/Http/Requests/User/UpdateUserRequest.php#L8-L27)
- [StoreUserRequest.php:7-26](file://portal/app/Http/Requests/User/StoreUserRequest.php#L7-L26)
- [Site.php:12-85](file://portal/app/Models/Site.php#L12-L85)
- [User.php:11-38](file://portal/app/Models/User.php#L11-L38)
- [RoleMiddleware.php:9-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L9-L37)
- [EnsureUserIsActive.php:9-26](file://portal/app/Http/Middleware/EnsureUserIsActive.php#L9-L26)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)

**Section sources**
- [api.php:13-51](file://portal/routes/api.php#L13-L51)
- [SiteController.php:17-21](file://portal/app/Http/Controllers/Portal/SiteController.php#L17-L21)
- [SitePluginController.php:11-15](file://portal/app/Http/Controllers/Portal/SitePluginController.php#L11-L15)
- [DeploymentController.php:15-25](file://portal/app/Http/Controllers/Portal/DeploymentController.php#L15-L25)
- [ExternalPluginController.php:15-25](file://portal/app/Http/Controllers/Portal/ExternalPluginController.php#L15-L25)
- [UserController.php:15-18](file://portal/app/Http/Controllers/Portal/UserController.php#L15-L18)
- [AuthorizesSiteAccess.php:28-53](file://portal/app/Traits/AuthorizesSiteAccess.php#L28-L53)
- [Site.php:12-85](file://portal/app/Models/Site.php#L12-L85)
- [User.php:11-38](file://portal/app/Models/User.php#L11-L38)
- [RoleMiddleware.php:9-37](file://portal/app/Http/Middleware/RoleMiddleware.php#L9-L37)
- [EnsureUserIsActive.php:9-26](file://portal/app/Http/Middleware/EnsureUserIsActive.php#L9-L26)
- [permission.php:1-207](file://portal/config/permission.php#L1-L207)

## Performance Considerations
- Use eager loading (as implemented) to avoid N+1 queries when accessing sites with users.
- The accessibleBy scope leverages a whereHas clause; ensure appropriate indexing exists on the site_users pivot table for efficient filtering.
- Consider caching roles and permissions to minimize repeated lookups for frequently accessed endpoints.
- The centralized AuthorizesSiteAccess trait reduces code duplication and improves maintainability while maintaining consistent performance characteristics.

## Troubleshooting Guide
**Updated** Troubleshooting now includes issues related to the new centralized access control system.

- Access denied for non-admin users:
  - Verify the user is assigned to the requested site; otherwise, the assertSiteAccess method will return 403.
  - Check that the AuthorizesSiteAccess trait is properly imported and used in the controller.
- Authentication errors:
  - Ensure the request includes a valid authenticated user; the trait throws 401 for unauthenticated requests.
- Role-based access errors:
  - Ensure the request passes through RoleMiddleware with the correct roles; otherwise, 403 is returned.
- Inactive user errors:
  - Ensure the user is active; otherwise, EnsureUserIsActive middleware revokes tokens and returns 403.
- Validation failures:
  - Confirm user_ids exist and are provided as an array; validation rules require user IDs to exist in the users table.
- Trait usage issues:
  - Verify that controllers properly use the AuthorizesSiteAccess trait and call assertSiteAccess for all site-related operations.

**Section sources**
- [AuthorizesSiteAccess.php:35-52](file://portal/app/Traits/AuthorizesSiteAccess.php#L35-L52)
- [SiteController.php:118-125](file://portal/app/Http/Controllers/Portal/SiteController.php#L118-L125)
- [SiteController.php:189-194](file://portal/app/Http/Controllers/Portal/SiteController.php#L189-L194)
- [RoleMiddleware.php:19-32](file://portal/app/Http/Middleware/RoleMiddleware.php#L19-L32)
- [EnsureUserIsActive.php:13-21](file://portal/app/Http/Middleware/EnsureUserIsActive.php#L13-L21)
- [StoreSiteRequest.php:23-24](file://portal/app/Http/Requests/Site/StoreSiteRequest.php#L23-L24)
- [UpdateSiteRequest.php:22-23](file://portal/app/Http/Requests/Site/UpdateSiteRequest.php#L22-L23)

## Conclusion
The site user management feature provides a robust foundation for assigning users to sites and enforcing access control through a centralized AuthorizesSiteAccess trait. The trait ensures consistent authorization logic across all site-related endpoints, replacing scattered access checks with a unified approach. The site-users relationship is modeled via a dedicated pivot table, and assignments are synchronized through a dedicated method during creation and updates. The centralized access control system provides administrators with unrestricted access while limiting other users to sites where they are assigned. Role-based middleware and active user validation ensure secure operations, and the frontend integrates seamlessly with these backend capabilities to present assigned users and support user assignment workflows.