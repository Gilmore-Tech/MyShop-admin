'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useState, useEffect, useCallback } from 'react'
import { Save, AlertTriangle, Loader2, RotateCcw, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import { PageSkeleton } from '@/components/common/load-state'
import { ErrorState } from '@/components/common/error-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { getAllConfig, updateConfig } from '@/lib/api'
import { formatGhs } from '@/lib/money'

// ─── Key conversion ───────────────────────────────────────────────────────────

function toSnake(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase()
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  // Financially authoritative: there is deliberately no client-side fallback.
  // The page refuses to render editable settings if the DB value is missing.
  commissionRatePercent:           Number.NaN,
  rideBaseFarePesewas:             300,
  ridePerKmPesewas:                150,
  ridePerMinPesewas:               20,
  rideCancellationWindowSecs:      180,
  rideDriverAcceptanceWindowSecs:  15,
  rideInitialMatchRadiusKm:        3,
  rideRadiusExpansionKm:           2,
  rideMaxMatchRadiusKm:            10,
  rideDestinationEditEnabled:     'false',
  rideDestinationEditMaxAddedKm:  10,
  rideDestinationEditMaxAddedMins: 30,
  rideDestinationEditPreviewTtlSecs: 120,
  providerCancellationBlockWarnCount: 2,
  providerCancellationBlockThreshold: 3,
  providerCancellationBlockRollingWindowMins: 60,
  providerCancellationBlockMins: 15,
  providerCancellationBlockShadowEnabled: 'true',
  providerCancellationBlockEnabled: 'false',
  providerOfferResponseEnabled:       'false',
  providerOfferResponseShadowEnabled: 'true',
  providerOfferResponseDeclinePoints:  1,
  providerOfferResponseNoResponsePoints: 2,
  providerOfferResponseWarnPoints:     4,
  providerOfferResponseThresholdPoints: 6,
  providerOfferResponseRollingWindowMins: 60,
  providerOfferResponseBlockMins:      15,
  jobBidWindowSecs:                300,
  jobOfferDeliveryWindowSecs:       30,
  jobOfferResponseWindowSecs:       60,
  jobMaxBids:                      3,
  jobAdminAssignmentSlaSecs:       600,
  jobAdminAssignmentLockSecs:      120,
  jobDirectedQuoteWindowSecs:      900,
  jobDirectedAcceptReminderSecs:   300,
  jobDirectedAcceptWindowSecs:     600,
  jobManualAssignmentTotalWindowSecs: 2700,
  jobManualAssignmentMaxAttempts:  3,
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
  announcementPreviewTtlSecs:      1800,
} as const

type ConfigKey = keyof typeof DEFAULTS
type ConfigState = { [K in ConfigKey]: string | number }

// Human labels for each key - kept in sync with the `field(...)` labels below.
// Used for the confirm-save diff, so a raw camel/snake key (e.g. a "clawback*"
// config key) never reaches rendered text.
const FIELD_LABELS: Record<ConfigKey, string> = {
  commissionRatePercent: 'Commission Rate (%)',
  rideBaseFarePesewas: 'Base Fare',
  ridePerKmPesewas: 'Per-Kilometre Rate',
  ridePerMinPesewas: 'Per-Minute Rate',
  rideInitialMatchRadiusKm: 'Initial Match Radius (km)',
  rideRadiusExpansionKm: 'Radius Expansion Step (km)',
  rideMaxMatchRadiusKm: 'Max Match Radius (km)',
  rideDriverAcceptanceWindowSecs: 'Driver Acceptance Window',
  rideDestinationEditEnabled: 'Active Ride Drop-off Changes',
  rideDestinationEditMaxAddedKm: 'Maximum Added Distance',
  rideDestinationEditMaxAddedMins: 'Maximum Added Time',
  rideDestinationEditPreviewTtlSecs: 'Preview Expiry',
  rideCancellationWindowSecs: 'Free Cancellation Window',
  providerCancellationBlockWarnCount: 'Provider warning count',
  providerCancellationBlockThreshold: 'Provider block threshold',
  providerCancellationBlockRollingWindowMins: 'Provider rolling window',
  providerCancellationBlockMins: 'Provider block duration',
  providerCancellationBlockShadowEnabled: 'Provider shadow monitoring',
  providerCancellationBlockEnabled: 'Provider enforcement',
  providerOfferResponseEnabled: 'Offer-response enforcement',
  providerOfferResponseShadowEnabled: 'Offer-response shadow monitoring',
  providerOfferResponseDeclinePoints: 'Declined-offer points',
  providerOfferResponseNoResponsePoints: 'No-response points',
  providerOfferResponseWarnPoints: 'Offer-response warning points',
  providerOfferResponseThresholdPoints: 'Offer-response block threshold',
  providerOfferResponseRollingWindowMins: 'Offer-response rolling window',
  providerOfferResponseBlockMins: 'Offer-response block duration',
  jobBidWindowSecs: 'Bid Collection Window',
  jobOfferDeliveryWindowSecs: 'Job Offer Delivery Window',
  jobOfferResponseWindowSecs: 'Job Offer Response Window',
  jobMaxBids: 'Max Bids Per Job',
  jobAdminAssignmentSlaSecs: 'Admin Assignment SLA',
  jobAdminAssignmentLockSecs: 'Assignment Edit Lock',
  jobDirectedQuoteWindowSecs: 'Artisan Quote Deadline',
  jobDirectedAcceptReminderSecs: 'Client Reminder',
  jobDirectedAcceptWindowSecs: 'Client Acceptance Deadline',
  jobManualAssignmentTotalWindowSecs: 'Total Assignment Window',
  jobManualAssignmentMaxAttempts: 'Maximum Assignment Attempts',
  jobCancellationFreeWindowSecs: 'Free Cancellation Window',
  jobCancellationFeePercent: 'Cancellation Fee (%)',
  jobHighBidFlagPesewas: 'High Bid Review Threshold',
  jobStalenessCheckinHours: 'Check-in Alert',
  jobStalenessEscalationHours: 'Escalation Threshold',
  jobStalenessPayoutFreezeHours: 'Payout Freeze Threshold',
  artisanMinServiceRadiusKm: 'Min Artisan Service Radius (km)',
  cancellationSuspensionCount: 'Cancellation Suspension Count',
  cancellationRollingPeriodDays: 'Cancellation Rolling Period (days)',
  ratingWarningThreshold: 'Rating Warning Threshold (stars)',
  ratingSuspensionThreshold: 'Rating Suspension Threshold (stars)',
  ratingMinJobsForThreshold: 'Min Ratings for Threshold',
  batchPayoutTime: 'Daily Batch Payout Time (HH:MM)',
  refundApprovalThresholdPesewas: 'Refund Threshold for Support Agents',
  microEscrowRetryIntervalMins: 'Micro-Escrow Retry Interval',
  clawbackWriteoffThresholdPesewas: 'Money owed write-off threshold',
  clawbackWriteoffInactiveDays: 'Money owed write-off inactivity',
  emergencyAutoDialNumber: 'Emergency Auto-Dial Number',
  shareTokenExpiryBufferMins: 'Share Link Expiry Buffer',
  welfareCheckTimeoutHours: 'Welfare Check Timeout',
  announcementPreviewTtlSecs: 'Announcement Preview Expiry',
}

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
  rideBaseFarePesewas:             { min: 0, message: 'Must be 0 or more' },
  ridePerKmPesewas:                { min: 0, message: 'Must be 0 or more' },
  ridePerMinPesewas:               { min: 0, message: 'Must be 0 or more' },
  rideCancellationWindowSecs:      { min: 0, message: 'Must be 0 or more' },
  rideDriverAcceptanceWindowSecs:  { min: 5, max: 120, message: 'Must be 5-120 seconds' },
  rideInitialMatchRadiusKm:        { min: 0.1, max: 50, message: 'Must be 0.1-50 km' },
  rideRadiusExpansionKm:           { min: 0.1, max: 20, message: 'Must be 0.1-20 km' },
  rideMaxMatchRadiusKm:            { min: 1, max: 100, message: 'Must be 1-100 km' },
  rideDestinationEditMaxAddedKm:  { min: 0.5, max: 100, message: 'Must be 0.5-100 km' },
  rideDestinationEditMaxAddedMins: { min: 1, max: 240, message: 'Must be 1-240 minutes' },
  rideDestinationEditPreviewTtlSecs: { min: 60, max: 300, message: 'Must be 60-300 seconds' },
  providerCancellationBlockWarnCount: { min: 1, max: 20, message: 'Must be 1-20' },
  providerCancellationBlockThreshold: { min: 2, max: 50, message: 'Must be 2-50' },
  providerCancellationBlockRollingWindowMins: {
    min: 5,
    max: 43200,
    message: 'Must be 5-43200 minutes',
  },
  providerCancellationBlockMins: {
    min: 1,
    max: 10080,
    message: 'Must be 1-10080 minutes',
  },
  providerOfferResponseDeclinePoints: { min: 1, max: 20, message: 'Must be 1-20 points' },
  providerOfferResponseNoResponsePoints: { min: 1, max: 20, message: 'Must be 1-20 points' },
  providerOfferResponseWarnPoints: { min: 1, max: 100, message: 'Must be 1-100 points' },
  providerOfferResponseThresholdPoints: { min: 2, max: 200, message: 'Must be 2-200 points' },
  providerOfferResponseRollingWindowMins: {
    min: 5,
    max: 43200,
    message: 'Must be 5-43200 minutes',
  },
  providerOfferResponseBlockMins: {
    min: 1,
    max: 10080,
    message: 'Must be 1-10080 minutes',
  },
  jobBidWindowSecs:                { min: 30, message: 'Must be at least 30 seconds' },
  jobOfferDeliveryWindowSecs:      { min: 10, max: 120, message: 'Must be 10-120 seconds' },
  jobOfferResponseWindowSecs:      { min: 15, max: 300, message: 'Must be 15-300 seconds' },
  jobMaxBids:                      { min: 1, max: 20, message: 'Must be 1-20' },
  jobAdminAssignmentSlaSecs:       { min: 60, max: 86400, message: 'Must be 60-86400 seconds' },
  jobAdminAssignmentLockSecs:      { min: 30, max: 1800, message: 'Must be 30-1800 seconds' },
  jobDirectedQuoteWindowSecs:      { min: 60, max: 86400, message: 'Must be 60-86400 seconds' },
  jobDirectedAcceptReminderSecs:   { min: 30, max: 86400, message: 'Must be 30-86400 seconds' },
  jobDirectedAcceptWindowSecs:     { min: 60, max: 172800, message: 'Must be 60-172800 seconds' },
  jobManualAssignmentTotalWindowSecs: {
    min: 300,
    max: 604800,
    message: 'Must be 300-604800 seconds',
  },
  jobManualAssignmentMaxAttempts:  { min: 1, max: 20, message: 'Must be 1-20' },
  jobCancellationFreeWindowSecs:   { min: 0, message: 'Must be 0 or more' },
  jobCancellationFeePercent:       { min: 0, max: 100, message: 'Must be 0-100%' },
  jobHighBidFlagPesewas:           { min: 0, message: 'Must be 0 or more' },
  jobStalenessCheckinHours:        { min: 1, message: 'Must be at least 1 hour' },
  jobStalenessEscalationHours:     { min: 1, message: 'Must be at least 1 hour' },
  jobStalenessPayoutFreezeHours:   { min: 1, message: 'Must be at least 1 hour' },
  artisanMinServiceRadiusKm:       { min: 0.1, max: 50, message: 'Must be 0.1-50 km' },
  cancellationSuspensionCount:     { min: 1, max: 50, message: 'Must be 1-50' },
  cancellationRollingPeriodDays:   { min: 1, max: 365, message: 'Must be 1-365 days' },
  ratingWarningThreshold:          { min: 1, max: 5, message: 'Must be 1.0-5.0 stars' },
  ratingSuspensionThreshold:       { min: 1, max: 5, message: 'Must be 1.0-5.0 stars' },
  ratingMinJobsForThreshold:       { min: 1, max: 200, message: 'Must be 1-200' },
  refundApprovalThresholdPesewas:  { min: 0, message: 'Must be 0 or more' },
  batchPayoutTime:                 { pattern: /^\d{2}:\d{2}$/, required: true, message: 'Must be HH:MM (e.g. 18:00)' },
  microEscrowRetryIntervalMins:    { min: 1, message: 'Must be at least 1 minute' },
  clawbackWriteoffThresholdPesewas: { min: 0, message: 'Must be 0 or more' },
  clawbackWriteoffInactiveDays:    { min: 1, message: 'Must be at least 1 day' },
  emergencyAutoDialNumber:         { required: true, message: 'Cannot be empty' },
  shareTokenExpiryBufferMins:      { min: 1, message: 'Must be at least 1 minute' },
  welfareCheckTimeoutHours:        { min: 1, message: 'Must be at least 1 hour' },
  announcementPreviewTtlSecs:      { min: 60, max: 86400, message: 'Must be 60-86400 seconds' },
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
    if (key === 'commissionRatePercent' && !/^\d+(?:\.\d{1,2})?$/.test(str)) {
      return 'Use at most 2 decimal places'
    }
    if (rule.min !== undefined && n < rule.min) return rule.message
    if (rule.max !== undefined && n > rule.max) return rule.message
  }
  return null
}

