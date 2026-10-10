'use client'

import { AccessDenied } from '@/components/common/access-denied'
import { useRole } from '@/hooks/use-role'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Shield, Clock, KeyRound, Trash2, UserCheck, UserX, Eye, Pencil } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { DataTable, AvatarCell, type DataTableColumn } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { StatusBadge } from '@/components/common/status-badge'
import { PermissionPicker, GrantedPermissions } from '@/components/admin/permission-picker'
import {
 listAdmins, createAdmin, updateAdminPermissions, deactivateAdmin,
 reactivateAdmin, resetAdminPassword, deleteAdmin, listRegions,
 listAdminRolePolicies, updateAdminRolePolicy,
 type AdminAccount, type AdminRolePolicy, type Region,
} from '@/lib/api'
import { ApiError, getAdminUser } from '@/lib/api-client'
import {
 PERMISSION_LABELS, ROLE_DEFINITIONS, ROLE_ORDER, roleLabel,
 type Permission, type Role,
} from '@/lib/roles'
import { formatDateTime } from '@/lib/format-date'

// Compact summary of a permission set for the table cell: first couple of
// labels plus an overflow count.
function permissionSummary(perms: Permission[]): string {
 if (!perms || perms.length === 0) return 'No permissions'
 const labels = perms.map(p => PERMISSION_LABELS[p] ?? p)
 const shown = labels.slice(0, 2).join(', ')
 const extra = labels.length - 2
 return extra > 0 ? `${shown} +${extra}` : shown
}

type DialogMode =
 | { type:'create' }
 | { type:'view'; admin: AdminAccount }
 | { type:'permissions'; admin: AdminAccount }
 | { type:'reset-password'; admin: AdminAccount }
 | { type:'deactivate'; admin: AdminAccount }
 | { type:'delete'; admin: AdminAccount }
 | { type:'role-policy'; policy: AdminRolePolicy }

