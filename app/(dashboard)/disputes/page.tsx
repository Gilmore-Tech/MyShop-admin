'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { Search, CheckCircle, XCircle, RefreshCw, Scale } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { getDisputes, resolveDispute, type Dispute } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

function formatGhs(pesewas: number | null) {
 if (pesewas == null) return'—'
 return `GHS ${(pesewas / 100).toFixed(2)}`
}

function formatDate(iso: string) {
 return new Date(iso).toLocaleString('en-GB', {
 day:'2-digit', month:'short', year:'numeric',
 hour:'2-digit', minute:'2-digit',
 })
}

type ResolveAction='approved' |'denied'

export default function DisputesPage() {
 const searchParams = useSearchParams()
 const [items, setItems] = useState<Dispute[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
 const [statusFilter, setStatusFilter] = useState('all')
 const [resolveDialog, setResolveDialog] = useState<{ dispute: Dispute; action: ResolveAction } | null>(null)
 const [reason, setReason] = useState('')
 const [refundAmount, setRefundAmount] = useState('')
 const [submitting, setSubmitting] = useState(false)
 const [submitError, setSubmitError] = useState('')

 const load = useCallback(async () => {
 setLoading(true)
 setError('')
 try {
 const data = await getDisputes()
 setItems(data)
 } catch (err) {
 setError(err instanceof ApiError ? err.message :'Failed to load disputes.')
 } finally {
 setLoading(false)
 }
 }, [])

 useEffect(() => { load() }, [load])
 useAutoRefresh(load)

 async function handleResolve() {
 if (!resolveDialog) return
 if (reason.trim().length < 20) { setSubmitError('Reason must be at least 20 characters.'); return }
 setSubmitError('')
 setSubmitting(true)
 try {
 const refundPesewas = resolveDialog.action ==='approved' && refundAmount
 ? Math.round(parseFloat(refundAmount) * 100)
 : undefined
 await resolveDispute(resolveDialog.dispute.id, resolveDialog.action, reason.trim(), refundPesewas)
 setResolveDialog(null)
 setReason('')
 setRefundAmount('')
 await load()
 } catch (err) {
 setSubmitError(err instanceof ApiError ? err.message :'Failed to resolve dispute.')
 } finally {
 setSubmitting(false)
 }
 }

 const filtered = items.filter(d => {
 const matchSearch =
 d.id.toLowerCase().includes(search.toLowerCase()) ||
 (d.clientName ??'').toLowerCase().includes(search.toLowerCase()) ||
 (d.providerName ??'').toLowerCase().includes(search.toLowerCase()) ||
 (d.description ??'').toLowerCase().includes(search.toLowerCase())
 const matchStatus = statusFilter ==='all' || d.status === statusFilter
 return matchSearch && matchStatus
 })

 const openCount = items.filter(d => d.status ==='open').length
 const underReviewCount = items.filter(d => d.status ==='under_review').length

 return (
  <PageGuard permission="view_disputes">
 <div>
 <PageHeader
 title="Disputes & Refunds"
 subtitle="Manage platform disputes and refund decisions"
 actions={
 <div className="flex items-center gap-3">
 <div className="flex items-center gap-3 text-sm text-gray-500 bg-white rounded-lg px-3 py-1.5">
 <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{openCount} Open</span>
 <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{underReviewCount} In Review</span>
 </div>
 <Button variant="outline" size="sm" onClick={load} className="gap-2">
 <RefreshCw className="h-3.5 w-3.5" /> Refresh
 </Button>
 </div>
 }
 />

 <div className="mb-4 text-xs text-gray-500 bg-amber-50 rounded-lg px-4 py-2.5 flex items-center gap-2">
 <span className="text-amber-600 font-semibold">⏱ Rule:</span>
 Disputes must be raised within <strong>2 hours</strong> of ride/job completion. Only the disputed amount is frozen — other provider earnings remain accessible.
 </div>

 <div className="flex items-center gap-3 mb-4 flex-wrap">
 <div className="relative flex-1 min-w-48 max-w-sm">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
 <Input placeholder="Search by ID, client, provider…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
 </div>
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
 <SelectContent>
 <SelectItem value="all">All Statuses</SelectItem>
 <SelectItem value="open">Open</SelectItem>
 <SelectItem value="under_review">Under Review</SelectItem>
 <SelectItem value="resolved">Resolved</SelectItem>
 </SelectContent>
 </Select>
 <div className="ml-auto text-sm text-gray-400">{filtered.length} disputes</div>
 </div>

 {error && (
 <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
 )}

 <div className="bg-white rounded-xl shadow-sm overflow-hidden">
 <Table>
 <TableHeader>
 <TableRow className="bg-gray-50">
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispute ID</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Raised</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Provider</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Amount</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
 <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {loading ? (
 Array.from({ length: 5 }).map((_, i) => (
 <TableRow key={i}>
 {Array.from({ length: 9 }).map((_, j) => (
 <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
 ))}
 </TableRow>
 ))
 ) : filtered.length === 0 ? (
 <TableRow>
 <TableCell colSpan={9} className="text-center py-12 text-gray-400">
 <Scale className="h-8 w-8 mx-auto mb-2 text-gray-200" />
 {search || statusFilter !=='all' ?'No results match your filters.' :'No disputes found.'}
 </TableCell>
 </TableRow>
 ) : (
 filtered.map(d => (
 <TableRow key={d.id} className="hover:bg-gray-50">
 <TableCell className="font-mono text-sm font-semibold text-orange-600">{d.id.slice(0, 8)}…</TableCell>
 <TableCell className="text-sm text-gray-500 whitespace-nowrap">{formatDate(d.createdAt)}</TableCell>
 <TableCell>
 <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${d.type ==='ride' ?'bg-blue-100 text-blue-700' :'bg-purple-100 text-purple-700'}`}>
 {d.type}
 </span>
 </TableCell>
 <TableCell className="text-sm">{d.clientName ?? <span className="text-gray-400 italic">—</span>}</TableCell>
 <TableCell className="text-sm">{d.providerName ?? <span className="text-gray-400 italic">—</span>}</TableCell>
 <TableCell className="text-sm text-gray-500 max-w-48 truncate">{d.description ??'—'}</TableCell>
 <TableCell className="text-right text-sm font-medium">{formatGhs(d.amountPesewas)}</TableCell>
 <TableCell><StatusBadge status={d.status} /></TableCell>
 <TableCell>
 {(d.status ==='open' || d.status ==='under_review') && (
 <div className="flex items-center gap-1.5 justify-end">
 <Button
 size="sm"
 className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
 onClick={() => { setResolveDialog({ dispute: d, action:'approved' }); setReason(''); setRefundAmount(''); setSubmitError('') }}
 >
 <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="text-xs h-7 text-red-600 hover:bg-red-50"
 onClick={() => { setResolveDialog({ dispute: d, action:'denied' }); setReason(''); setRefundAmount(''); setSubmitError('') }}
 >
 <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
 </Button>
 </div>
 )}
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
 <p className="text-xs text-gray-400">
 {loading ?'Loading…' : `Showing ${filtered.length} of ${items.length} disputes`}
 </p>
 </div>
 </div>

 {/* Resolve Dialog */}
 <Dialog open={!!resolveDialog} onOpenChange={open => { if (!open) setResolveDialog(null) }}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>
 {resolveDialog?.action ==='approved' ?'Approve Refund' :'Deny Dispute'} — {resolveDialog?.dispute.id.slice(0, 8)}…
 </DialogTitle>
 </DialogHeader>
 <div className="space-y-4 py-2">
 {resolveDialog?.action ==='approved' && (
 <div className="space-y-1.5">
 <Label>Refund amount (GHS) <span className="text-gray-400 text-xs">— leave blank for full refund</span></Label>
 <Input
 type="number"
 min="0"
 step="0.01"
 placeholder={resolveDialog.dispute.amountPesewas != null
 ? `Max: GHS ${(resolveDialog.dispute.amountPesewas / 100).toFixed(2)}`
 :'Enter amount'}
 value={refundAmount}
 onChange={e => setRefundAmount(e.target.value)}
 />
 </div>
 )}
 <div className="space-y-1.5">
 <Label>Resolution note <span className="text-gray-400 text-xs">(min. 20 characters)</span></Label>
 <Textarea
 placeholder="Describe the resolution decision and reasoning…"
 rows={4}
 value={reason}
 onChange={e => setReason(e.target.value)}
 />
 <p className={`text-xs ${reason.length >= 20 ?'text-emerald-600' :'text-gray-400'}`}>
 {reason.length}/20 characters minimum
 </p>
 </div>
 {submitError && <p className="text-xs text-red-600">{submitError}</p>}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancel</Button>
 <Button
 disabled={reason.length < 20 || submitting}
 onClick={handleResolve}
 className={resolveDialog?.action ==='approved'
 ?'bg-emerald-600 hover:bg-emerald-700 text-white'
 :'bg-red-600 hover:bg-red-700 text-white'}
 >
 {submitting ?'Submitting…' : resolveDialog?.action ==='approved' ?'Confirm Approval' :'Confirm Denial'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
  </PageGuard>
 )
}
