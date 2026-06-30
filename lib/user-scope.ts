import type { CategoryScope, Permission } from './roles'

/**
 * The three user verticals surfaced on the User Management page. Each maps to a
 * route under `/users` and to a role filter passed to `listUsers`.
 */
export type UserVertical = 'clients' | 'drivers' | 'artisans'

const ALL_VERTICALS: UserVertical[] = ['clients', 'drivers', 'artisans']

/**
 * The category an admin is effectively scoped to.
 *
 * Named-role admins carry an authoritative `categoryScope` on their JWT — we
 * trust it. Custom-permission admins (created from the granular checkbox picker
 * rather than a named role) carry NO role and NO `categoryScope`, so we infer
 * the vertical from their ops permissions instead:
 *
 *   - holds `view_rides` but not `view_jobs`  → rides    (drivers only)
 *   - holds `view_jobs`  but not `view_rides` → artisan  (artisans only)
 *   - holds both, or neither                  → global   (all verticals)
 *
 * Every full-access role (Admin, Back Officer, Regional Manager, Director,
 * Product Owner, Accountant) holds BOTH `view_rides` and `view_jobs`, so they
 * always resolve to global. Only the two coordinator shapes hold exactly one.
 */
export function effectiveCategory(
  category: CategoryScope | null,
  permissions: Permission[] | null | undefined,
): CategoryScope | null {
  if (category) return category
  const perms = permissions ?? []
  const hasRides = perms.includes('view_rides')
  const hasJobs = perms.includes('view_jobs')
  if (hasRides && !hasJobs) return 'rides'
  if (hasJobs && !hasRides) return 'artisan'
  return null
}

/**
 * Which user verticals an admin may browse, derived from category scope (region
 * scoping is enforced separately, server-side, from the JWT).
 *
 * A user who is BOTH a driver and an artisan still appears in the matching
 * single-role list (drivers list for `role=driver`, artisans list for
 * `role=artisan`), so a coordinator can always open that person's profile.
 */
export function verticalsForCategory(
  category: CategoryScope | null,
  permissions?: Permission[] | null,
): UserVertical[] {
  const scope = effectiveCategory(category, permissions)
  if (scope === 'rides') return ['drivers']
  if (scope === 'artisan') return ['artisans']
  return ALL_VERTICALS
}

/** True if an admin may view the given vertical. */
export function canViewVertical(
  category: CategoryScope | null,
  vertical: UserVertical,
  permissions?: Permission[] | null,
): boolean {
  return verticalsForCategory(category, permissions).includes(vertical)
}

/** The User Management landing route for an admin's scope. */
export function userLandingPath(
  category: CategoryScope | null,
  permissions?: Permission[] | null,
): string {
  return `/users/${verticalsForCategory(category, permissions)[0]}`
}
