'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { PERMISSION_GROUPS, PERMISSION_LABELS, type Permission } from '@/lib/roles'

interface PermissionPickerProps {
  /** Currently-granted permissions. */
  value: Permission[]
  /** Called with the full next permission set whenever a box is toggled. */
  onChange: (next: Permission[]) => void
  /** Permissions whose checkbox is locked (e.g. your own `manage_admins`). */
  disabledKeys?: Permission[]
  /**
   * Permissions to omit entirely from the picker (not grantable via UI). Used to
   * keep `manage_admins` off-limits so root privilege can never be handed out —
   * the single root admin is designated by the `is_super_admin` flag, not this
   * permission. See docs/backend-requests.md §8.
   */
  excludeKeys?: Permission[]
}

/**
 * Grouped checkbox picker for granting granular admin permissions. Driven
 * entirely by PERMISSION_GROUPS in lib/roles.ts. Each group header has a
 * tri-state "select all" toggle.
 */
export function PermissionPicker({ value, onChange, disabledKeys = [], excludeKeys = [] }: PermissionPickerProps) {
  const selected = new Set(value)
  const isDisabled = (key: Permission) => disabledKeys.includes(key)

  // Drop excluded permissions, then any group left empty.
  const groups = PERMISSION_GROUPS
    .map(g => ({ ...g, permissions: g.permissions.filter(p => !excludeKeys.includes(p.key)) }))
    .filter(g => g.permissions.length > 0)

  function setKey(key: Permission, on: boolean) {
    if (isDisabled(key)) return
    const next = new Set(selected)
    if (on) next.add(key)
    else next.delete(key)
    onChange([...next])
  }

  function setGroup(keys: Permission[], on: boolean) {
    const next = new Set(selected)
    for (const key of keys) {
      if (isDisabled(key)) continue
      if (on) next.add(key)
      else next.delete(key)
    }
    onChange([...next])
  }

  return (
    <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
      {groups.map(group => {
        const keys = group.permissions.map(p => p.key)
        const selectedCount = keys.filter(k => selected.has(k)).length
        const groupState: boolean | 'indeterminate' =
          selectedCount === 0 ? false : selectedCount === keys.length ? true : 'indeterminate'

        return (
          <div key={group.group} className="rounded-lg border border-gray-100">
            <label className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 rounded-t-lg cursor-pointer">
              <Checkbox
                checked={groupState}
                onCheckedChange={checked => setGroup(keys, checked === true)}
              />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex-1">
                {group.group}
              </span>
              <span className="text-[11px] text-gray-400">{selectedCount}/{keys.length}</span>
            </label>
            <div className="divide-y divide-gray-50">
              {group.permissions.map(perm => (
                <label
                  key={perm.key}
                  className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 ${isDisabled(perm.key) ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(perm.key)}
                    disabled={isDisabled(perm.key)}
                    onCheckedChange={checked => setKey(perm.key, checked === true)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 leading-tight">{perm.label}</p>
                    {perm.description && (
                      <p className="text-xs text-gray-400 leading-tight mt-0.5">{perm.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Read-only grouped display of the permissions an admin currently holds. Only
 * groups with at least one granted permission are shown. Use for a "view
 * permissions" surface where editing isn't intended.
 */
export function GrantedPermissions({ value }: { value: Permission[] }) {
  const granted = new Set(value)

  if (granted.size === 0) {
    return <p className="text-sm text-gray-400">This admin has no permissions assigned.</p>
  }

  const groupsWithGrants = PERMISSION_GROUPS
    .map(group => ({ group: group.group, perms: group.permissions.filter(p => granted.has(p.key)) }))
    .filter(g => g.perms.length > 0)

  return (
    <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
      {groupsWithGrants.map(({ group, perms }) => (
        <div key={group}>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{group}</p>
          <div className="flex flex-wrap gap-1.5">
            {perms.map(p => (
              <span
                key={p.key}
                className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"
              >
                {PERMISSION_LABELS[p.key] ?? p.key}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
