/**
 * Client-side CSV export for the admin Reports page.
 *
 * Every report on the Reports page is already fully loaded in the browser
 * (pagination there is client-side slicing), so exports are generated from the
 * in-memory typed data — no extra backend round-trip. Each builder maps a typed
 * report to a flat CSV and triggers a browser download.
 */
import type {
  OverviewReport,
  PilotMetric,
} from './api'

type Cell = string | number | boolean | null | undefined

// Quote a single CSV field per RFC 4180 — wrap in quotes and double any inner
// quotes whenever the value contains a comma, quote, or newline.
function escapeCell(value: Cell): string {
  if (value == null) return ''
  const s = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map(cols => cols.map(escapeCell).join(','))
  // Prepend a UTF-8 BOM so Excel opens Twi/accented names and the ₵ sign correctly.
  return '﻿' + lines.join('\r\n')
}

// Trigger a browser download of `content` as a file. Returns nothing; safe to
// call from a click handler.
function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// `2026-06-24` — used to stamp export filenames.
function today(): string {
  return new Date().toISOString().split('T')[0]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Generic table export ──────────────────────────────────────────────────────

export type CsvCell = Cell

/**
 * Download any on-screen table as CSV. `filename` gets the date stamp and
 * `.csv` appended so callers only pass the report slug (e.g. "revenue-by-date").
 */
export function exportTableCsv(filename: string, headers: string[], rows: Cell[][]): void {
  downloadCsv(`myshop-${filename}-${today()}.csv`, toCsv(headers, rows))
}

// ── Per-report builders ───────────────────────────────────────────────────────

export function exportOverviewCsv(data: OverviewReport, userTotal: number | null): void {
  const roleSum = data.registeredClients + data.registeredDrivers + data.registeredArtisans
  const rows: Cell[][] = [
    ['Total Users', userTotal ?? roleSum],
    ['Registered Clients', data.registeredClients],
    ['Registered Drivers', data.registeredDrivers],
    ['Registered Artisans', data.registeredArtisans],
    ['Active Rides', data.activeRides],
    ['Active Jobs', data.activeJobs],
    ['Pending Verifications', data.pendingVerifications],
    ['Open Disputes', data.openDisputes],
    ['Commission This Month (GHS)', round2(data.commissionRevenue.monthGhs)],
    ['Commission This Week (GHS)', round2(data.commissionRevenue.weekGhs)],
    ['Commission Today (GHS)', round2(data.commissionRevenue.todayGhs)],
    ['Payment Success Rate (%)', data.paymentSuccessRatePct ?? ''],
    ['Generated At', data.generatedAt],
  ]
  downloadCsv(`myshop-overview-${today()}.csv`, toCsv(['Metric', 'Value'], rows))
}

export function exportPilotCsv(metrics: PilotMetric[]): void {
  const headers = ['Metric', 'Key', 'Actual', 'Target', 'Unit', '% of Target', 'Met']
  const rows: Cell[][] = metrics.map(m => {
    const progress = m.target > 0 ? round2((m.actual / m.target) * 100) : ''
    const met = m.target > 0 && m.actual >= m.target
    return [m.label, m.key, m.actual, m.target, m.unit, progress, met]
  })
  downloadCsv(`myshop-pilot-targets-${today()}.csv`, toCsv(headers, rows))
}
