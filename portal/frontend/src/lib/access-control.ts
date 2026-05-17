/**
 * Route-level role permissions, shared by the sidebar filter and the
 * AppLayout route guard so the two can't drift.
 *
 * Per the scope audit:
 *   admin → everything
 *   dev   → everything EXCEPT: Hostings, Users, Settings, Security
 *           (Repository, Deployments, Scheduled allowed as read-only — that's
 *            enforced server-side; the page itself is reachable)
 *   mkt   → only Dashboard, Sites, Orders, plus per-page autologin actions
 *
 * Each rule is a prefix match. Order doesn't matter — the first prefix that
 * matches the current pathname decides which roles are allowed. Anything not
 * listed is treated as "anyone authenticated may visit" (sane default for new
 * pages we haven't classified yet).
 */
export type Role = "admin" | "dev" | "mkt";

interface RouteRule {
  /** Path prefix. /sites also matches /sites/1, /sites/1/edit, etc. */
  prefix: string;
  /** Roles allowed to view this prefix. */
  allowed: Role[];
}

// More specific prefixes must come BEFORE less specific ones (e.g. put
// `/plugins/install` before `/plugins` would-be — but in practice the only
// such pair here is `/deployments/scheduled` under `/deployments`, both with
// the same role set, so order doesn't matter today).
const RULES: RouteRule[] = [
  // Admin only
  { prefix: "/hostings",       allowed: ["admin"] },
  { prefix: "/users",          allowed: ["admin"] },
  { prefix: "/settings",       allowed: ["admin"] },
  { prefix: "/security",       allowed: ["admin"] },

  // Admin + Dev
  { prefix: "/plugins",        allowed: ["admin", "dev"] },
  { prefix: "/deployments",    allowed: ["admin", "dev"] },
  { prefix: "/smtp",           allowed: ["admin", "dev"] },
  { prefix: "/activity-logs",  allowed: ["admin", "dev"] },

  // Everyone (including MKT)
  { prefix: "/dashboard",      allowed: ["admin", "dev", "mkt"] },
  { prefix: "/sites",          allowed: ["admin", "dev", "mkt"] },
  { prefix: "/orders",         allowed: ["admin", "dev", "mkt"] },
];

/**
 * Returns true if the given role is allowed to view the given pathname.
 * Unknown paths default to allowed (don't block new pages by accident).
 */
export function canAccessPath(role: Role | undefined, pathname: string): boolean {
  if (!role) return false;
  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return rule ? rule.allowed.includes(role) : true;
}

/**
 * Where to redirect when access is denied. We send MKT back to /dashboard
 * (their landing page), and other roles to /dashboard too — it's the only
 * universally-allowed page.
 */
export function fallbackPathFor(_role: Role): string {
  return "/dashboard";
}