export default function AdminAccountsPage() {
 const [admins, setAdmins] = useState<AdminAccount[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [actionError, setActionError] = useState('')
 const [search, setSearch] = useState('')
 const [dialog, setDialog] = useState<DialogMode | null>(null)
 const [deleteConfirm, setDeleteConfirm] = useState('')
 const [submitting, setSubmitting] = useState(false)
 const [submitError, setSubmitError] = useState('')

 // ── Create form state
 const [newEmail, setNewEmail] = useState('')
 const [newFullName, setNewFullName] = useState('')
 const [newPassword, setNewPassword] = useState('')
 const [newRoles, setNewRoles] = useState<Role[]>(['admin'])
 const [newRegionId, setNewRegionId] = useState('')

 // ── Role assignment state
 const [editRoles, setEditRoles] = useState<Role[]>([])
 const [editRegionId, setEditRegionId] = useState('')
 const [rolePolicies, setRolePolicies] = useState<AdminRolePolicy[]>([])
 const [policyPermissions, setPolicyPermissions] = useState<Permission[]>([])
 const [policyReason, setPolicyReason] = useState('')

 // ── Regions (for the scope picker)
 const [regions, setRegions] = useState<Region[]>([])
 useEffect(() => { listRegions().then(setRegions).catch(() => setRegions([])) }, [])

 const currentAdminId = getAdminUser()?.id ?? null
 // Only the single root admin (is_super_admin) may manage admin accounts.
 const { isSuperAdmin, permissions } = useRole()

 // ── Reset password state
 const [newPw, setNewPw] = useState('')
 const [confirmPw, setConfirmPw] = useState('')

 const load = useCallback(async () => {
 setLoading(true)
 setError('')
 try {
 const [data, policies] = await Promise.all([listAdmins(), listAdminRolePolicies()])
 setAdmins(data)
 setRolePolicies(policies)
 } catch (err) {
 setError(err instanceof ApiError ? err.message :'Failed to load admin accounts.')
 } finally {
 setLoading(false)
 }
 }, [])

 useEffect(() => { load() }, [load])

 function openDialog(mode: DialogMode) {
 setSubmitError('')
 if (mode.type ==='delete') {
 setDeleteConfirm('')
 }
 if (mode.type ==='permissions') {
 setEditRoles(mode.admin.roles?.length ? mode.admin.roles : mode.admin.role ? [mode.admin.role] : [])
 setEditRegionId(mode.admin.regionId ?? '')
 }
 if (mode.type ==='create') {
 setNewEmail(''); setNewFullName('')
 setNewPassword(''); setNewRoles(['admin']); setNewRegionId('')
 }
 if (mode.type ==='reset-password') {
 setNewPw(''); setConfirmPw('')
 }
 if (mode.type === 'role-policy') {
 setPolicyPermissions(mode.policy.permissions)
 setPolicyReason('')
 }
 setDialog(mode)
 }

 async function handleSubmit() {
 if (!dialog) return
 setSubmitError('')
 setSubmitting(true)
 try {
 if (dialog.type ==='create') {
 if (!newEmail || !newFullName || !newPassword)
 { setSubmitError('Email, full name and password are required.'); setSubmitting(false); return }
 if (newRoles.length === 0)
 { setSubmitError('Select at least one role.'); setSubmitting(false); return }
 const needsRegion = newRoles.every(role => ROLE_DEFINITIONS[role].requiresRegion)
 if (needsRegion && !newRegionId)
 { setSubmitError('Select the region shared by these roles.'); setSubmitting(false); return }
 await createAdmin({
 email: newEmail.trim(), fullName: newFullName.trim(), password: newPassword,
 roles: newRoles as Exclude<Role, 'super_admin'>[],
 regionId: needsRegion ? newRegionId : undefined,
 })
 } else if (dialog.type ==='permissions') {
 if (editRoles.length === 0)
 { setSubmitError('Select at least one role.'); setSubmitting(false); return }
 const needsRegion = editRoles.every(role => ROLE_DEFINITIONS[role].requiresRegion)
 if (needsRegion && !editRegionId)
 { setSubmitError('Select the region shared by these roles.'); setSubmitting(false); return }
 await updateAdminPermissions(dialog.admin.id, {
 roles: editRoles as Exclude<Role, 'super_admin'>[],
 regionId: needsRegion ? editRegionId : undefined,
 })
 } else if (dialog.type ==='reset-password') {
 if (newPw.length < 8) { setSubmitError('Password must be at least 8 characters.'); setSubmitting(false); return }
 if (newPw !== confirmPw) { setSubmitError('Passwords do not match.'); setSubmitting(false); return }
 await resetAdminPassword(dialog.admin.id, newPw)
 } else if (dialog.type ==='deactivate') {
 await deactivateAdmin(dialog.admin.id)
 } else if (dialog.type ==='delete') {
 await deleteAdmin(dialog.admin.id)
 } else if (dialog.type === 'role-policy') {
 if (policyReason.trim().length < 10)
 { setSubmitError('Enter an audit reason of at least 10 characters.'); setSubmitting(false); return }
 await updateAdminRolePolicy(dialog.policy.role, policyPermissions, policyReason.trim())
 }
 setDialog(null)
 await load()
 } catch (err) {
 setSubmitError(err instanceof ApiError ? err.message :'Action failed.')
 } finally {
 setSubmitting(false)
 }
 }

 function toggleRole(roles: Role[], role: Role, apply: (next: Role[]) => void) {
 const next = roles.includes(role) ? roles.filter(item => item !== role) : [...roles, role]
 apply(next)
 if (next.some(item => !ROLE_DEFINITIONS[item].requiresRegion)) {
 if (apply === setNewRoles) setNewRegionId('')
 if (apply === setEditRoles) setEditRegionId('')
 }
 }

 async function toggleActive(admin: AdminAccount) {
 setActionError('')
 try {
 if (admin.isActive) await deactivateAdmin(admin.id)
 else await reactivateAdmin(admin.id)
 await load()
 } catch (err) {
 setActionError(err instanceof ApiError ? err.message :'Action failed.')
 }
 }

 const filtered = admins.filter(a =>
 a.fullName.toLowerCase().includes(search.toLowerCase()) ||
 a.email.toLowerCase().includes(search.toLowerCase())
 )

 // permissions is null on first SSR render - wait until hydration resolves
 // before deciding access, otherwise the root admin briefly sees AccessDenied.
 if (permissions === null) return null
 if (!isSuperAdmin) return <AccessDenied />

 const columns: DataTableColumn<AdminAccount>[] = [
 {
 key: 'admin', header: 'Admin',
 render: admin => <AvatarCell name={admin.fullName} sub={admin.email} />,
 },
 { key: 'role', header: 'Roles', className: 'whitespace-normal', render: admin => (
 <div className="flex flex-wrap gap-1">
 {(admin.roles?.length ? admin.roles : admin.role ? [admin.role] : []).map(role => (
 <span key={role} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{roleLabel(role)}</span>
 ))}
 </div>
 ) },
 {
 key: 'scope', header: 'Scope', className: 'whitespace-normal',
 render: admin => (
 <span className="text-sm text-gray-500">
 {admin.region?.name ?? admin.regionScope ?? 'All regions'}
 {admin.categoryScope ? ` - ${admin.categoryScope === 'rides' ? 'Rides' : 'Artisan'}` : ''}
 </span>
 ),
 },
 {
 key: 'permissions', header: 'Permissions', className: 'whitespace-normal',
 render: admin => (
 <button
 type="button"
 onClick={() => openDialog({ type:'view', admin })}
 className="flex items-center gap-1.5 text-left group"
 title="View all permissions"
 >
 <Shield className="h-3.5 w-3.5 text-gray-600 shrink-0" />
 <span className="text-xs text-gray-600 group-hover:text-orange-600 group-hover:underline">
 {permissionSummary(admin.permissions)}
 </span>
 </button>
 ),
 },
 { key: 'status', header: 'Status', render: admin => <StatusBadge status={admin.isActive ? 'active' : 'suspended'} /> },
 {
 key: 'lastLogin', header: 'Last login',
 render: admin => (
 <span className="inline-flex items-center gap-1 text-sm text-gray-500">
 <Clock className="h-3.5 w-3.5 text-gray-300" />
 {formatDateTime(admin.lastLoginAt)}
 </span>
 ),
 },
 { key: 'created', header: 'Created', render: admin => <span className="text-sm text-gray-500">{formatDateTime(admin.createdAt)}</span> },
 ]

 return (
 <div>
 <PageHeader
 title="Admin accounts"
 subtitle="Only the Super Administrator can assign role tags and edit role access"
 actions={
 <Button onClick={() => openDialog({ type:'create' })} variant="brand" className="gap-2">
 <Plus className="h-4 w-4" /> Create admin
 </Button>
 }
 />

 <Tabs defaultValue="accounts">
 <TabsList className="bg-white mb-6">
 <TabsTrigger value="accounts">Admin accounts</TabsTrigger>
 <TabsTrigger value="roles">Role permissions</TabsTrigger>
 </TabsList>

 <TabsContent value="accounts">
 {actionError && (
 <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
 )}
 <FilterBar
 onRefresh={load}
 refreshing={loading}
 meta={<span className="text-sm text-gray-400">{filtered.length} admin{filtered.length !== 1 ? 's' : ''}</span>}
 >
 <FilterSearch value={search} onChange={setSearch} placeholder="Search by name or email" />
 </FilterBar>

 <DataTable
 columns={columns}
 rows={filtered}
 rowKey={admin => admin.id}
 loading={loading}
 error={error || null}
 onRetry={load}
 empty={<EmptyState title={search ? 'No admins match your search' : 'No admin accounts found'} />}
 rowMenu={admin => (
 <>
 <DropdownMenuItem className="gap-2" onClick={() => openDialog({ type:'view', admin })}>
 <Eye className="h-4 w-4" /> View permissions
 </DropdownMenuItem>
 {!admin.roles?.includes('super_admin') && admin.id !== currentAdminId && (
 <DropdownMenuItem className="gap-2" onClick={() => openDialog({ type:'permissions', admin })}>
 <Shield className="h-4 w-4" /> Edit role tags
 </DropdownMenuItem>
 )}
 <DropdownMenuItem className="gap-2" onClick={() => openDialog({ type:'reset-password', admin })}>
 <KeyRound className="h-4 w-4" /> Reset password
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 {admin.isActive ? (
 <DropdownMenuItem className="gap-2 text-orange-600" onClick={() => openDialog({ type:'deactivate', admin })}>
 <UserX className="h-4 w-4" /> Deactivate
 </DropdownMenuItem>
 ) : (
 <DropdownMenuItem className="gap-2 text-emerald-600" onClick={() => toggleActive(admin)}>
 <UserCheck className="h-4 w-4" /> Reactivate
 </DropdownMenuItem>
 )}
 <DropdownMenuItem className="gap-2 text-red-600" onClick={() => openDialog({ type:'delete', admin })}>
 <Trash2 className="h-4 w-4" /> Delete
 </DropdownMenuItem>
 </>
 )}
 minWidth={900}
 />
 </TabsContent>

 <TabsContent value="roles">
 <div className="grid gap-4 lg:grid-cols-2">
 {rolePolicies.map(policy => (
 <div key={policy.role} className="rounded-xl border border-gray-200 bg-white p-5">
 <div className="flex items-start justify-between gap-4">
 <div>
 <h3 className="font-semibold text-gray-900">{policy.label}</h3>
 <p className="mt-1 text-xs text-gray-500">{policy.description}</p>
 </div>
 <Button size="sm" variant="outline" onClick={() => openDialog({ type: 'role-policy', policy })}>
 Edit access
 </Button>
 </div>
 <p className="mt-3 text-xs text-gray-500">
 {policy.permissions.length} permissions - {policy.customized ? `reviewed revision ${policy.revision}` : 'default bundle'}
 </p>
 </div>
 ))}
 </div>
 </TabsContent>
 </Tabs>

 {/* ── Create Admin Dialog ──────────────────────────────────────────────── */}
 <FormDialog
 open={dialog?.type === 'create'}
 onClose={() => setDialog(null)}
 title="Create admin account"
 submitLabel="Create admin"
 onSubmit={handleSubmit}
 loading={submitting}
 error={submitError || null}
 >
 <div className="space-y-1.5">
 <Label>Full name</Label>
 <Input placeholder="Kwame Mensah" value={newFullName} onChange={e => setNewFullName(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>Email</Label>
 <Input type="email" placeholder="kwame@gilmoretechnologiesgh.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>Password</Label>
 <Input type="password" placeholder="Min 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
 </div>
 <div className="space-y-2">
 <Label>Role tags</Label>
 <div className="flex flex-wrap gap-2">
 {ROLE_ORDER.map(role => (
 <button key={role} type="button" onClick={() => toggleRole(newRoles, role, setNewRoles)}
 className={`rounded-full border px-3 py-1.5 text-xs ${newRoles.includes(role) ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>
 {ROLE_DEFINITIONS[role].label}
 </button>
 ))}
 </div>
 <p className="text-xs text-gray-400">Access is the union of every selected role.</p>
 </div>
 {newRoles.length > 0 && newRoles.every(role => ROLE_DEFINITIONS[role].requiresRegion) && (
 <div className="space-y-1.5">
 <Label>Region</Label>
 <Select value={newRegionId} onValueChange={setNewRegionId}>
 <SelectTrigger><SelectValue placeholder="Select a region" /></SelectTrigger>
 <SelectContent>
 {regions.map(rg => <SelectItem key={rg.id} value={rg.id}>{rg.name}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 )}
 </FormDialog>

 {/* ── View Permissions Dialog ──────────────────────────────────────────── */}
 <Dialog open={dialog?.type ==='view'} onOpenChange={open => { if (!open) setDialog(null) }}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle>
 Permissions - {dialog?.type ==='view' ? dialog.admin.fullName :''}
 </DialogTitle>
 </DialogHeader>
 <div className="py-2 space-y-3">
 {dialog?.type ==='view' && (
 <>
 <p className="text-xs text-gray-400">
 {dialog.admin.permissions.length} permission{dialog.admin.permissions.length === 1 ?'' :'s'} granted
 {dialog.admin.regionScope ? ` - scoped to ${dialog.admin.regionScope}` :''}
 </p>
 <GrantedPermissions value={dialog.admin.permissions} />
 </>
 )}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
 {dialog?.type === 'view' && !dialog.admin.roles?.includes('super_admin') && dialog.admin.id !== currentAdminId && (
 <Button
 onClick={() => openDialog({ type:'permissions', admin: dialog.admin })}
 variant="brand"
 className="gap-2"
 >
 <Pencil className="h-4 w-4" /> Edit role tags
 </Button>
 )}
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ── Edit Role Tags Dialog ────────────────────────────────────────────── */}
 <FormDialog
 open={dialog?.type === 'permissions'}
 onClose={() => setDialog(null)}
 title={`Edit role tags - ${dialog?.type === 'permissions' ? dialog.admin.fullName : ''}`}
 submitLabel="Save changes"
 onSubmit={handleSubmit}
 loading={submitting}
 error={submitError || null}
 >
 <p className="text-xs text-gray-400">Changes are enforced by the backend on the next request.</p>
 <div className="space-y-2">
 <Label>Role tags</Label>
 <div className="flex flex-wrap gap-2">
 {ROLE_ORDER.map(role => (
 <button key={role} type="button" onClick={() => toggleRole(editRoles, role, setEditRoles)}
 className={`rounded-full border px-3 py-1.5 text-xs ${editRoles.includes(role) ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>
 {ROLE_DEFINITIONS[role].label}
 </button>
 ))}
 </div>
 </div>
 {editRoles.length > 0 && editRoles.every(role => ROLE_DEFINITIONS[role].requiresRegion) && (
 <div className="space-y-1.5">
 <Label>Region</Label>
 <Select value={editRegionId} onValueChange={setEditRegionId}>
 <SelectTrigger><SelectValue placeholder="Select a region" /></SelectTrigger>
 <SelectContent>
 {regions.map(rg => <SelectItem key={rg.id} value={rg.id}>{rg.name}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 )}
 </FormDialog>

 <FormDialog
 open={dialog?.type === 'role-policy'}
 onClose={() => setDialog(null)}
 title={`Edit role access - ${dialog?.type === 'role-policy' ? dialog.policy.label : ''}`}
 submitLabel="Save role access"
 onSubmit={handleSubmit}
 loading={submitting}
 error={submitError || null}
 >
 <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
 This changes access for every administrator carrying this role tag.
 </p>
 <PermissionPicker value={policyPermissions} onChange={setPolicyPermissions} excludeKeys={['manage_admins']} />
 <div className="space-y-1.5">
 <Label>Reason for changing this role</Label>
 <Input value={policyReason} onChange={event => setPolicyReason(event.target.value)} placeholder="Explain why this access bundle is changing" />
 </div>
 </FormDialog>

 {/* ── Reset Password Dialog ────────────────────────────────────────────── */}
 <ConfirmDialog
 open={dialog?.type === 'reset-password'}
 onClose={() => setDialog(null)}
 title={`Reset password for ${dialog?.type === 'reset-password' ? dialog.admin.fullName : 'this admin'}?`}
 description="They will need to sign in with the new password next time."
 confirmLabel="Reset password"
 onConfirm={() => handleSubmit()}
 loading={submitting}
 error={submitError || null}
 >
 <div className="space-y-1.5">
 <Label>New password</Label>
 <Input type="password" placeholder="Min 8 characters" value={newPw} onChange={e => setNewPw(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>Confirm password</Label>
 <Input type="password" placeholder="Repeat password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
 </div>
 </ConfirmDialog>

 {/* ── Deactivate Confirm Dialog ────────────────────────────────────────── */}
 <ConfirmDialog
 open={dialog?.type === 'deactivate'}
 onClose={() => setDialog(null)}
 title={`Deactivate ${dialog?.type === 'deactivate' ? dialog.admin.fullName : 'this admin'}?`}
 description="They will immediately lose access to the admin console. You can reactivate this account later."
 confirmLabel={`Deactivate ${dialog?.type === 'deactivate' ? dialog.admin.fullName : 'admin'}`}
 onConfirm={() => handleSubmit()}
 destructive
 loading={submitting}
 error={submitError || null}
 />

 {/* ── Delete Confirm Dialog ────────────────────────────────────────────── */}
 <Dialog open={dialog?.type ==='delete'} onOpenChange={open => { if (!open) setDialog(null) }}>
 <DialogContent className="max-w-sm">
 <DialogHeader><DialogTitle>Delete admin account</DialogTitle></DialogHeader>
 <div className="py-2 space-y-3">
 <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
 <strong>Warning:</strong> This will permanently remove{' '}
 <strong>{dialog?.type ==='delete' ? dialog.admin.fullName :''}</strong> from the admin team.
 This action cannot be undone.
 </div>
 {dialog?.type ==='delete' && (
 <div className="space-y-1.5">
 <Label className="text-xs text-gray-600">
 Type <strong className="font-mono text-gray-900">{dialog.admin.fullName}</strong> to confirm
 </Label>
 <Input
 value={deleteConfirm}
 onChange={e => setDeleteConfirm(e.target.value)}
 placeholder={dialog.admin.fullName}
 autoComplete="off"
 spellCheck={false}
 />
 </div>
 )}
 {submitError && <p className="text-xs text-red-600">{submitError}</p>}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
 <Button
 disabled={submitting || (dialog?.type ==='delete' && deleteConfirm.trim() !== dialog.admin.fullName)}
 onClick={handleSubmit}
 variant="destructive"
 >
 {submitting ? 'Deleting...' : 'Delete this admin'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 )
}
