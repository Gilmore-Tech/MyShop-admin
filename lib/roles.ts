/**
 * Permission model for MyShop Admin Panel.
 *
 * Named admin roles resolve to granular permissions. The Product Owner is the
 * platform Super Admin and always receives the full current catalogue; a
 * custom `manage_admins` grant alone is not root authority. The backend remains
 * authoritative; these helpers drive frontend nav/button visibility only.
 */

export type Permission =
  | 'view_dashboard'
  | 'view_analytics'
  | 'view_live_map'
  | 'view_verifications'
  | 'verify_documents'
  | 'validate_verification'
  | 'finalize_verification'
  | 'lift_verification_suspension'
  | 'upload_provider_document'
  | 'view_disputes'
  | 'resolve_dispute'
  | 'view_users'
  | 'suspend_user'
  | 'ban_user'
  | 'delete_user'
  | 'force_logout_user'
  | 'edit_provider_profile'
  | 'view_categories'
  | 'edit_categories'
  | 'delete_category'
  | 'view_ride_categories'
  | 'edit_ride_categories'
  | 'view_jobs'
  | 'assign_job'
  | 'delete_job'
  | 'view_payments'
  | 'run_batch_payouts'
  | 'write_off_clawback'
  | 'escalate_clawback'
  | 'view_reports'
  | 'view_rides_report'
  | 'view_artisans_report'
  | 'view_revenue_report'
  | 'view_pilot_report'
  | 'view_config'
  | 'view_ussd'
  | 'send_announcement'
  | 'manage_admins'
  | 'review_bid'
  | 'view_rides'
  | 'intervene_ride'
  | 'view_audit_logs'
  | 'view_emergency'
  | 'resolve_welfare_check'
  | 'view_activity'
  | 'unlock_payout_method'
  | 'view_help_articles'
  | 'edit_help_articles'
  | 'delete_help_articles'
  | 'view_session_recovery'
  | 'resolve_session_recovery'
  | 'view_role_account_recovery'
  | 'intake_role_account_recovery'
  | 'resolve_client_role_account_recovery'
  | 'view_promotions'
  | 'manage_promotions'
  | 'view_referrals'
  | 'manage_referrals'

/**
 * Source of truth for the granular permission catalogue. Drives the grouped
 * checkbox picker in the Admin Accounts dialogs and the per-permission labels
 * used across the UI. Keep every Permission listed in exactly one group.
 */
export interface PermissionDef {
  key: Permission
  label: string
  description?: string
}

