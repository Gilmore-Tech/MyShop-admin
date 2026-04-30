/**
 * Role model for MyShop Admin Panel.
 * Source of truth: docs/admin-module.md
 *
 * L1 super_admin    — Full access
 * L2 regional_admin — Verification, live map, reports, users
 * L3 ops_admin      — Job assignment, live map, disputes, users, categories
 * L4 support_agent  — Disputes only (read + resolve), user list (read-only)
 */

export type AdminRole = 'super_admin' | 'regional_admin' | 'ops_admin' | 'support_agent'

export type Permission =
  | 'view_dashboard'
  | 'view_analytics'
  | 'view_live_map'
  | 'view_verifications'
  | 'review_verification'
  | 'view_disputes'
  | 'resolve_dispute'
  | 'view_users'
  | 'suspend_user'
  | 'ban_user'
  | 'view_categories'
  | 'edit_categories'
  | 'view_jobs'
  | 'assign_job'
  | 'view_payments'
  | 'view_reports'
  | 'view_config'
  | 'view_ussd'
  | 'send_announcement'
  | 'manage_admins'
  | 'review_bid'
  | 'view_rides'
  | 'view_audit_logs'
  | 'view_emergency'
  | 'view_activity'
  | 'unlock_payout_method'

const L1: AdminRole[] = ['super_admin']
const L1L2: AdminRole[] = ['super_admin', 'regional_admin']
const L1L3: AdminRole[] = ['super_admin', 'ops_admin']
const L1L2L3: AdminRole[] = ['super_admin', 'regional_admin', 'ops_admin']
const ALL: AdminRole[] = ['super_admin', 'regional_admin', 'ops_admin', 'support_agent']
const L1L3L4: AdminRole[] = ['super_admin', 'ops_admin', 'support_agent']

export const PERMISSIONS: Record<Permission, AdminRole[]> = {
  view_dashboard:    ALL,
  view_analytics:    L1,
  view_live_map:     L1L2L3,
  view_verifications:   L1L2,
  review_verification:  L1L2,
  view_disputes:     L1L3L4,
  resolve_dispute:   L1L3L4,
  view_users:        ALL,
  suspend_user:      L1L2L3,
  ban_user:          L1,
  view_categories:   L1L3,
  edit_categories:   L1,
  view_jobs:         L1L2L3,
  assign_job:        L1L3,
  view_payments:     L1,
  view_reports:      L1L2,
  view_config:       L1,
  view_ussd:         L1,
  send_announcement: L1L3,
  manage_admins:     L1,
  review_bid:        L1L3,
  view_rides:        L1L2L3,
  view_audit_logs:   L1,
  view_emergency:    L1L2L3,
  view_activity:     L1L2L3,
  unlock_payout_method: L1L3,
}

export function can(role: AdminRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return PERMISSIONS[permission].includes(role)
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin:    'Super Admin',
  regional_admin: 'Regional Admin',
  ops_admin:      'Ops Admin',
  support_agent:  'Support Agent',
}
