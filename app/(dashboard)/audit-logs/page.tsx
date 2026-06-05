'use client'

import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getAuditLogs, listAdmins, type AuditLogEntry, type AdminAccount } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'document.approved':  { label: 'Document Approved',  color: 'bg-emerald-100 text-emerald-700' },
  'document.rejected':  { label: 'Document Rejected',  color: 'bg-red-100 text-red-700' },
  'user_suspended':     { label: 'User Suspended',     color: 'bg-amber-100 text-amber-700' },
  'user_banned':        { label: 'User Banned',        color: 'bg-red-100 text-red-700' },
  'user_reinstated':    { label: 'User Reinstated',    color: 'bg-emerald-100 text-emerald-700' },
  'user_updated':       { label: 'User Updated',       color: 'bg-blue-100 text-blue-700' },
  'admin_created':      { label: 'Admin Created',      color: 'bg-purple-100 text-purple-700' },
  'admin_deactivated':  { label: 'Admin Deactivated',  color: 'bg-gray-100 text-gray-600' },
  'admin_reactivated':  { label: 'Admin Reactivated',  color: 'bg-emerald-100 text-emerald-700' },
  'admin_role_changed': { label: 'Role Changed',       color: 'bg-blue-100 text-blue-700' },
  'admin_permissions_changed': { label: 'Permissions Changed', color: 'bg-blue-100 text-blue-700' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_LABELS[action]
  if (meta) {
    return (
      <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
        {meta.label}
      </span>
    )
  }
  const formatted = action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      {formatted}
    </span>
  )
}

function DetailsCell({ entry }: { entry: AuditLogEntry }) {
  const d = entry.details
  if (!d) return <span className="text-gray-300">—</span>
  const parts: string[] = []
  if (d.documentType) parts.push(String(d.documentType).replace(/_/g, ' '))
  if (d.providerType) parts.push(String(d.providerType))
  if (d.reason && d.reason !== 'Approved.' && d.reason !== 'Rejected.') parts.push(`"${d.reason}"`)
  if (parts.length === 0) parts.push(JSON.stringify(d))
  return <span className="text-sm text-gray-500 capitalize">{parts.join(' · ')}</span>
}

const LIMIT = 20

export default function AuditLogsPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [filterAdmin, setFilterAdmin] = useState('all')
  const [filterAction, setFilterAction] = useState('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    listAdmins().then(setAdmins).catch(() => {})
  }, [])

  const load = useCallback(async (p = page) => {
    setLoading(true)
    setError('')
    try {
      const res = await getAuditLogs({
        page: p,
        limit: LIMIT,
        adminId: filterAdmin !== 'all' ? filterAdmin : undefined,
        action: filterAction !== 'all' ? filterAction : undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      })
      setEntries(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setPage(p)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load audit logs.')
    } finally {
      setLoading(false)
    }
  }, [page, filterAdmin, filterAction, filterFrom, filterTo])

  useEffect(() => { load(1) }, [filterAdmin, filterAction, filterFrom, filterTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(page) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = search
    ? entries.filter(e =>
        e.admin.fullName.toLowerCase().includes(search.toLowerCase()) ||
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        e.targetType.toLowerCase().includes(search.toLowerCase())
      )
    : entries

  return (
    <PageGuard permission="view_audit_logs">
      <div>
        <PageHeader
          title="Audit Logs"
          subtitle="Monitor all admin actions across the platform"
          actions={
            <Button variant="outline" size="sm" onClick={() => load(page)} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search admin, action…"
              className="pl-9 w-56"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <Select value={filterAdmin} onValueChange={v => setFilterAdmin(v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All admins" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All admins</SelectItem>
              {admins.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterAction} onValueChange={v => setFilterAction(v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-36 text-sm"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              title="From date"
            />
            <span className="text-gray-400 text-sm">to</span>
            <Input
              type="date"
              className="w-36 text-sm"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              title="To date"
            />
          </div>

          <div className="ml-auto text-sm text-gray-400">{total} entries</div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                    No audit log entries found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(entry => (
                  <TableRow key={entry.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-slate-700 text-white text-[10px] font-bold">
                            {initials(entry.admin.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{entry.admin.fullName}</p>
                          <p className="text-xs text-gray-400 truncate">{entry.admin.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={entry.action} />
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p className="capitalize font-medium text-gray-700">{entry.targetType.replace(/_/g, ' ')}</p>
                        <p className="font-mono text-[10px] text-gray-300 truncate max-w-[120px]" title={entry.targetId}>
                          {entry.targetId.slice(0, 8)}…
                        </p>
                      </div>
                    </TableCell>
                    <TableCell><DetailsCell entry={entry} /></TableCell>
                    <TableCell className="text-xs text-gray-400 font-mono">
                      {entry.ipAddress ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-400">
              Page {page} of {totalPages} · {total} total entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1)}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => load(page + 1)}
                className="gap-1"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  )
}
