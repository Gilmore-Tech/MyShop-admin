import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { assertExactRoleAccountEnvelope, roleAccountPath } from '../lib/role-account-contract.ts'
import { ROLE_DEFINITIONS } from '../lib/roles.ts'

test('all account operations build an exact role-account route', () => {
  const id = '11111111-2222-3333-4444-555555555555'
  assert.equal(roleAccountPath('client', id), `/admin/users/client/${id}`)
  assert.equal(roleAccountPath('driver', id, 'suspend'), `/admin/users/driver/${id}/suspend`)
  assert.equal(roleAccountPath('artisan', id, 'ban'), `/admin/users/artisan/${id}/ban`)
  assert.equal(roleAccountPath('client', id, 'reinstate'), `/admin/users/client/${id}/reinstate`)
  assert.equal(roleAccountPath('driver', id, 'force-logout'), `/admin/users/driver/${id}/force-logout`)
  assert.equal(roleAccountPath('artisan', id, 'documents'), `/admin/users/artisan/${id}/documents`)
  assert.equal(roleAccountPath('driver', id, 'profile-photo'), `/admin/users/driver/${id}/profile-photo`)
  assert.equal(roleAccountPath('driver', id, 'driver-profile'), `/admin/users/driver/${id}/driver-profile`)
  assert.equal(roleAccountPath('artisan', id, 'artisan-profile'), `/admin/users/artisan/${id}/artisan-profile`)
  assert.equal(roleAccountPath('driver', id, 'unlock-payout-method'), `/admin/users/driver/${id}/unlock-payout-method`)
})

test('role-account routes reject an absent account id', () => {
  assert.throws(() => roleAccountPath('client', ''), /roleAccountId is required/)
})

test('response guard rejects legacy private/shared identity envelopes', () => {
  assert.doesNotThrow(() =>
    assertExactRoleAccountEnvelope(
      {
        role: 'driver',
        roleAccountId: 'driver-account-1',
        legalName: 'Exact Driver'
      },
      'driver'
    )
  )

  assert.throws(
    () =>
      assertExactRoleAccountEnvelope(
        {
          role: 'driver',
          roleAccountId: 'driver-1',
          id: 'private-user-id',
          userId: 'private-user-id',
          client: { id: 'client-1' },
          driver: { id: 'driver-1' }
        },
        'driver'
      ),
    /Unsafe role-account response/
  )

  assert.throws(
    () =>
      assertExactRoleAccountEnvelope(
        {
          role: 'artisan',
          roleAccountId: 'artisan-1'
        },
        'driver'
      ),
    /Unsafe role-account response/
  )

  assert.throws(
    () =>
      assertExactRoleAccountEnvelope(
        {
          role: 'artisan',
          roleAccountId: 'artisan-1',
          roles: ['client', 'artisan']
        },
        'artisan'
      ),
    /Unsafe role-account response/
  )

  assert.throws(
    () =>
      assertExactRoleAccountEnvelope(
        {
          role: 'client',
          roleAccountId: 'client-2'
        },
        'client',
        'client-1'
      ),
    /Unsafe role-account response/
  )
})

test('admin API contains no legacy ambiguous account-action routes', () => {
  const source = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const forbidden = ['/sessions/revoke', '/reverification', '/delete`', '/admin/users/${userId}', '/admin/users/:userId']
  for (const fragment of forbidden) {
    assert.equal(source.includes(fragment), false, `legacy route fragment remains: ${fragment}`)
  }
  for (const suffix of ['suspend', 'ban', 'reinstate', 'force-logout', 'documents', 'profile-photo', 'driver-profile', 'artisan-profile', 'unlock-payout-method']) {
    assert.match(source, new RegExp(`roleAccountPath\\([^\\n]+['\"]${suffix}['\"]`))
  }
  assert.match(source, /method: 'DELETE',[\s\S]*body: JSON\.stringify\(\{ reason \}\)/)
  assert.match(source, /role: RoleAccountRole/)
  assert.equal(source.includes('client: role ==='), false)
  assert.equal(source.includes('driver: role ==='), false)
  assert.equal(source.includes('artisan: role ==='), false)
  assert.match(source, /role: 'client'; profile: ClientRoleProfile/)
})

