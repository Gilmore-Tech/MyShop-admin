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
  RevenueReport,
  ProviderReport,
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

export function exportRevenueCsv(data: RevenueReport): void {
  const headers = [
    'Period', 'Collections (GHS)', 'Commission (GHS)', 'Payouts (GHS)', 'Tips (GHS)',
    'Total Payments', 'Successful Payments', 'Success Rate (%)', 'MoMo Count', 'Card Count',
  ]
  // Most recent first, matching the on-screen table order.
  const rows: Cell[][] = [...data.periods]
    .sort((a, b) => b.period.localeCompare(a.period))
    .map(p => [
      p.period, round2(p.collectionsGhs), round2(p.commissionGhs), round2(p.payoutsGhs),
      round2(p.tipsGhs), p.totalPayments, p.successfulPayments,
      p.paymentSuccessRatePct ?? '', p.momoCount, p.cardCount,
    ])
  downloadCsv(`myshop-revenue-${data.groupBy || 'day'}-${today()}.csv`, toCsv(headers, rows))
}

export function exportRidesCsv(data: ProviderReport): void {
  const headers = [
    'Driver', 'Phone', 'Verification Status', 'Cancellations (30d)',
    'Total Earnings (GHS)', 'Avg Rating', 'Rating Count',
  ]
  const rows: Cell[][] = [...data.drivers]
    .sort((a, b) => b.totalEarningsGhs - a.totalEarningsGhs)
    .map(d => [
      d.name, d.phone, d.verificationStatus, d.cancellationCount30d,
      round2(d.totalEarningsGhs), d.avgRating ?? '', d.ratingCount,
    ])
  downloadCsv(`myshop-rides-drivers-${today()}.csv`, toCsv(headers, rows))
}

export function exportArtisansCsv(data: ProviderReport): void {
  const headers = [
    'Artisan', 'Phone', 'Verification Status', 'Categories', 'Completed Jobs',
    'Supplement Count', 'Supplement Rate (%)', 'Cancellations (30d)', 'Flagged',
    'Avg Rating', 'Rating Count',
  ]
  const rows: Cell[][] = [...data.artisans]
    .sort((a, b) => b.completedJobsCount - a.completedJobsCount)
    .map(a => [
      a.name, a.phone, a.verificationStatus, a.categories.join('; '), a.completedJobsCount,
      a.supplementCount, a.supplementRatePct ?? '', a.cancellationCount30d, a.flagged,
      a.avgRating ?? '', a.ratingCount,
    ])
  downloadCsv(`myshop-artisans-${today()}.csv`, toCsv(headers, rows))
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
