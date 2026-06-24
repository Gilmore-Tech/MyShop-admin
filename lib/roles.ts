/**
 * Permission model for MyShop Admin Panel.
 *
 * Granular per-admin permissions. There is no fixed-role concept: each admin
 * holds an explicit set of permissions assigned by a super admin (= any admin
 * holding `manage_admins`). The backend carries these permissions in the JWT
 * and enforces them server-side; the helpers here drive frontend nav/button
 * visibility only.
 */

export type Permission =
  | 'view_dashboard'
  | 'view_analytics'
  | 'view_live_map'
  | 'view_verifications'
  | 'review_verification'
  | 'lift_verification_suspension'
  | 'view_disputes'
  | 'resolve_dispute'
  | 'view_users'
  | 'suspend_user'
  | 'ban_user'
  | 'delete_user'
  | 'force_logout_user'
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
      { key: 'view_analytics', label: 'View analytics', description: 'Revenue, ride/job and payment charts' },
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
      { key: 'review_verification', label: 'Review verification', description: 'Approve or reject provider documents' },
      { key: 'lift_verification_suspension', label: 'Lift verification suspension', description: 'Reinstate an auto-suspended provider' },
    ],
  },
  {
    group: 'Disputes & Recovery',
    permissions: [
      { key: 'view_disputes', label: 'View disputes', description: 'Disputes and incidents list/detail' },
      { key: 'resolve_dispute', label: 'Resolve disputes', description: 'Refund, reject or clawback a dispute' },
      { key: 'view_session_recovery', label: 'View account recovery', description: 'Session/account recovery requests' },
      { key: 'resolve_session_recovery', label: 'Resolve account recovery', description: 'Approve or reject recovery requests' },
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

/** Returns true if the admin's permission set includes the given permission. */
export function can(
  permissions: Permission[] | null | undefined,
  permission: Permission,
): boolean {
  if (!permissions) return false
  return permissions.includes(permission)
}