export interface PermissionGroup {
  group: string
  permissions: PermissionDef[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'Dashboard & Analytics',
    permissions: [
      { key: 'view_dashboard', label: 'View dashboard', description: 'Access the dashboard overview and KPIs' },
      { key: 'view_analytics', label: 'View analytics', description: 'Analytics page access + cross-platform overview charts (filtered by category scope)' },
      { key: 'view_activity', label: 'View activity feed', description: 'Platform-wide recent activity stream' },
    ],
  },
  {
    group: 'Reports',
    permissions: [
      { key: 'view_reports', label: 'View reports', description: 'Reports page access + overview KPIs report' },
      { key: 'view_rides_report', label: 'View rides report', description: 'Driver performance report (rides vertical)' },
      { key: 'view_artisans_report', label: 'View artisans report', description: 'Artisan performance report (services vertical)' },
      { key: 'view_revenue_report', label: 'View revenue report', description: 'Collections, commission and payouts report' },
      { key: 'view_pilot_report', label: 'View pilot report', description: 'Pilot success target metrics' },
    ],
  },
  {
    group: 'Live Monitoring',
    permissions: [
      { key: 'view_live_map', label: 'View live map', description: 'Real-time ride/job map markers' },
      { key: 'view_emergency', label: 'View emergency alerts', description: 'SOS and welfare-check alerts' },
      { key: 'resolve_welfare_check', label: 'Resolve welfare checks', description: 'Acknowledge and close welfare checks' },
    ],
  },
  {
    group: 'Verification',
    permissions: [
      { key: 'view_verifications', label: 'View verification queue', description: 'Provider documents and client KYC queue' },
      { key: 'verify_documents', label: 'Verify documents', description: 'Stage 1 — check each document for authenticity, then submit to the coordinator' },
      { key: 'validate_verification', label: 'Validate verification', description: 'Stage 2 — coordinator validates the approved set before the RM' },
      { key: 'finalize_verification', label: 'Finalize verification', description: 'Stage 3 — RM final decision that sends the provider online' },
      { key: 'lift_verification_suspension', label: 'Lift verification suspension', description: 'Reinstate an auto-suspended provider' },
      { key: 'upload_provider_document', label: 'Upload provider document', description: 'Upload a replacement document on a provider\'s behalf (e.g. expired licence); returns them to the verification queue' },
    ],
  },
  {
    group: 'Disputes & Recovery',
    permissions: [
      { key: 'view_disputes', label: 'View disputes', description: 'Disputes and incidents list/detail' },
      { key: 'resolve_dispute', label: 'Resolve disputes', description: 'Refund, reject or clawback a dispute' },
      { key: 'view_session_recovery', label: 'View account recovery', description: 'Session/account recovery requests' },
      { key: 'resolve_session_recovery', label: 'Resolve account recovery', description: 'Approve or reject recovery requests' },
      { key: 'view_role_account_recovery', label: 'View deleted-role recovery', description: 'View retained client/provider role recovery requests within exact scope' },
      { key: 'intake_role_account_recovery', label: 'Accept provider recovery intake', description: 'Regional Admin only: restore one provider to pending document revalidation' },
      { key: 'resolve_client_role_account_recovery', label: 'Approve client recovery', description: 'Global Operations only: restore one retained client role' },
    ],
  },
  {
    group: 'Users',
    permissions: [
      { key: 'view_users', label: 'View users', description: 'Browse clients, drivers and artisans' },
      { key: 'suspend_user', label: 'Suspend users', description: 'Temporarily block a user account' },
      { key: 'ban_user', label: 'Ban users', description: 'Permanently ban a user account' },
      { key: 'delete_user', label: 'Delete users', description: 'Soft-delete a user (housekeeping / requests)' },
      { key: 'force_logout_user', label: 'Force logout', description: 'Revoke all sessions for a user' },
      { key: 'edit_provider_profile', label: 'Edit provider profile', description: "Edit a driver's or artisan's profile details (excludes payout fields)" },
      { key: 'unlock_payout_method', label: 'Unlock payout method', description: 'Clear a locked payout method' },
    ],
  },
  {
    group: 'Categories',
    permissions: [
      { key: 'view_categories', label: 'View categories', description: 'Browse service categories' },
      { key: 'edit_categories', label: 'Edit categories', description: 'Create and edit service categories' },
      { key: 'delete_category', label: 'Delete categories', description: 'Hard-delete a service category' },
      { key: 'view_ride_categories', label: 'View ride tiers', description: 'Browse ride tiers and their pricing' },
      { key: 'edit_ride_categories', label: 'Edit ride tiers', description: 'Create, edit, activate/deactivate ride tiers' },
    ],
  },
  {
    group: 'Jobs & Rides',
    permissions: [
      { key: 'view_jobs', label: 'View jobs', description: 'Artisan job list and detail' },
      { key: 'assign_job', label: 'Assign jobs', description: 'Manually assign jobs to artisans' },
      { key: 'delete_job', label: 'Delete jobs', description: 'Soft-delete a job' },
      { key: 'review_bid', label: 'Review high bids', description: 'Approve or reject flagged high bids' },
      { key: 'view_rides', label: 'View rides', description: 'Ride list and detail' },
      { key: 'intervene_ride', label: 'Intervene on rides', description: 'Cancel or force-complete a ride' },
    ],
  },
  {
    group: 'Payments',
    permissions: [
      { key: 'view_payments', label: 'View payments', description: 'Transactions, revenue, payouts, clawbacks' },
      { key: 'run_batch_payouts', label: 'Run batch payouts', description: 'Force-run a payout batch' },
      { key: 'write_off_clawback', label: 'Write off clawbacks', description: 'Cancel an outstanding clawback balance' },
      { key: 'escalate_clawback', label: 'Escalate clawbacks', description: 'Escalate a clawback for manual collection' },
    ],
  },
  {
    group: 'Config & USSD',
    permissions: [
      { key: 'view_config', label: 'View configuration', description: 'Platform marketplace config' },
      { key: 'view_ussd', label: 'View USSD & SMS logs', description: 'USSD sessions and SMS logs' },
    ],
  },
  {
    group: 'Comms & Help',
    permissions: [
      { key: 'send_announcement', label: 'Send announcements', description: 'Broadcast push announcements' },
      { key: 'view_promotions', label: 'View promotions', description: 'Browse promo codes' },
      { key: 'manage_promotions', label: 'Manage promotions', description: 'Create and edit promo codes' },
      { key: 'view_help_articles', label: 'View help articles', description: 'Browse the help centre' },
      { key: 'edit_help_articles', label: 'Edit help articles', description: 'Create and edit help articles' },
      { key: 'delete_help_articles', label: 'Delete help articles', description: 'Delete help articles' },
    ],
  },
  {
    group: 'Referrals & Loyalty',
    permissions: [
      { key: 'view_referrals', label: 'View referrals', description: 'Referral ledger, metrics and per-user funnels' },
      { key: 'manage_referrals', label: 'Manage referrals', description: 'Manually award or void referral bonuses' },
    ],
  },
  {
    group: 'Admin & Audit',
    permissions: [
      { key: 'manage_admins', label: 'Manage admins', description: 'Create admins and assign permissions' },
      { key: 'view_audit_logs', label: 'View audit logs', description: 'Admin action audit trail' },
    ],
  },
]