test('provider evidence stays private while vehicle documents complete the three-stage chain', () => {
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const verification = readFileSync(
    new URL('../app/(dashboard)/verifications/page.tsx', import.meta.url),
    'utf8',
  )
  const proxy = readFileSync(new URL('../app/api/pdf-proxy/route.ts', import.meta.url), 'utf8')

  assert.match(api, /resolvedAdminDocumentUrl\(rawUrl\)/)
  assert.match(api, /resolvedAdminDocumentUrl\(rawFileUrl\)/)
  assert.doesNotMatch(api, /fileUrl:\s*resolveCloudinaryUrl\(rawFileUrl/)
  assert.match(api, /document_review_only/)
  assert.match(verification, /item\.document_review_only/)
  assert.match(verification, /not approved until the category Coordinator and Regional Manager/)
  assert.match(verification, /await submitVerification\(item\.provider_id, providerType\)/)
  assert.match(proxy, /isSignedPrivateDownload/)
  assert.match(proxy, /\(\?:image\|raw\)\\\/download/)
})

test('session recovery is granted only to current global operations roles', () => {
  for (const role of ['product_owner', 'director'] as const) {
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('view_session_recovery'), true)
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('resolve_session_recovery'), true)
    assert.equal(ROLE_DEFINITIONS[role].global, true)
  }

  for (const role of ['accountant', 'regional_manager', 'coordinator_rides', 'coordinator_artisan', 'back_officer', 'admin'] as const) {
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('view_session_recovery'), false)
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('resolve_session_recovery'), false)
  }
})

test('session recovery UI/API remain fail-closed and exact-target aware', () => {
  const client = readFileSync(new URL('../lib/api-client.ts', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/(dashboard)/account-recovery/page.tsx', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../components/app-sidebar.tsx', import.meta.url), 'utf8')

  assert.match(client, /NEXT_PUBLIC_FF_SESSION_RECOVERY === 'true'/)
  assert.match(sidebar, /FEATURES\.sessionRecovery/)
  assert.match(api, /actionable: raw\?\.actionable === true/)
  assert.match(api, /body: \{ reason: string; recoveryRequestId\?: string \}/)
  assert.match(page, /detail\?\.actionable/)
  assert.match(page, /reason\.trim\(\)\.length >= 5/)
})

test('deleted-role recovery mirrors the approved non-inheriting authority chain', () => {
  for (const role of ['product_owner', 'director'] as const) {
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('view_role_account_recovery'), true)
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('resolve_client_role_account_recovery'), true)
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('intake_role_account_recovery'), false)
  }
  assert.equal(ROLE_DEFINITIONS.admin.permissions.includes('view_role_account_recovery'), true)
  assert.equal(ROLE_DEFINITIONS.admin.permissions.includes('intake_role_account_recovery'), true)
  assert.equal(ROLE_DEFINITIONS.admin.permissions.includes('resolve_client_role_account_recovery'), false)

  for (const role of [
    'accountant',
    'regional_manager',
    'coordinator_rides',
    'coordinator_artisan',
    'back_officer',
  ] as const) {
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('view_role_account_recovery'), false)
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('intake_role_account_recovery'), false)
    assert.equal(ROLE_DEFINITIONS[role].permissions.includes('resolve_client_role_account_recovery'), false)
  }
})

