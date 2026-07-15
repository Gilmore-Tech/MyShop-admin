'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useState, useEffect, useCallback } from 'react'
import { Save, AlertTriangle, Loader2, RefreshCw, RotateCcw, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { getAllConfig, updateConfig } from '@/lib/api'

// ─── Key conversion ───────────────────────────────────────────────────────────

function toSnake(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase()
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  commissionRatePercent:           20,
  rideBaseFarePesewas:             300,
  ridePerKmPesewas:                150,
  ridePerMinPesewas:               20,
  rideCancellationWindowSecs:      180,
  rideDriverAcceptanceWindowSecs:  15,
  rideInitialMatchRadiusKm:        3,
  rideRadiusExpansionKm:           2,
  rideMaxMatchRadiusKm:            10,
  jobBidWindowSecs:                300,
  jobMaxBids:                      3,
  jobCancellationFreeWindowSecs:   1800,
  jobCancellationFeePercent:       20,
  jobHighBidFlagPesewas:           500000,
  jobStalenessCheckinHours:        8,
  jobStalenessEscalationHours:     24,
  jobStalenessPayoutFreezeHours:   48,
  artisanMinServiceRadiusKm:       3,
  cancellationSuspensionCount:     3,
  cancellationRollingPeriodDays:   30,
  ratingWarningThreshold:          3.5,
  ratingSuspensionThreshold:       3.0,
  ratingMinJobsForThreshold:       15,
  refundApprovalThresholdPesewas:  50000,
  batchPayoutTime:                 '18:00',
  microEscrowRetryIntervalMins:    30,
  clawbackWriteoffThresholdPesewas: 10000,
  clawbackWriteoffInactiveDays:    90,
  emergencyAutoDialNumber:         '191',
  shareTokenExpiryBufferMins:      30,
  welfareCheckTimeoutHours:        3,
} as const

type ConfigKey = keyof typeof DEFAULTS
type ConfigState = { [K in ConfigKey]: string | number }

function serverToState(items: { key: string; value: string }[]): Partial<ConfigState> {
  const result: Partial<ConfigState> = {}
  for (const { key, value } of items) {
    const camel = toCamel(key) as ConfigKey
    if (camel in DEFAULTS) {
      result[camel] = typeof DEFAULTS[camel] === 'number' ? Number(value) : value
    }
  }
  return result
}

// ─── Validation ──────────────────────────────────────────────────────────────

interface ValidationRule {
  min?: number
  max?: number
  pattern?: RegExp
  required?: boolean
  message: string
}

const RULES: Partial<Record<ConfigKey, ValidationRule>> = {
  commissionRatePercent:           { min: 0, max: 100, message: 'Must be 0-100%' },
  rideBaseFarePesewas:             { min: 0, message: 'Must be ≥ 0' },
  ridePerKmPesewas:                { min: 0, message: 'Must be ≥ 0' },
  ridePerMinPesewas:               { min: 0, message: 'Must be ≥ 0' },
  rideCancellationWindowSecs:      { min: 0, message: 'Must be ≥ 0' },
  rideDriverAcceptanceWindowSecs:  { min: 5, max: 120, message: 'Must be 5-120 seconds' },
  rideInitialMatchRadiusKm:        { min: 0.1, max: 50, message: 'Must be 0.1-50 km' },
  rideRadiusExpansionKm:           { min: 0.1, max: 20, message: 'Must be 0.1-20 km' },
  rideMaxMatchRadiusKm:            { min: 1, max: 100, message: 'Must be 1-100 km' },
  jobBidWindowSecs:                { min: 30, message: 'Must be at least 30 seconds' },
  jobMaxBids:                      { min: 1, max: 20, message: 'Must be 1-20' },
  jobCancellationFreeWindowSecs:   { min: 0, message: 'Must be ≥ 0' },
  jobCancellationFeePercent:       { min: 0, max: 100, message: 'Must be 0-100%' },
  jobHighBidFlagPesewas:           { min: 0, message: 'Must be ≥ 0' },
  jobStalenessCheckinHours:        { min: 1, message: 'Must be at least 1 hour' },
  jobStalenessEscalationHours:     { min: 1, message: 'Must be at least 1 hour' },
  jobStalenessPayoutFreezeHours:   { min: 1, message: 'Must be at least 1 hour' },
  artisanMinServiceRadiusKm:       { min: 0.1, max: 50, message: 'Must be 0.1-50 km' },
  cancellationSuspensionCount:     { min: 1, max: 50, message: 'Must be 1-50' },
  cancellationRollingPeriodDays:   { min: 1, max: 365, message: 'Must be 1-365 days' },
  ratingWarningThreshold:          { min: 1, max: 5, message: 'Must be 1.0-5.0 stars' },
  ratingSuspensionThreshold:       { min: 1, max: 5, message: 'Must be 1.0-5.0 stars' },
  ratingMinJobsForThreshold:       { min: 1, max: 200, message: 'Must be 1-200' },
  refundApprovalThresholdPesewas:  { min: 0, message: 'Must be ≥ 0' },
  batchPayoutTime:                 { pattern: /^\d{2}:\d{2}$/, required: true, message: 'Must be HH:MM (e.g. 18:00)' },
  microEscrowRetryIntervalMins:    { min: 1, message: 'Must be at least 1 minute' },
  clawbackWriteoffThresholdPesewas: { min: 0, message: 'Must be ≥ 0' },
  clawbackWriteoffInactiveDays:    { min: 1, message: 'Must be at least 1 day' },
  emergencyAutoDialNumber:         { required: true, message: 'Cannot be empty' },
  shareTokenExpiryBufferMins:      { min: 1, message: 'Must be at least 1 minute' },
  welfareCheckTimeoutHours:        { min: 1, message: 'Must be at least 1 hour' },
}

function validate(key: ConfigKey, value: string | number): string | null {
  const rule = RULES[key]
  if (!rule) return null
  const str = String(value).trim()
  if (rule.required && !str) return rule.message
  if (rule.pattern && !rule.pattern.test(str)) return rule.message
  if (typeof DEFAULTS[key] === 'number') {
    const n = Number(str)
    if (isNaN(n)) return 'Must be a valid number'
    if (rule.min !== undefined && n < rule.min) return rule.message
    if (rule.max !== undefined && n > rule.max) return rule.message
  }
  return null
}

function hasErrors(state: ConfigState): boolean {
  return (Object.keys(state) as ConfigKey[]).some(k => validate(k, state[k]) !== null)
}

// ─── Unit hints ───────────────────────────────────────────────────────────────

function unitHint(key: string, value: string | number): string | null {
  const n = Number(value)
  if (isNaN(n) || String(value).trim() === '') return null

  if (key.endsWith('Pesewas')) {
    return `= GHS ${(n / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (key.endsWith('Secs')) {
    if (n === 0) return null
    if (n >= 3600) return `= ${(n / 3600).toFixed(1).replace(/\.0$/, '')} hr`
    if (n >= 60) {
      const m = Math.floor(n / 60)
      const s = n % 60
      return s > 0 ? `= ${m} min ${s}s` : `= ${m} min`
    }
    return null
  }
  if (key.endsWith('Mins') && n >= 60) {
    return `= ${(n / 60).toFixed(1).replace(/\.0$/, '')} hr`
  }
  if (key.endsWith('Hours') && n >= 24) {
    return `= ${(n / 24).toFixed(1).replace(/\.0$/, '')} days`
  }
  return null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfigField({
  label, configKey, value, original, systemDefault, onChange, type = 'number', description,
}: {
  label: string
  configKey: ConfigKey
  value: string | number
  original: string | number
  systemDefault: string | number
  onChange: (k: ConfigKey, v: string) => void
  type?: string
  description?: string
}) {
  const isDirty = String(value) !== String(original)
  const isNonDefault = String(original) !== String(systemDefault)
  const error = validate(configKey, value)
  const hint = unitHint(configKey, value)

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-1 min-h-[22px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Label className="text-sm font-medium text-gray-800 leading-tight">{label}</Label>
          {isDirty && (
            <span className="inline-flex items-center text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700">unsaved</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <button
              onClick={() => onChange(configKey, String(original))}
              className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
              title="Undo local changes"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Undo
            </button>
          )}
          {isNonDefault && !isDirty && (
            <button
              onClick={() => onChange(configKey, String(systemDefault))}
              className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-orange-600 transition-colors"
              title={`Restore system default: ${systemDefault}`}
            >
              <History className="h-2.5 w-2.5" />
              Default
            </button>
          )}
        </div>
      </div>

      {description && <p className="text-[11px] text-gray-400 leading-snug">{description}</p>}

      <div className="flex items-center gap-2">
        <Input
          type={type}
          value={value}
          step={type === 'number' ? 'any' : undefined}
          onChange={e => onChange(configKey, e.target.value)}
          className={`w-44 text-sm h-8 ${
            error
              ? 'border-red-300 ring-2 ring-red-100 focus-visible:ring-red-300'
              : isDirty
              ? 'ring-2 ring-amber-200 border-amber-300'
              : ''
          }`}
        />
        {hint && !error && (
          <span className="text-[11px] text-emerald-700 font-medium whitespace-nowrap">{hint}</span>
        )}
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}

function Section({ title, description, icon, children }: {
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-gray-400">{icon}</span>}
          <div>
            <CardTitle className="text-sm font-semibold text-gray-900">{title}</CardTitle>
            {description && <CardDescription className="text-[11px] mt-0.5">{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Diff row in confirm dialog ───────────────────────────────────────────────

function DiffRow({ configKey, oldVal, newVal }: { configKey: ConfigKey; oldVal: string | number; newVal: string | number }) {
  const oldHint = unitHint(configKey, oldVal)
  const newHint = unitHint(configKey, newVal)
  const label = toSnake(configKey)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 py-1.5 border-b border-gray-50 last:border-0 text-xs">
      <div className="text-gray-500 font-mono truncate">{label}</div>
      <span className="text-gray-300 mt-0.5">-&gt;</span>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="line-through text-gray-400">{String(oldVal)}{oldHint && <span className="font-normal"> ({oldHint.replace('= ', '')})</span>}</span>
          <span className="font-semibold text-gray-800">{String(newVal)}{newHint && <span className="font-normal text-emerald-600"> ({newHint.replace('= ', '')})</span>}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigurationPage() {
  const [config, setConfig] = useState<ConfigState>({ ...DEFAULTS })
  const [saved, setSaved] = useState<ConfigState>({ ...DEFAULTS })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const dirty = (Object.keys(config) as ConfigKey[]).some(
    k => String(config[k]) !== String(saved[k])
  )
  const errors = hasErrors(config)

  const changedKeys = (Object.keys(config) as ConfigKey[]).filter(
    k => String(config[k]) !== String(saved[k])
  )

  // Warn on browser/tab close when there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    getAllConfig()
      .then(items => {
        const fromServer = serverToState(items)
        const merged: ConfigState = { ...DEFAULTS, ...fromServer }
        setConfig(merged)
        setSaved(merged)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleChange(key: ConfigKey, value: string) {
    const def = DEFAULTS[key]
    setConfig(prev => ({ ...prev, [key]: typeof def === 'number' ? (value === '' ? value : Number(value)) : value }))
    setSaveSuccess(false)
    setSaveError(null)
  }

  function handleResetAll() {
    setConfig({ ...saved })
    setSaveError(null)
    setSaveSuccess(false)
  }

  async function handleSave() {
    setConfirmDialog(false)
    setSaving(true)
    setSaveError(null)
    try {
      await Promise.all(changedKeys.map(k => updateConfig(toSnake(k), String(config[k]))))
      setSaved({ ...config })
      setSaveSuccess(true)
    } catch {
      setSaveError('Some settings could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function field(
    label: string,
    configKey: ConfigKey,
    opts?: { type?: string; description?: string }
  ) {
    return (
      <ConfigField
        key={configKey}
        label={label}
        configKey={configKey}
        value={config[configKey]}
        original={saved[configKey]}
        systemDefault={DEFAULTS[configKey]}
        onChange={handleChange}
        type={opts?.type ?? (typeof DEFAULTS[configKey] === 'number' ? 'number' : 'text')}
        description={opts?.description}
      />
    )
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Platform Configuration" subtitle="Adjust platform business rules." />
        <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading configuration…</span>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Platform Configuration" subtitle="Adjust platform business rules." />
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-gray-500">Failed to load configuration from the server.</p>
          <Button variant="outline" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <PageGuard permission="view_config">
      <div>
        <PageHeader
          title="Platform Configuration"
          subtitle="Adjust platform business rules. Changes apply to new bookings only - never retroactive."
          actions={
            <div className="flex items-center gap-3">
              {saveSuccess && !dirty && (
                <span className="text-sm text-emerald-600 font-medium">Saved</span>
              )}
              {saveError && (
                <span className="text-sm text-red-500">{saveError}</span>
              )}
              {dirty && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-gray-800" onClick={handleResetAll}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset all
                </Button>
              )}
              <Button
                onClick={() => setConfirmDialog(true)}
                disabled={!dirty || saving || errors}
                className="gap-2 text-white"
                style={{ backgroundColor: dirty && !errors ? '#F5A623' : undefined }}
                title={errors ? 'Fix validation errors before saving' : undefined}
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : <><Save className="h-4 w-4" /> Save Changes {dirty ? `(${changedKeys.length})` : ''}</>
                }
              </Button>
            </div>
          }
        />

        {/* Unsaved changes banner */}
        {dirty && (
          <div className={`mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
            errors
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errors
              ? `${changedKeys.length} unsaved change${changedKeys.length !== 1 ? 's' : ''} - fix validation errors before saving.`
              : `${changedKeys.length} unsaved change${changedKeys.length !== 1 ? 's' : ''} - remember to save before navigating away.`
            }
          </div>
        )}

        <div className="space-y-4">
          <Section title="Commission" description="Platform revenue share applied to all completed bookings">
            {field('Commission Rate (%)', 'commissionRatePercent', { description: 'Applied to pre-promo fare. Pilot target: 20%.' })}
          </Section>

          <Section title="Ride Fares" description="Fare formula components for ride-hailing bookings">
            {field('Base Fare', 'rideBaseFarePesewas', { description: 'Flat fee charged per ride' })}
            {field('Per-Kilometre Rate', 'ridePerKmPesewas', { description: 'Distance component' })}
            {field('Per-Minute Rate', 'ridePerMinPesewas', { description: 'Time component (traffic, delays)' })}
          </Section>

          <Section title="Ride Matching" description="Driver search radius and acceptance timing">
            {field('Initial Match Radius (km)', 'rideInitialMatchRadiusKm')}
            {field('Radius Expansion Step (km)', 'rideRadiusExpansionKm')}
            {field('Max Match Radius (km)', 'rideMaxMatchRadiusKm')}
            {field('Driver Acceptance Window', 'rideDriverAcceptanceWindowSecs', { description: 'Time driver has to accept a request' })}
          </Section>

          <Section title="Ride Cancellation" description="Client free-cancellation window and rules">
            {field('Free Cancellation Window', 'rideCancellationWindowSecs', { description: 'Client can cancel penalty-free within this window' })}
          </Section>

          <Section title="Artisan Job Settings" description="Bidding window, job limits, and cancellation policy">
            {field('Bid Collection Window', 'jobBidWindowSecs', { description: 'How long the job stays open for bids' })}
            {field('Max Bids Per Job', 'jobMaxBids', { description: 'Client sees top N bids to choose from' })}
            {field('Free Cancellation Window', 'jobCancellationFreeWindowSecs', { description: 'Penalty-free window after job is confirmed' })}
            {field('Cancellation Fee (%)', 'jobCancellationFeePercent', { description: 'Charged on agreed price outside free window' })}
            {field('High Bid Review Threshold', 'jobHighBidFlagPesewas', { description: 'Bids above this are flagged for admin review' })}
          </Section>

          <Section title="Job Staleness Escalation" description="Thresholds that trigger notifications and freezes for inactive jobs">
            {field('Check-in Alert', 'jobStalenessCheckinHours', { description: 'Both parties notified when job goes inactive' })}
            {field('Escalation Threshold', 'jobStalenessEscalationHours', { description: 'Admin alerted for manual review' })}
            {field('Payout Freeze Threshold', 'jobStalenessPayoutFreezeHours', { description: 'Escrow payout frozen until resolved' })}
          </Section>

          <Section title="Provider Behaviour Thresholds" description="Automatic suspension and rating-based intervention rules">
            {field('Min Artisan Service Radius (km)', 'artisanMinServiceRadiusKm', { description: 'Smallest radius an artisan can set' })}
            {field('Cancellation Suspension Count', 'cancellationSuspensionCount', { description: 'Number of cancellations that triggers suspension' })}
            {field('Cancellation Rolling Period (days)', 'cancellationRollingPeriodDays', { description: 'Lookback window for cancellation count' })}
            {field('Rating Warning Threshold (stars)', 'ratingWarningThreshold', { description: 'Warning sent below this average' })}
            {field('Rating Suspension Threshold (stars)', 'ratingSuspensionThreshold', { description: 'Auto-suspend below this average' })}
            {field('Min Ratings for Threshold', 'ratingMinJobsForThreshold', { description: 'Ignore thresholds until provider has this many ratings' })}
          </Section>

          <Section title="Payment & Payouts" description="Batch payout schedule, refund limits, and escrow retry logic">
            {field('Daily Batch Payout Time (HH:MM)', 'batchPayoutTime', { type: 'text', description: 'UTC time. Providers paid once daily.' })}
            {field('Refund Threshold for Support Agents', 'refundApprovalThresholdPesewas', { description: 'Refunds above this need Ops Admin approval' })}
            {field('Micro-Escrow Retry Interval', 'microEscrowRetryIntervalMins', { description: 'How often failed escrow releases are retried' })}
            {field('Provider Balance Write-off Threshold', 'clawbackWriteoffThresholdPesewas', { description: 'Small provider balances written off automatically' })}
            {field('Provider Balance Write-off Inactivity', 'clawbackWriteoffInactiveDays', { description: 'Written off after this many inactive days' })}
          </Section>

          <Section title="Safety & Emergency" description="Emergency dial, share links, and welfare check timeouts">
            {field('Emergency Auto-Dial Number', 'emergencyAutoDialNumber', { type: 'text', description: 'Dialled when SOS button is pressed. Ghana Police: 191.' })}
            {field('Share Link Expiry Buffer', 'shareTokenExpiryBufferMins', { description: 'How long share links stay valid after booking ends' })}
            {field('Welfare Check Timeout', 'welfareCheckTimeoutHours', { description: '"Arrived" with no further activity triggers a welfare check' })}
          </Section>
        </div>

        {/* Confirm dialog */}
        <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Save {changedKeys.length} Configuration Change{changedKeys.length !== 1 ? 's' : ''}
              </DialogTitle>
              <DialogDescription>
                These changes apply to <strong>all new bookings</strong> immediately.
                Existing bookings are unaffected. This action will be recorded in the audit trail.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 px-3 py-1">
              {changedKeys.map(k => (
                <DiffRow key={k} configKey={k} oldVal={saved[k]} newVal={config[k]} />
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialog(false)}>Cancel</Button>
              <Button onClick={handleSave} style={{ backgroundColor: '#F5A623' }} className="text-white gap-2">
                <Save className="h-4 w-4" /> Confirm & Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  )
}