/** Flat permission → label map, derived from PERMISSION_GROUPS. */
export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => [p.key, p.label])),
) as Record<Permission, string>

/** Every permission in the catalogue, flattened (e.g. for a "grant all" preset). */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key))

/** Current root role plus the pre-named-role compatibility value. */
export function isSuperAdminRole(role: unknown): boolean {
  return role === 'product_owner' || role === 'super_admin'
}

/** Root sessions always expose the complete current catalogue. */
export function effectiveAdminPermissions(
  role: unknown,
  permissions: Permission[] | null | undefined,
): Permission[] {
  return isSuperAdminRole(role) ? [...ALL_PERMISSIONS] : [...(permissions ?? [])]
}

/** Returns true if the admin's permission set includes the given permission. */
export function can(
  permissions: Permission[] | null | undefined,
  permission: Permission,
): boolean {
  if (!permissions) return false
  return permissions.includes(permission)
}

// ════════════════════════════════════════════════════════════════════════════
// Named roles + data scope
//
// Mirrors apps/api/src/common/permissions/permission.catalogue.ts (ADMIN_ROLES /
// ADMIN_ROLE_DEFINITIONS) — keep the two in sync. A role is a fixed permission
// bundle plus a data scope (region + category). The backend is authoritative
// (it derives `permissions` from the role); these definitions drive the admin
// account picker and let the UI reason about a role offline.
// ════════════════════════════════════════════════════════════════════════════

export type Role =
  | 'product_owner'
  | 'director'
  | 'accountant'
  | 'regional_manager'
  | 'coordinator_rides'
  | 'coordinator_artisan'
  | 'back_officer'
  | 'admin'

export type CategoryScope = 'rides' | 'artisan'

export interface RoleDef {
  role: Role
  level: number | null
  label: string
  description: string
  requiresRegion: boolean
  requiresCategory: boolean
  category: CategoryScope | null
  global: boolean
  permissions: Permission[]
}

const ADMIN_BASE: Permission[] = [
  'view_dashboard', 'view_activity', 'view_verifications', 'verify_documents',
  'view_users', 'edit_provider_profile', 'view_jobs', 'view_rides', 'view_help_articles', 'edit_help_articles',
]

// Provider recovery intake is a non-inheriting stage: the named regional
// Admin must perform it before the existing Coordinator → RM chain.
const ADMIN_RECOVERY_PERMISSIONS: Permission[] = [
  'view_role_account_recovery', 'intake_role_account_recovery',
]

const BACK_OFFICER_EXTRA: Permission[] = [
  'suspend_user', 'force_logout_user', 'unlock_payout_method',
  'view_emergency', 'resolve_welfare_check', 'view_disputes',
]

// Coordinators are view-mostly within their vertical: no Payments module, no
// catalogue editing, and (artisan) no manual job assignment — see the rules in
// the role spec. Everything is locked to their one category.
const COORDINATOR_SHARED: Permission[] = [
  'view_dashboard', 'view_activity', 'view_live_map', 'view_analytics', 'view_reports',
  'view_revenue_report', 'view_pilot_report', 'view_verifications', 'validate_verification',
  'view_users', 'suspend_user', 'ban_user', 'force_logout_user', 'unlock_payout_method',
  'view_disputes', 'resolve_dispute',
  'view_emergency', 'resolve_welfare_check', 'send_announcement',
  'view_promotions', 'manage_promotions', 'view_referrals',
]

const COORDINATOR_RIDES_OPS: Permission[] = [
  'view_rides', 'intervene_ride', 'view_ride_categories', 'view_rides_report',
]

const COORDINATOR_ARTISAN_OPS: Permission[] = [
  'view_jobs', 'delete_job', 'review_bid', 'view_categories', 'view_artisans_report',
]

const dedupe = (perms: Permission[]): Permission[] => [...new Set(perms)]

