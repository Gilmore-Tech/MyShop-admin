'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { SuperAdminPageGuard } from '@/components/common/super-admin-page-guard'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  acknowledgeSystemAuditAlert,
  getSystemAuditAlerts,
  getSystemAuditEvents,
  getSystemAuditSummary,
  getSystemTelemetryEvents,
  setSystemAuditLegalHold,
  type SystemAuditAlert,
  type SystemAuditEvent,
  type SystemAuditFilters,
  type SystemAuditSummary,
  type SystemTelemetryEvent,
  verifySystemAuditIntegrity,
} from '@/lib/api'
import { API_BASE, getToken } from '@/lib/api-client'

const EMPTY_SUMMARY: SystemAuditSummary = {
  total: 0, telemetryTotal: 0, failures: 0, critical: 0, openAlerts: 0, categories: [], timeZone: 'GMT',
}

function gmtTimestamp(value: string): string {
  const date = new Date(value)
  const base = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date)
  return `${base}.${String(date.getUTCMilliseconds()).padStart(3, '0')} GMT`
}

function title(value: string | null | undefined): string {
  return value ? value.replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : '—'
}

function Outcome({ event }: { event: SystemAuditEvent }) {
  const failed = event.outcome === 'failure'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      failed ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
    }`}>
      {title(event.outcome)}
    </span>
  )
}

export default function SystemAuditPage() {
  const [events, setEvents] = useState<SystemAuditEvent[]>([])
  const [summary, setSummary] = useState<SystemAuditSummary>(EMPTY_SUMMARY)
  const [alerts, setAlerts] = useState<SystemAuditAlert[]>([])
  const [telemetry, setTelemetry] = useState<SystemTelemetryEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [currentCursor, setCurrentCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([])
  const [telemetryNextCursor, setTelemetryNextCursor] = useState<string | null>(null)
  const [telemetryCursor, setTelemetryCursor] = useState<string | undefined>()
  const [telemetryCursorHistory, setTelemetryCursorHistory] = useState<Array<string | undefined>>([])
  const [loading, setLoading] = useState(true)
  const [telemetryLoading, setTelemetryLoading] = useState(true)
  const [error, setError] = useState('')
  const [integrity, setIntegrity] = useState<string>('Not checked this session')
  const [filters, setFilters] = useState<SystemAuditFilters>({ limit: 50 })
  const [searchDraft, setSearchDraft] = useState('')

  const activeFilters = useMemo(() => ({ ...filters, cursor: undefined }), [filters])
  const hasSummaryFilters = useMemo(
    () => Object.entries(filters).some(([key, value]) => key !== 'limit' && value !== undefined && value !== ''),
    [filters],
  )
  const telemetrySummaryComparable = summary.telemetryTotal !== null
  const telemetrySummaryLabel = telemetrySummaryComparable
    ? hasSummaryFilters ? 'Mobile event rows (filtered)' : 'Mobile event rows (24h)'
    : 'Mobile event rows (not comparable)'
  const telemetrySummaryValue = summary.telemetryTotal?.toLocaleString() ?? '—'

  const load = useCallback(async (cursor?: string) => {
    setLoading(true)
    setError('')
    try {
      const [page, totals, openAlerts] = await Promise.all([
        getSystemAuditEvents({ ...activeFilters, cursor }),
        getSystemAuditSummary(activeFilters),
        getSystemAuditAlerts(true),
      ])
      setEvents(page.data)
      setNextCursor(page.nextCursor)
      setSummary(totals)
      setAlerts(openAlerts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The audit vault could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [activeFilters])

  useEffect(() => { void load(currentCursor) }, [load, currentCursor])

  const loadTelemetry = useCallback(async (cursor?: string) => {
    setTelemetryLoading(true)
    try {
      const page = await getSystemTelemetryEvents({ ...activeFilters, cursor })
      setTelemetry(page.data)
      setTelemetryNextCursor(page.nextCursor)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mobile activity could not be loaded.')
    } finally {
      setTelemetryLoading(false)
    }
  }, [activeFilters])

  useEffect(() => { void loadTelemetry(telemetryCursor) }, [loadTelemetry, telemetryCursor])

  function updateFilter(key: keyof SystemAuditFilters, value: string | undefined) {
    setCursorHistory([])
    setCurrentCursor(undefined)
    setTelemetryCursorHistory([])
    setTelemetryCursor(undefined)
    setFilters(current => ({ ...current, [key]: value || undefined }))
  }

  async function exportEvents(format: 'csv' | 'json') {
    setError('')
    const params = new URLSearchParams()
    Object.entries({ ...activeFilters, format }).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value))
    })
    const response = await fetch(`${API_BASE}/system-audit/export?${params}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    })
    if (!response.ok) {
      setError('The audited export could not be generated.')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `myshop-system-audit-${new Date().toISOString()}.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function exportTelemetry(format: 'csv' | 'json') {
    setError('')
    const params = new URLSearchParams()
    Object.entries({ ...activeFilters, format }).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value))
    })
    const response = await fetch(`${API_BASE}/system-audit/telemetry/export?${params}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    })
    if (!response.ok) {
      setError('The audited mobile activity export could not be generated.')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `myshop-mobile-activity-${new Date().toISOString()}.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function checkIntegrity() {
    setIntegrity('Checking…')
    try {
      const result = await verifySystemAuditIntegrity()
      setIntegrity(result.valid ? `${result.checked.toLocaleString()} events verified` : `${result.invalid} invalid events detected`)
    } catch {
      setIntegrity('Integrity check failed')
    }
  }

  async function acknowledge(alert: SystemAuditAlert) {
    await acknowledgeSystemAuditAlert(alert.id)
    setAlerts(current => current.filter(item => item.id !== alert.id))
    setSummary(current => ({ ...current, openAlerts: Math.max(0, current.openAlerts - 1) }))
  }

  async function toggleLegalHold(event: SystemAuditEvent) {
    setError('')
    try {
      const result = await setSystemAuditLegalHold(event.id, !event.legalHold)
      setEvents(current => current.map(item => item.id === event.id ? { ...item, legalHold: result.legalHold } : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The legal hold could not be changed.')
    }
  }

  return (
    <SuperAdminPageGuard>
      <div className="space-y-5">
        <PageHeader
          title="System Audit Vault"
          subtitle="Immutable production evidence · server-authoritative GMT timestamps · exact Super Administrator access only"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void checkIntegrity()} className="gap-2">
                <ShieldCheck className="h-4 w-4" /> Verify integrity
              </Button>
              <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            [hasSummaryFilters ? 'Audit events (filtered)' : 'Audit events (24h)', summary.total.toLocaleString()],
            [telemetrySummaryLabel, telemetrySummaryValue],
            ['Failures', summary.failures.toLocaleString()],
            ['Critical', summary.critical.toLocaleString()],
            ['Open alerts (global)', summary.openAlerts.toLocaleString()],
            ['Tamper status', integrity],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {!telemetrySummaryComparable && (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Mobile event rows cannot be compared under the active audit-only filters
            {summary.telemetryUnsupportedFilters?.length
              ? ` (${summary.telemetryUnsupportedFilters.join(', ')})`
              : ''}. Audit-event totals remain filtered correctly.
          </div>
        )}

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Global timeline</TabsTrigger>
            <TabsTrigger value="telemetry">Mobile activity</TabsTrigger>
            <TabsTrigger value="alerts">Security alerts ({alerts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
              <div className="relative min-w-60 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={searchDraft}
                  onChange={event => setSearchDraft(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && updateFilter('search', searchDraft)}
                  placeholder="Actor, action, target, correlation or support reference"
                  className="pl-9"
                />
              </div>
              <Select value={filters.category ?? 'all'} onValueChange={value => updateFilter('category', value === 'all' ? undefined : value)}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {['authentication', 'security', 'admin_operation', 'verification', 'ride', 'artisan_job', 'financial', 'configuration', 'deployment', 'audit_access'].map(value => (
                    <SelectItem key={value} value={value}>{title(value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.actorType ?? 'all'} onValueChange={value => updateFilter('actorType', value === 'all' ? undefined : value)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All actors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actors</SelectItem>
                  {['admin', 'client', 'driver', 'artisan', 'system', 'deployment'].map(value => <SelectItem key={value} value={value}>{title(value)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.source ?? 'all'} onValueChange={value => updateFilter('source', value === 'all' ? undefined : value)}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All sources" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {['http_api', 'auth_service', 'otp_delivery_service', 'legacy_admin_audit', 'database_trigger', 'application_bootstrap', 'deployment_webhook', 'super_admin_dashboard', 'mobile:client', 'mobile:provider'].map(value => (
                    <SelectItem key={value} value={value}>{title(value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.environment ?? 'all'} onValueChange={value => updateFilter('environment', value === 'all' ? undefined : value)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All environments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All environments</SelectItem>
                  {['production', 'staging', 'historical', 'unknown'].map(value => <SelectItem key={value} value={value}>{title(value)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.outcome ?? 'all'} onValueChange={value => updateFilter('outcome', value === 'all' ? undefined : value)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All outcomes" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All outcomes</SelectItem><SelectItem value="success">Success</SelectItem><SelectItem value="failure">Failure</SelectItem></SelectContent>
              </Select>
              <Input type="datetime-local" className="w-48" value={filters.from?.slice(0, 16) ?? ''} onChange={event => updateFilter('from', event.target.value ? new Date(event.target.value).toISOString() : undefined)} title="From" />
              <Input type="datetime-local" className="w-48" value={filters.to?.slice(0, 16) ?? ''} onChange={event => updateFilter('to', event.target.value ? new Date(event.target.value).toISOString() : undefined)} title="To" />
              <Button variant="outline" size="sm" onClick={() => void exportEvents('csv')} className="gap-1"><Download className="h-4 w-4" /> CSV</Button>
              <Button variant="outline" size="sm" onClick={() => void exportEvents('json')}>JSON</Button>
            </div>

            <div className="overflow-hidden rounded-xl border bg-white">
              <Table>
                <TableHeader><TableRow className="bg-gray-50">
                  <TableHead>Timestamp (GMT)</TableHead><TableHead>Actor</TableHead><TableHead>Category / action</TableHead>
                  <TableHead>Outcome</TableHead><TableHead>Target</TableHead><TableHead>Evidence</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {loading ? Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={index}>{Array.from({ length: 6 }).map((__, cell) => <TableCell key={cell}><div className="h-4 animate-pulse rounded bg-gray-100" /></TableCell>)}</TableRow>
                  )) : events.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-12 text-center text-gray-400">No evidence matches these filters.</TableCell></TableRow>
                  ) : events.map(event => (
                    <TableRow key={event.id} className="align-top">
                      <TableCell className="whitespace-nowrap text-xs text-gray-500">{gmtTimestamp(event.occurredAt)}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{event.actorDisplayLabel ?? event.actorLabel ?? title(event.actorType)}</p>
                        <p className="text-xs text-gray-400">
                          {event.actorAttribution === 'unauthenticated_request'
                            ? 'Public endpoint · no authenticated account'
                            : `${title(event.actorRole)} · ${event.actorId?.slice(0, 12) ?? title(event.actorAttribution ?? 'system')}`}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-semibold uppercase text-gray-400">{title(event.category)}</p>
                        <p className="text-sm text-gray-800">{title(event.action)}</p>
                        <p className="mt-1 max-w-80 truncate font-mono text-[10px] text-gray-500" title={`${event.origin?.method ?? ''} ${event.origin?.route ?? ''}`}>
                          {event.origin?.route ? `${event.origin.method ?? 'HTTP'} ${event.origin.route}` : title(event.source)}
                        </p>
                        <p className="max-w-80 truncate text-[10px] text-gray-400" title={event.requestReference ?? ''}>
                          {event.source} · {event.environment} · ref {event.requestReference ?? '—'}
                        </p>
                      </TableCell>
                      <TableCell><Outcome event={event} /><p className="mt-1 text-[11px] text-gray-400">{title(event.severity)}</p></TableCell>
                      <TableCell><p className="text-sm">{title(event.targetType)}</p><p className="max-w-36 truncate font-mono text-[10px] text-gray-400" title={event.targetId ?? ''}>{event.targetId ?? '—'}</p></TableCell>
                      <TableCell>
                        <details className="max-w-72 text-xs">
                          <summary className="cursor-pointer font-medium text-orange-600">View evidence</summary>
                          <div className="mt-2 space-y-1 break-all text-gray-500">
                            <p>Source: {event.source} · {event.environment}</p>
                            <p>Route: {event.origin?.method ?? '—'} {event.origin?.route ?? '—'}</p>
                            <p>Reference: {event.requestReference ?? '—'}</p><p>Correlation: {event.correlationId ?? '—'}</p>
                            <p>Error: {event.diagnostic?.errorCode ?? '—'} · HTTP: {event.diagnostic?.status ?? '—'} · Duration: {event.diagnostic?.durationMs ?? '—'} ms</p>
                            <p>Reported client: {event.reportedClient?.app ?? 'unavailable'} · {event.reportedClient?.platform ?? 'platform unavailable'} · build {event.reportedClient?.build ?? 'unavailable'}</p>
                            <p>IP: {event.ipAddressMasked ?? '—'} · Version: {event.reportedClient?.version ?? event.appVersion ?? 'unavailable'}</p>
                            <p>Hash: {event.eventHash}</p><p>Retained to: {gmtTimestamp(event.retentionUntil)}{event.legalHold ? ' · LEGAL HOLD' : ''}</p>
                            <Button variant="outline" size="sm" onClick={() => void toggleLegalHold(event)}>{event.legalHold ? 'Release legal hold' : 'Apply legal hold'}</Button>
                            {event.metadata && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2">{JSON.stringify(event.metadata, null, 2)}</pre>}
                          </div>
                        </details>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" disabled={!cursorHistory.length || loading} onClick={() => {
                const previous = cursorHistory.at(-1)
                setCursorHistory(history => history.slice(0, -1))
                setCurrentCursor(previous)
              }}>Previous</Button>
              <Button variant="outline" disabled={!nextCursor || loading} onClick={() => {
                setCursorHistory(history => [...history, currentCursor])
                setCurrentCursor(nextCursor ?? undefined)
              }}>Next</Button>
            </div>
          </TabsContent>

          <TabsContent value="telemetry" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3">
              <div>
                <p className="font-medium text-gray-900">Privacy-minimal mobile activity</p>
                <p className="text-xs text-gray-500">Named screens, app lifecycle and meaningful actions only · retained for 90 days</p>
                <p className="mt-1 text-xs text-amber-700">Best-effort, at-least-once event rows: ambiguous transport loss can duplicate a row. This is not a financial ledger.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void exportTelemetry('csv')} className="gap-1"><Download className="h-4 w-4" /> CSV</Button>
                <Button variant="outline" size="sm" onClick={() => void exportTelemetry('json')}>JSON</Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-white">
              <Table>
                <TableHeader><TableRow className="bg-gray-50">
                  <TableHead>Server timestamp (GMT)</TableHead><TableHead>Actor</TableHead><TableHead>Activity</TableHead>
                  <TableHead>Outcome</TableHead><TableHead>App</TableHead><TableHead>Details</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {telemetryLoading ? Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={index}>{Array.from({ length: 6 }).map((__, cell) => <TableCell key={cell}><div className="h-4 animate-pulse rounded bg-gray-100" /></TableCell>)}</TableRow>
                  )) : telemetry.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-12 text-center text-gray-400">No mobile activity matches these filters.</TableCell></TableRow>
                  ) : telemetry.map(event => (
                    <TableRow key={event.id} className="align-top">
                      <TableCell className="whitespace-nowrap text-xs text-gray-500">{gmtTimestamp(event.occurredAt)}<p className="mt-1 text-[10px] text-gray-400">Device: {event.deviceOccurredAt ? gmtTimestamp(event.deviceOccurredAt) : 'not supplied'}</p></TableCell>
                      <TableCell><p className="text-sm font-medium">{title(event.actorType)}</p><p className="text-xs text-gray-400">{title(event.actorRole)} · {event.actorId?.slice(0, 12) ?? 'system'}</p></TableCell>
                      <TableCell><p className="text-xs font-semibold uppercase text-gray-400">{title(event.category)}</p><p className="text-sm text-gray-800">{title(event.action)}</p></TableCell>
                      <TableCell><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${event.outcome === 'failure' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{title(event.outcome)}</span></TableCell>
                      <TableCell>
                        <p className="text-sm">{event.reportedClient?.app ?? event.source}</p>
                        <p className="text-xs text-gray-400">{event.reportedClient?.platform ?? 'platform unavailable'} · build {event.reportedClient?.build ?? 'unavailable'}</p>
                        <p className="text-xs text-gray-400">Version {event.reportedClient?.version ?? event.appVersion ?? 'unavailable'}</p>
                      </TableCell>
                      <TableCell><details className="max-w-72 text-xs"><summary className="cursor-pointer font-medium text-orange-600">View details</summary><div className="mt-2 space-y-1 break-all text-gray-500"><p>Correlation: {event.correlationId ?? '—'}</p><p>Expires: {gmtTimestamp(event.expiresAt)}</p>{event.metadata && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2">{JSON.stringify(event.metadata, null, 2)}</pre>}</div></details></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" disabled={!telemetryCursorHistory.length || telemetryLoading} onClick={() => {
                const previous = telemetryCursorHistory.at(-1)
                setTelemetryCursorHistory(history => history.slice(0, -1))
                setTelemetryCursor(previous)
              }}>Previous</Button>
              <Button variant="outline" disabled={!telemetryNextCursor || telemetryLoading} onClick={() => {
                setTelemetryCursorHistory(history => [...history, telemetryCursor])
                setTelemetryCursor(telemetryNextCursor ?? undefined)
              }}>Next</Button>
            </div>
          </TabsContent>

          <TabsContent value="alerts">
            <div className="space-y-3">
              {alerts.length === 0 ? <div className="rounded-xl border bg-white p-10 text-center text-gray-400"><CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />No open audit alerts.</div> : alerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 rounded-xl border bg-white p-4">
                  <AlertTriangle className={`mt-0.5 h-5 w-5 ${alert.severity === 'critical' ? 'text-red-600' : 'text-amber-500'}`} />
                  <div className="flex-1"><p className="font-semibold text-gray-900">{alert.title}</p><p className="text-sm text-gray-500">{alert.summary}</p><p className="mt-1 text-xs text-gray-400">{gmtTimestamp(alert.createdAt)} · {title(alert.type)} · {title(alert.severity)}</p></div>
                  <Button variant="outline" size="sm" onClick={() => void acknowledge(alert)}>Acknowledge</Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </SuperAdminPageGuard>
  )
}