function hasErrors(state: ConfigState): boolean {
  return (
    (Object.keys(state) as ConfigKey[]).some(k => validate(k, state[k]) !== null) ||
    Number(state.providerCancellationBlockWarnCount) >=
      Number(state.providerCancellationBlockThreshold) ||
    Number(state.providerOfferResponseWarnPoints) >=
      Number(state.providerOfferResponseThresholdPoints) ||
    Number(state.jobOfferDeliveryWindowSecs) > Number(state.jobBidWindowSecs) ||
    Number(state.jobOfferResponseWindowSecs) > Number(state.jobBidWindowSecs) ||
    Number(state.jobDirectedAcceptReminderSecs) >=
      Number(state.jobDirectedAcceptWindowSecs)
  )
}

// ─── Unit hints ───────────────────────────────────────────────────────────────

function unitHint(key: string, value: string | number): string | null {
  const n = Number(value)
  if (isNaN(n) || String(value).trim() === '') return null

  if (key.endsWith('Pesewas')) {
    return `= ${formatGhs(n)}`
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
  label, configKey, value, original, systemDefault, onChange, type = 'number', description, disabled = false,
}: {
  label: string
  configKey: ConfigKey
  value: string | number
  original: string | number
  systemDefault: string | number
  onChange: (k: ConfigKey, v: string) => void
  type?: string
  description?: string
  disabled?: boolean
}) {
  const isDirty = String(value) !== String(original)
  const hasSystemDefault = typeof systemDefault !== 'number' || Number.isFinite(systemDefault)
  const isNonDefault = hasSystemDefault && String(original) !== String(systemDefault)
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
          {disabled && (
            <span className="inline-flex items-center text-[10px] font-medium px-1 py-0.5 rounded bg-gray-100 text-gray-500">paused</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && !disabled && (
            <button
              onClick={() => onChange(configKey, String(original))}
              className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
              title="Undo local changes"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Undo
            </button>
          )}
          {isNonDefault && !isDirty && !disabled && (
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
        {type === 'boolean' ? (
          <Select
            value={String(value)}
            onValueChange={next => onChange(configKey, next)}
            disabled={disabled}
          >
            <SelectTrigger
              className={`w-44 h-8 ${isDirty ? 'ring-2 ring-amber-200 border-amber-300' : ''}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">On</SelectItem>
              <SelectItem value="false">Off</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={type}
            value={value}
            step={type === 'number' ? (configKey === 'commissionRatePercent' ? '0.01' : 'any') : undefined}
            onChange={e => onChange(configKey, e.target.value)}
            disabled={disabled}
            className={`w-44 text-sm h-8 ${
              error
                ? 'border-red-300 ring-2 ring-red-100 focus-visible:ring-red-300'
                : isDirty
                ? 'ring-2 ring-amber-200 border-amber-300'
                : ''
            }`}
          />
        )}
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
  const label = FIELD_LABELS[configKey]
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 py-1.5 border-b border-gray-50 last:border-0 text-xs">
      <div className="text-gray-500 truncate">{label}</div>
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
        if (
          typeof fromServer.commissionRatePercent !== 'number'
          || !Number.isFinite(fromServer.commissionRatePercent)
        ) {
          throw new Error('Required commission configuration is missing or invalid')
        }
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
      // The API validates dependent values against what is already stored.
      // Apply safe boundary expansions/decreases first so a valid multi-field
      // edit cannot fail merely because concurrent PATCH requests race.
      const upperBounds = new Set<ConfigKey>([
        'jobBidWindowSecs',
        'providerCancellationBlockThreshold',
        'providerOfferResponseThresholdPoints',
      ])
      const lowerValues = new Set<ConfigKey>([
        'jobOfferDeliveryWindowSecs',
        'jobOfferResponseWindowSecs',
        'providerCancellationBlockWarnCount',
        'providerOfferResponseWarnPoints',
      ])
      const savePriority = (key: ConfigKey): number => {
        const before = Number(saved[key])
        const after = Number(config[key])
        if (upperBounds.has(key)) return after > before ? 0 : 3
        if (lowerValues.has(key)) return after < before ? 0 : 2
        return 1
      }
      const orderedKeys = [...changedKeys].sort(
        (left, right) => savePriority(left) - savePriority(right),
      )
      for (const key of orderedKeys) {
        await updateConfig(toSnake(key), String(config[key]))
      }
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
    opts?: { type?: string; description?: string; disabled?: boolean }
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
        disabled={opts?.disabled}
      />
    )
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Marketplace settings" subtitle="Commission, fees and platform rules" />
        <PageSkeleton variant="form" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Marketplace settings" subtitle="Commission, fees and platform rules" />
        <ErrorState title="Could not load configuration" detail="Failed to load configuration from the server." onRetry={load} />
      </div>
    )
  }

  return (
    <PageGuard permission="view_config">
      <div>
        <PageHeader
          title="Marketplace settings"
          subtitle="Commission, fees and platform rules"
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
                variant="brand"
                className="gap-2"
                title={errors ? 'Fix validation errors before saving' : undefined}
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                  : <><Save className="h-4 w-4" /> Save changes {dirty ? `(${changedKeys.length})` : ''}</>
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
            {field('Commission Rate (%)', 'commissionRatePercent', { description: 'Applied to new payments and snapshotted for historical reporting.' })}
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

          <Section title="Active Ride Destination" description="Controls client-requested drop-off changes after a ride has started">
            {field('Active Ride Drop-off Changes', 'rideDestinationEditEnabled', {
              type: 'boolean',
              description: 'Allow a client to preview and confirm a new final drop-off. The server recalculates the route and fare before the change is accepted.',
            })}
            {field('Maximum Added Distance', 'rideDestinationEditMaxAddedKm', {
              description: 'Maximum extra remaining-route distance accepted for a destination change, in kilometres',
            })}
            {field('Maximum Added Time', 'rideDestinationEditMaxAddedMins', {
              description: 'Maximum extra remaining-route duration accepted for a destination change, in minutes',
            })}
            {field('Preview Expiry', 'rideDestinationEditPreviewTtlSecs', {
              description: 'Seconds before a reviewed destination and fare preview expires',
            })}
          </Section>

          <Section title="Ride Cancellation" description="Automatic cancellation consequences are paused for this release">
            {field('Free Cancellation Window', 'rideCancellationWindowSecs', { description: 'Stored for later policy activation; currently not applied', disabled: true })}
          </Section>

          <Section
            title="Provider cancellation blocks"
            description="Temporarily pauses new ride or job offers after repeated provider cancellations"
          >
            {field('Warning count', 'providerCancellationBlockWarnCount', {
              description: 'Warn before the enforcement threshold is reached',
            })}
            {field('Block threshold', 'providerCancellationBlockThreshold', {
              description: 'Provider cancellations inside the rolling window that trigger a block',
            })}
            {field('Rolling window', 'providerCancellationBlockRollingWindowMins', {
              description: 'Minutes of recent cancellation history considered',
            })}
            {field('Block duration', 'providerCancellationBlockMins', {
              description: 'Minutes before the driver or artisan can receive new requests',
            })}
            {field('Shadow monitoring', 'providerCancellationBlockShadowEnabled', {
              type: 'boolean',
              description: 'Record would-block decisions without restricting providers',
            })}
            {field('Enforcement', 'providerCancellationBlockEnabled', {
              type: 'boolean',
              description: 'Block new provider requests when the threshold is reached',
            })}
            {Number(config.providerCancellationBlockWarnCount) >=
              Number(config.providerCancellationBlockThreshold) && (
              <p className="text-xs font-medium text-red-600 sm:col-span-2 lg:col-span-3">
                Warning count must be lower than the block threshold.
              </p>
            )}
          </Section>

          <Section
            title="Provider offer-response blocks"
            description="Reliability points for declined or unanswered offers; this does not change a provider's public star rating"
          >
            {field('Declined-offer points', 'providerOfferResponseDeclinePoints', {
              description: 'Points added when a provider explicitly declines a valid offer',
            })}
            {field('No-response points', 'providerOfferResponseNoResponsePoints', {
              description: 'Points added only when a delivered offer reaches its response deadline without an answer',
            })}
            {field('Warning points', 'providerOfferResponseWarnPoints', {
              description: 'Warn the provider before the block threshold is reached',
            })}
            {field('Block threshold', 'providerOfferResponseThresholdPoints', {
              description: 'Offer-response points inside the rolling window that trigger a block',
            })}
            {field('Rolling window', 'providerOfferResponseRollingWindowMins', {
              description: 'Minutes of recent declined and unanswered offers considered',
            })}
            {field('Block duration', 'providerOfferResponseBlockMins', {
              description: 'Minutes before the provider can receive new requests again',
            })}
            {field('Shadow monitoring', 'providerOfferResponseShadowEnabled', {
              type: 'boolean',
              description: 'Record would-block decisions without restricting providers',
            })}
            {field('Enforcement', 'providerOfferResponseEnabled', {
              type: 'boolean',
              description: 'Temporarily stop new offers when the response-point threshold is reached',
            })}
            {Number(config.providerOfferResponseWarnPoints) >=
              Number(config.providerOfferResponseThresholdPoints) && (
              <p className="text-xs font-medium text-red-600 sm:col-span-2 lg:col-span-3">
                Warning points must be lower than the block threshold.
              </p>
            )}
          </Section>

          <Section title="Artisan Job Settings" description="Bidding window, job limits, and cancellation policy">
            {field('Bid Collection Window', 'jobBidWindowSecs', { description: 'How long the job stays open for bids' })}
            {field('Offer Delivery Window', 'jobOfferDeliveryWindowSecs', {
              description: 'Time an exact job offer has to reach the artisan; undelivered offers are excluded from response points',
            })}
            {field('Offer Response Window', 'jobOfferResponseWindowSecs', {
              description: 'Fresh decision time after the artisan receipt is recorded',
            })}
            {field('Max Bids Per Job', 'jobMaxBids', { description: 'Client sees top N bids to choose from' })}
            {field('Free Cancellation Window', 'jobCancellationFreeWindowSecs', { description: 'Stored for later policy activation; currently not applied', disabled: true })}
            {field('Cancellation Fee (%)', 'jobCancellationFeePercent', { description: 'Automatic fees and transfers are currently paused', disabled: true })}
            {field('High Bid Review Threshold', 'jobHighBidFlagPesewas', { description: 'Bids above this are flagged for admin review' })}
            {(Number(config.jobOfferDeliveryWindowSecs) > Number(config.jobBidWindowSecs) ||
              Number(config.jobOfferResponseWindowSecs) > Number(config.jobBidWindowSecs)) && (
              <p className="text-xs font-medium text-red-600 sm:col-span-2 lg:col-span-3">
                Job offer delivery and response windows cannot exceed the bid collection window.
              </p>
            )}
          </Section>

          <Section
            title="Manual Assignment Timing"
            description="Server-owned deadlines; mobile and Admin receive absolute timestamps, so changing these requires no app release"
          >
            {field('Admin Assignment SLA', 'jobAdminAssignmentSlaSecs', {
              description: 'Time before an unassigned job is highlighted as overdue',
            })}
            {field('Assignment Edit Lock', 'jobAdminAssignmentLockSecs', {
              description: 'How long one admin holds the assignment editor lease',
            })}
            {field('Artisan Quote Deadline', 'jobDirectedQuoteWindowSecs', {
              description: 'Time a directed artisan has to submit a quote',
            })}
            {field('Client Reminder', 'jobDirectedAcceptReminderSecs', {
              description: 'Time after quote approval before reminding the client',
            })}
            {field('Client Acceptance Deadline', 'jobDirectedAcceptWindowSecs', {
              description: 'Time the client has to accept the directed quote',
            })}
            {field('Total Assignment Window', 'jobManualAssignmentTotalWindowSecs', {
              description: 'Maximum elapsed time across directed attempts before escalation',
            })}
            {field('Maximum Assignment Attempts', 'jobManualAssignmentMaxAttempts', {
              description: 'Directed artisans tried before the job requires escalation',
            })}
            {Number(config.jobDirectedAcceptReminderSecs) >=
              Number(config.jobDirectedAcceptWindowSecs) && (
              <p className="text-xs font-medium text-red-600 sm:col-span-2 lg:col-span-3">
                Client reminder must happen before the acceptance deadline.
              </p>
            )}
          </Section>

          <Section
            title="Announcement Safety"
            description="Review-token timing for admin-authored push campaigns"
          >
            {field('Announcement Preview Expiry', 'announcementPreviewTtlSecs', {
              description: 'How long a reviewed, single-use preview token remains valid',
            })}
          </Section>

          <Section title="Job Staleness Escalation" description="Thresholds that trigger notifications and freezes for inactive jobs">
            {field('Check-in Alert', 'jobStalenessCheckinHours', { description: 'Both parties notified when job goes inactive' })}
            {field('Escalation Threshold', 'jobStalenessEscalationHours', { description: 'Admin alerted for manual review' })}
            {field('Payout Freeze Threshold', 'jobStalenessPayoutFreezeHours', { description: 'Escrow payout frozen until resolved' })}
          </Section>

          <Section title="Provider Behaviour Thresholds" description="Automatic suspension and rating-based intervention rules">
            {field('Min Artisan Service Radius (km)', 'artisanMinServiceRadiusKm', { description: 'Smallest radius an artisan can set' })}
            {field('Cancellation Suspension Count', 'cancellationSuspensionCount', { description: 'Cancellation counters and automatic suspensions are currently paused', disabled: true })}
            {field('Cancellation Rolling Period (days)', 'cancellationRollingPeriodDays', { description: 'Stored for later policy activation; currently not applied', disabled: true })}
            {field('Rating Warning Threshold (stars)', 'ratingWarningThreshold', { description: 'Warning sent below this average' })}
            {field('Rating Suspension Threshold (stars)', 'ratingSuspensionThreshold', { description: 'Auto-suspend below this average' })}
            {field('Min Ratings for Threshold', 'ratingMinJobsForThreshold', { description: 'Ignore thresholds until provider has this many ratings' })}
          </Section>

          <Section title="Payment & Payouts" description="Batch payout schedule, refund limits, and escrow retry logic">
            {field('Daily Batch Payout Time (HH:MM)', 'batchPayoutTime', { type: 'text', description: 'UTC time. Providers paid once daily.' })}
            {field('Refund Threshold for Support Agents', 'refundApprovalThresholdPesewas', { description: 'Refunds above this need Ops Admin approval' })}
            {field('Micro-Escrow Retry Interval', 'microEscrowRetryIntervalMins', { description: 'How often failed escrow releases are retried' })}
            {field('Money owed write-off threshold', 'clawbackWriteoffThresholdPesewas', { description: 'Small amounts owed are cleared automatically' })}
            {field('Money owed write-off inactivity', 'clawbackWriteoffInactiveDays', { description: 'Cleared after this many inactive days' })}
          </Section>

          <Section title="Safety & Emergency" description="Emergency dial, share links, and welfare check timeouts">
            {field('Emergency Auto-Dial Number', 'emergencyAutoDialNumber', { type: 'text', description: 'Dialled when SOS button is pressed. Ghana Police: 191.' })}
            {field('Share Link Expiry Buffer', 'shareTokenExpiryBufferMins', { description: 'How long share links stay valid after booking ends' })}
            {field('Welfare Check Timeout', 'welfareCheckTimeoutHours', { description: '"Arrived" with no further activity triggers a welfare check' })}
          </Section>
        </div>

        {/* Confirm dialog */}
        <ConfirmDialog
          open={confirmDialog}
          onClose={() => setConfirmDialog(false)}
          title={`Save ${changedKeys.length} configuration change${changedKeys.length !== 1 ? 's' : ''}?`}
          description="These settings take effect according to each control. Runtime switches may affect eligible in-progress bookings. This action will be recorded in the audit trail."
          confirmLabel="Save changes"
          onConfirm={() => handleSave()}
        >
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 px-3 py-1">
            {changedKeys.map(k => (
              <DiffRow key={k} configKey={k} oldVal={saved[k]} newVal={config[k]} />
            ))}
          </div>
        </ConfirmDialog>
      </div>
    </PageGuard>
  )
}