const REGIONAL_MANAGER_PERMS = dedupe([
  ...COORDINATOR_SHARED, ...COORDINATOR_RIDES_OPS, ...COORDINATOR_ARTISAN_OPS,
  'finalize_verification', 'lift_verification_suspension', 'upload_provider_document', 'delete_user', 'edit_provider_profile', 'delete_category',
  'run_batch_payouts', 'escalate_clawback', 'write_off_clawback', 'view_ussd', 'manage_referrals', 'view_audit_logs',
])

const DIRECTOR_PERMS = dedupe(ALL_PERMISSIONS.filter(
  p => p !== 'manage_admins' && p !== 'view_config' && p !== 'intake_role_account_recovery'
))

const PRODUCT_OWNER_PERMS = dedupe(ALL_PERMISSIONS)

const ACCOUNTANT_PERMS: Permission[] = dedupe([
  'view_dashboard', 'view_analytics', 'view_activity', 'view_reports', 'view_rides_report',
  'view_artisans_report', 'view_revenue_report', 'view_pilot_report', 'view_payments',
  'view_users', 'view_jobs', 'view_rides', 'view_disputes', 'view_audit_logs',
])

export const ROLE_DEFINITIONS: Record<Role, RoleDef> = {
  product_owner: {
    role: 'product_owner', level: 1, label: 'Product Owner',
    description: 'Full platform access including account and configuration management.',
    requiresRegion: false, requiresCategory: false, category: null, global: true,
    permissions: PRODUCT_OWNER_PERMS,
  },
  director: {
    role: 'director', level: 2, label: 'Director of Business Operations',
    description: 'Views everything nationwide + operational actions. No account or config management.',
    requiresRegion: false, requiresCategory: false, category: null, global: true,
    permissions: DIRECTOR_PERMS,
  },
  accountant: {
    role: 'accountant', level: null, label: 'Accountant',
    description: 'Global read-only finance plus all reports and analytics. No money-moving actions.',
    requiresRegion: false, requiresCategory: false, category: null, global: true,
    permissions: ACCOUNTANT_PERMS,
  },
  regional_manager: {
    role: 'regional_manager', level: 3, label: 'Regional Manager',
    description: 'Everything within one region, both categories. Performs the final verification that sends providers online.',
    requiresRegion: true, requiresCategory: false, category: null, global: false,
    permissions: REGIONAL_MANAGER_PERMS,
  },
  coordinator_rides: {
    role: 'coordinator_rides', level: 4, label: 'Coordinator — Rides',
    description: 'Rides vertical within one region. Validates verified documents before the RM finalizes.',
    requiresRegion: true, requiresCategory: true, category: 'rides', global: false,
    permissions: dedupe([...COORDINATOR_SHARED, ...COORDINATOR_RIDES_OPS]),
  },
  coordinator_artisan: {
    role: 'coordinator_artisan', level: 4, label: 'Coordinator — Artisan',
    description: 'Artisan vertical within one region. Validates verified documents before the RM finalizes.',
    requiresRegion: true, requiresCategory: true, category: 'artisan', global: false,
    permissions: dedupe([...COORDINATOR_SHARED, ...COORDINATOR_ARTISAN_OPS]),
  },
  back_officer: {
    role: 'back_officer', level: 5, label: 'Back Officer',
    description: 'Supervises admin office work within one region (both categories): all admin permissions plus escalation handling, manual job assignment and announcements.',
    requiresRegion: true, requiresCategory: false, category: null, global: false,
    permissions: dedupe([...ADMIN_BASE, ...BACK_OFFICER_EXTRA, 'assign_job', 'send_announcement']),
  },
  admin: {
    role: 'admin', level: 6, label: 'Admin',
    description: 'Office work within one region. Checks each document for authenticity and integrity.',
    requiresRegion: true, requiresCategory: false, category: null, global: false,
    permissions: dedupe([...ADMIN_BASE, ...ADMIN_RECOVERY_PERMISSIONS]),
  },
}

/** All roles in hierarchy order (Accountant last as a specialist). */
export const ROLE_ORDER: Role[] = [
  'product_owner', 'director', 'regional_manager', 'coordinator_rides',
  'coordinator_artisan', 'back_officer', 'admin', 'accountant',
]

/** The authoritative permission bundle for a named role. */
export function permissionsForRole(role: Role): Permission[] {
  return [...ROLE_DEFINITIONS[role].permissions]
}

/** Human label for a role value (falls back to the raw value). */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Custom'
  return (ROLE_DEFINITIONS as Record<string, RoleDef>)[role]?.label ?? role
}