test('deleted-role recovery UI/API are distinct, fail-closed and expose no rejection path', () => {
  const client = readFileSync(new URL('../lib/api-client.ts', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const page = readFileSync(
    new URL('../app/(dashboard)/role-account-recovery/page.tsx', import.meta.url),
    'utf8',
  )
  const sidebar = readFileSync(new URL('../components/app-sidebar.tsx', import.meta.url), 'utf8')

  assert.match(client, /NEXT_PUBLIC_FF_ROLE_ACCOUNT_RECOVERY === 'true'/)
  assert.match(page, /FEATURES\.roleAccountRecovery/)
  assert.match(sidebar, /Device Session Recovery/)
  assert.match(sidebar, /Deleted Role Recovery/)
  assert.match(api, /\/admin\/role-account-recovery-requests\/\$\{requestId\}\/approve-client/)
  assert.match(api, /\/admin\/role-account-recovery-requests\/\$\{requestId\}\/intake-provider/)
  assert.doesNotMatch(api, /role-account-recovery-requests[^\n]*(?:reject|decline|deny)/i)
  assert.match(page, /Sibling[\s\S]*never joined or changed/)
  assert.match(page, /Every current document is independently re-reviewed/)
  assert.match(page, /There is\s+no reject action in this release/)
  assert.doesNotMatch(page, /rejectRoleAccountRecovery|dismissRoleAccountRecovery/)
})

test('user-management surfaces expose exact roles and quarantine shared referrals', () => {
  const clients = readFileSync(new URL('../app/(dashboard)/users/clients/page.tsx', import.meta.url), 'utf8')
  const profile = readFileSync(new URL('../components/users/user-profile-sheet.tsx', import.meta.url), 'utf8')
  const referrals = readFileSync(new URL('../app/(dashboard)/referrals/page.tsx', import.meta.url), 'utf8')
  const tabs = readFileSync(new URL('../components/users/user-tabs.tsx', import.meta.url), 'utf8')

  assert.equal(clients.includes('All Roles'), false)
  assert.equal(clients.includes('Loyalty Points'), false)
  assert.equal(tabs.includes('All Users'), false)
  assert.match(profile, /sibling accounts remain untouched/)
  assert.match(profile, /u\.roleAccountId/)
  assert.match(referrals, /legacy ledger combines roles/)
  assert.equal(referrals.includes('listReferrals'), false)
})

test('SMS audiences use isolated exact-role lists and never a shared user lookup', () => {
  const route = readFileSync(new URL('../app/api/sms/route.ts', import.meta.url), 'utf8')
  const clawbacks = readFileSync(new URL('../app/(dashboard)/payments/clawbacks/page.tsx', import.meta.url), 'utf8')

  assert.match(route, /all_users: \['client', 'driver', 'artisan'\]/)
  assert.match(route, /params\.set\('role', role\)/)
  assert.match(route, /admin\/announcements\/history/)
  assert.match(route, /send_announcement/)
  assert.equal(route.includes('userId'), false)
  assert.equal(route.includes('/admin/users/${userId}'), false)
  assert.equal(clawbacks.includes('sendSmsToUser'), false)
  assert.equal(clawbacks.includes('Remind'), false)
})

test('session recovery consumes only backend role and exact roleAccountId', () => {
  const source = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/(dashboard)/account-recovery/page.tsx', import.meta.url), 'utf8')

  assert.match(source, /const role = raw\?\.role/)
  assert.equal(source.includes('raw?.userType'), false)
  assert.equal(source.includes('raw?.currentSessionRole ??'), false)
  assert.match(page, /detail(?:\?\.|\.)roleAccountId/)
  assert.match(page, /detail\?\.role \?\? null/)
  assert.match(page, /Sibling-role sessions remain active/)
})

test('admin provider photo is fail-closed and never round-trips a caller URL through profile PATCH', () => {
  const apiClient = readFileSync(new URL('../lib/api-client.ts', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const dialog = readFileSync(new URL('../components/users/edit-provider-profile-dialog.tsx', import.meta.url), 'utf8')

  assert.match(apiClient, /NEXT_PUBLIC_FF_ADMIN_PROVIDER_PROFILE_PHOTO === 'true'/)
  assert.match(dialog, /FEATURES\.adminProviderProfilePhoto/)
  assert.doesNotMatch(api, /profilePhotoUrl\?: string/)
  assert.doesNotMatch(dialog, /payload\[PHOTO_KEY\]/)
  assert.match(api, /payload\?\.providerType !== role/)
  assert.match(api, /payload\?\.roleAccountId !== roleAccountId/)
})

test('artisan profile editor enforces solo one-job capacity before submitting', () => {
  const dialog = readFileSync(
    new URL('../components/users/edit-provider-profile-dialog.tsx', import.meta.url),
    'utf8',
  )
  assert.match(dialog, /shopCapacity: 'solo', maxConcurrentJobs: '1'/)
  assert.match(
    dialog,
    /disabled=\{f\.key === 'maxConcurrentJobs' && form\.shopCapacity === 'solo'\}/,
  )
  assert.match(dialog, /INVALID_ARTISAN_CAPACITY/)
})

test('privileged provider-document upload is fail-closed and verifies its exact response envelope', () => {
  const apiClient = readFileSync(new URL('../lib/api-client.ts', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const profile = readFileSync(new URL('../components/users/user-profile-sheet.tsx', import.meta.url), 'utf8')

  assert.match(apiClient, /NEXT_PUBLIC_FF_ADMIN_PROVIDER_DOCUMENT_UPLOAD === 'true'/)
  assert.match(profile, /FEATURES\.adminProviderDocumentUpload/)
  assert.match(api, /payload\?\.providerType !== input\.providerType/)
  assert.match(api, /payload\?\.roleAccountId !== roleAccountId/)
  assert.match(api, /payload\?\.documentType !== input\.documentType/)
  assert.match(api, /payload\?\.status !== 'pending_review'/)
  assert.match(api, /\['userId', 'providerId', 'client', 'driver', 'artisan', 'roles'\]/)
  assert.match(api, /typeof payload\?\.documentId !== 'string'/)

  const uploadableTypes = api.match(/export const ADMIN_UPLOADABLE_DOC_TYPES:[\s\S]*?= \[([\s\S]*?)\n\]/)?.[1]
  assert.ok(uploadableTypes, 'admin uploadable document catalogue is missing')
  assert.equal(uploadableTypes.includes("value: 'profile_photo'"), false)
})

test('operational views never consume nested private auth-identity names or ids', () => {
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const rides = readFileSync(
    new URL('../app/(dashboard)/rides/[id]/page.tsx', import.meta.url),
    'utf8'
  )
  const emergency = readFileSync(
    new URL('../app/(dashboard)/emergency/page.tsx', import.meta.url),
    'utf8'
  )

  for (const source of [api, rides, emergency]) {
    assert.doesNotMatch(source, /(?:client|driver|artisan)\.user(?:\?|)\.(?:fullName|email)/)
    assert.doesNotMatch(source, /(?:client|driver|artisan)\?\.user(?:\?|)\.(?:fullName|email)/)
  }
  assert.doesNotMatch(api, /providerUserId/)
  assert.match(api, /providerPhone: string \| null/)
})
