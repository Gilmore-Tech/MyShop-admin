export const ROLE_ACCOUNT_ROLES = ['client', 'driver', 'artisan'] as const

export type ExactRoleAccountRole = (typeof ROLE_ACCOUNT_ROLES)[number]

/** Build an admin route that can only address one exact public role account. */
export function roleAccountPath(
  role: ExactRoleAccountRole,
  roleAccountId: string,
  ...segments: string[]
): string {
  if (!ROLE_ACCOUNT_ROLES.includes(role)) {
    throw new Error('Exact role must be client, driver, or artisan.')
  }
  if (!roleAccountId.trim()) {
    throw new Error('roleAccountId is required.')
  }
  const tail = segments.length ? `/${segments.map(encodeURIComponent).join('/')}` : ''
  return `/admin/users/${role}/${encodeURIComponent(roleAccountId)}${tail}`
}

export function assertExactRoleAccountEnvelope(
  raw: unknown,
  expectedRole: ExactRoleAccountRole,
  expectedRoleAccountId?: string,
): void {
  const record = raw as Record<string, unknown> | null
  const forbiddenIdentityKeys = [
    'id', 'userId', 'user', 'roles', 'profiles', 'identity', 'authIdentity',
    'phoneAuthIdentity', 'client', 'driver', 'artisan',
  ]
  if (
    !record ||
    typeof record !== 'object' ||
    record.role !== expectedRole ||
    typeof record.roleAccountId !== 'string' ||
    !record.roleAccountId ||
    (expectedRoleAccountId !== undefined && record.roleAccountId !== expectedRoleAccountId) ||
    forbiddenIdentityKeys.some(key => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    throw new Error('Unsafe role-account response: require exact role/roleAccountId and no private or sibling identity fields.')
  }
}
