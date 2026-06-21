'use client'

import { AccessDenied } from '@/components/common/access-denied'
import { useRole } from '@/hooks/use-role'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, MoreHorizontal, Shield, Clock, RefreshCw, KeyRound, Trash2, UserCheck, UserX, Eye, Pencil } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { PermissionPicker, GrantedPermissions } from '@/components/admin/permission-picker'
import {
 listAdmins, createAdmin, updateAdminPermissions, deactivateAdmin,
 reactivateAdmin, resetAdminPassword, deleteAdmin,
 type AdminAccount,
} from '@/lib/api'
import { ApiError, getAdminUser } from '@/lib/api-client'
import { PERMISSION_LABELS, type Permission } from '@/lib/roles'

function initials(name: string) {
 return name.split('').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string | null) {
 if (!iso) return'-'
 return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

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
 | { type:'delete'; admin: AdminAccount }

export default function AdminAccountsPage() {
 const [admins, setAdmins] = useState<AdminAccount[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [search, setSearch] = useState('')
 const [dialog, setDialog] = useState<DialogMode | null>(null)
 const [deleteConfirm, setDeleteConfirm] = useState('')
 const [submitting, setSubmitting] = useState(false)
 const [submitError, setSubmitError] = useState('')

 // ── Create form state
 const [newEmail, setNewEmail] = useState('')
 const [newFullName, setNewFullName] = useState('')
 const [newPassword, setNewPassword] = useState('')
 const [newRegion, setNewRegion] = useState('')
 const [newPermissions, setNewPermissions] = useState<Permission[]>(['view_dashboard'])

 // ── Permission edit state
 const [editPermissions, setEditPermissions] = useState<Permission[]>([])

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
 const data = await listAdmins()
 setAdmins(data)
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
 setEditPermissions(mode.admin.permissions ?? [])
 }
 if (mode.type ==='create') {
 setNewEmail(''); setNewFullName('')
 setNewPassword(''); setNewRegion(''); setNewPermissions(['view_dashboard'])
 }
 if (mode.type ==='reset-password') {
 setNewPw(''); setConfirmPw('')
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
 await createAdmin({ email: newEmail.trim(), fullName: newFullName.trim(), permissions: newPermissions, password: newPassword, regionScope: newRegion || undefined })
 } else if (dialog.type ==='permissions') {
 await updateAdminPermissions(dialog.admin.id, editPermissions)
 } else if (dialog.type ==='reset-password') {
 if (newPw.length < 8) { setSubmitError('Password must be at least 8 characters.'); setSubmitting(false); return }
 if (newPw !== confirmPw) { setSubmitError('Passwords do not match.'); setSubmitting(false); return }
 await resetAdminPassword(dialog.admin.id, newPw)
 } else if (dialog.type ==='delete') {
 await deleteAdmin(dialog.admin.id)
 }
 setDialog(null)
 await load()
 } catch (err) {
 setSubmitError(err instanceof ApiError ? err.message :'Action failed.')
 } finally {
 setSubmitting(false)
 }
 }

 async function toggleActive(admin: AdminAccount) {
 try {
 if (admin.isActive) await deactivateAdmin(admin.id)
 else await reactivateAdmin(admin.id)
 await load()
 } catch (err) {
 setError(err instanceof ApiError ? err.message :'Action failed.')
 }
 }

 const filtered = admins.filter(a =>
 a.fullName.toLowerCase().includes(search.toLowerCase()) ||
 a.email.toLowerCase().includes(search.toLowerCase())
 )

 // permissions is null on first SSR render — wait until hydration resolves
 // before deciding access, otherwise the root admin briefly sees AccessDenied.
 if (permissions === null) return null
 if (!isSuperAdmin) return <AccessDenied />

 return (
 <div>
 <PageHeader
 title="Admin Accounts"
 subtitle="Only the root admin can create accounts and assign permissions"
 actions={
 <Button onClick={() => openDialog({ type:'create' })} className="gap-2 text-white" style={{ backgroundColor:'#F5A623' }}>
 <Plus className="h-4 w-4" /> Create Admin
 </Button>
 }
 />

 <Tabs defaultValue="accounts">
 <TabsList className="bg-white mb-6">
 <TabsTrigger value="accounts">Admin Accounts</TabsTrigger>
 </TabsList>

 <TabsContent value="accounts">
 <div className="flex items-center gap-3 mb-4">
 <div className="relative flex-1 max-w-sm">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
 <Input placeholder="Search by name or email…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
 </div>
 <Button variant="outline" size="sm" onClick={load} className="gap-2">
 <RefreshCw className="h-3.5 w-3.5" /> Refresh
 </Button>
 <div className="ml-auto text-sm text-gray-400">{filtered.length} admins</div>
 </div>

 {error && (
 <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
 )}

 <div className="bg-white rounded-xl shadow-sm overflow-hidden">
 <Table>
 <TableHeader>
 <TableRow className="bg-gray-50">
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Permissions</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Region</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Login</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</TableHead>
 <TableHead className="w-10" />
 </TableRow>
 </TableHeader>
 <TableBody>
 {loading ? (
 Array.from({ length: 5 }).map((_, i) => (
 <TableRow key={i}>
 {Array.from({ length: 7 }).map((_, j) => (
 <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
 ))}
 </TableRow>
 ))
 ) : filtered.length === 0 ? (
 <TableRow>
 <TableCell colSpan={7} className="text-center py-12 text-gray-400">
 {search ?'No admins match your search.' :'No admin accounts found.'}
 </TableCell>
 </TableRow>
 ) : (
 filtered.map(admin => (
 <TableRow key={admin.id} className="hover:bg-gray-50">
 <TableCell>
 <div className="flex items-center gap-3">
 <Avatar className="h-8 w-8">
 <AvatarFallback className="bg-slate-700 text-white text-xs font-bold">
 {initials(admin.fullName)}
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="font-medium text-sm text-gray-900">{admin.fullName}</p>
 <p className="text-xs text-gray-400">{admin.email}</p>
 </div>
 </div>
 </TableCell>
 <TableCell>
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
 </TableCell>
 <TableCell className="text-sm text-gray-500">{admin.regionScope ??'-'}</TableCell>
 <TableCell>
 <StatusBadge status={admin.isActive ?'active' :'suspended'} />
 </TableCell>
 <TableCell className="text-sm text-gray-500">
 <div className="flex items-center gap-1">
 <Clock className="h-3.5 w-3.5 text-gray-300" />
 {formatDate(admin.lastLoginAt)}
 </div>
 </TableCell>
 <TableCell className="text-sm text-gray-500">{formatDate(admin.createdAt)}</TableCell>
 <TableCell>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="icon" className="h-8 w-8">
 <MoreHorizontal className="h-4 w-4" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end">
 <DropdownMenuItem className="gap-2" onClick={() => openDialog({ type:'view', admin })}>
 <Eye className="h-4 w-4" /> View Permissions
 </DropdownMenuItem>
 <DropdownMenuItem className="gap-2" onClick={() => openDialog({ type:'permissions', admin })}>
 <Shield className="h-4 w-4" /> Edit Permissions
 </DropdownMenuItem>
 <DropdownMenuItem className="gap-2" onClick={() => openDialog({ type:'reset-password', admin })}>
 <KeyRound className="h-4 w-4" /> Reset Password
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 {admin.isActive ? (
 <DropdownMenuItem className="gap-2 text-orange-600" onClick={() => toggleActive(admin)}>
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
 </DropdownMenuContent>
 </DropdownMenu>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </TabsContent>
 </Tabs>

 {/* ── Create Admin Dialog ──────────────────────────────────────────────── */}
 <Dialog open={dialog?.type ==='create'} onOpenChange={open => { if (!open) setDialog(null) }}>
 <DialogContent className="max-w-md">
 <DialogHeader><DialogTitle>Create Admin Account</DialogTitle></DialogHeader>
 <div className="space-y-4 py-2">
 <div className="space-y-1.5">
 <Label>Full Name</Label>
 <Input placeholder="Kwame Mensah" value={newFullName} onChange={e => setNewFullName(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>Email</Label>
 <Input type="email" placeholder="kwame@myshop.com.gh" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>Password</Label>
 <Input type="password" placeholder="Min 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>Region Scope <span className="text-gray-400 text-xs">(optional)</span></Label>
 <Input placeholder="e.g. Ashanti - limits this admin's data to one region" value={newRegion} onChange={e => setNewRegion(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>Permissions</Label>
 <PermissionPicker value={newPermissions} onChange={setNewPermissions} excludeKeys={['manage_admins']} />
 </div>
 {submitError && <p className="text-xs text-red-600">{submitError}</p>}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
 <Button disabled={submitting} onClick={handleSubmit} className="text-white" style={{ backgroundColor:'#F5A623' }}>
 {submitting ?'Creating…' :'Create Admin'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

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
 <Button
 onClick={() => { if (dialog?.type ==='view') openDialog({ type:'permissions', admin: dialog.admin }) }}
 className="gap-2 text-white"
 style={{ backgroundColor:'#F5A623' }}
 >
 <Pencil className="h-4 w-4" /> Edit Permissions
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ── Edit Permissions Dialog ──────────────────────────────────────────── */}
 <Dialog open={dialog?.type ==='permissions'} onOpenChange={open => { if (!open) setDialog(null) }}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle>Edit Permissions - {dialog?.type ==='permissions' ? dialog.admin.fullName :''}</DialogTitle>
 </DialogHeader>
 <div className="space-y-3 py-2">
 {dialog?.type ==='permissions' && dialog.admin.id === currentAdminId && (
 <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
 You can&apos;t remove your own <strong>Manage admins</strong> permission.
 </p>
 )}
 <p className="text-xs text-gray-400">
 Changes take effect on this admin&apos;s next sign-in.
 </p>
 <PermissionPicker
 value={editPermissions}
 onChange={setEditPermissions}
 excludeKeys={['manage_admins']}
 disabledKeys={dialog?.type ==='permissions' && dialog.admin.id === currentAdminId ? ['manage_admins'] : []}
 />
 {submitError && <p className="text-xs text-red-600">{submitError}</p>}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
 <Button disabled={submitting} onClick={handleSubmit} className="text-white" style={{ backgroundColor:'#F5A623' }}>
 {submitting ?'Saving…' :'Save Changes'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ── Reset Password Dialog ────────────────────────────────────────────── */}
 <Dialog open={dialog?.type ==='reset-password'} onOpenChange={open => { if (!open) setDialog(null) }}>
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle>Reset Password - {dialog?.type ==='reset-password' ? dialog.admin.fullName :''}</DialogTitle>
 </DialogHeader>
 <div className="space-y-4 py-2">
 <div className="space-y-1.5">
 <Label>New Password</Label>
 <Input type="password" placeholder="Min 8 characters" value={newPw} onChange={e => setNewPw(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>Confirm Password</Label>
 <Input type="password" placeholder="Repeat password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
 </div>
 {submitError && <p className="text-xs text-red-600">{submitError}</p>}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
 <Button disabled={submitting} onClick={handleSubmit} className="text-white" style={{ backgroundColor:'#F5A623' }}>
 {submitting ?'Resetting…' :'Reset Password'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ── Delete Confirm Dialog ────────────────────────────────────────────── */}
 <Dialog open={dialog?.type ==='delete'} onOpenChange={open => { if (!open) setDialog(null) }}>
 <DialogContent className="max-w-sm">
 <DialogHeader><DialogTitle>Delete Admin Account</DialogTitle></DialogHeader>
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
 className="bg-red-600 hover:bg-red-700 text-white"
 >
 {submitting ?'Deleting…' :'Confirm Delete'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 )
}
