'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useState, useEffect, useCallback } from 'react'
import { Save, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { getAllConfig, updateConfig } from '@/lib/api'

// ─── Key conversion ───────────────────────────────────────────────────────────
// Backend stores keys as snake_case, UI uses camelCase

function toSnake(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase()
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

// ─── Default / fallback values ────────────────────────────────────────────────

const DEFAULTS = {
  commissionRatePercent: 20,
  rideBaseFarePesewas: 300,
  ridePerKmPesewas: 150,
  ridePerMinPesewas: 20,
  rideCancellationWindowSecs: 180,
  rideDriverAcceptanceWindowSecs: 15,
  rideInitialMatchRadiusKm: 3,
  rideRadiusExpansionKm: 2,
  rideMaxMatchRadiusKm: 10,
  jobBidWindowSecs: 300,
  jobMaxBids: 3,
  jobCancellationFreeWindowSecs: 1800,
  jobCancellationFeePercent: 20,
  jobHighBidFlagPesewas: 500000,
  jobStalenessCheckinHours: 8,
  jobStalenessEscalationHours: 24,
  jobStalenessPayoutFreezeHours: 48,
  artisanMinServiceRadiusKm: 3,
  cancellationSuspensionThreshold: 3,
  cancellationRollingPeriodDays: 30,
  ratingWarningThreshold: 3.5,
  ratingSuspensionThreshold: 3.0,
  ratingMinJobsForThreshold: 15,
  refundApprovalThresholdPesewas: 50000,
  batchPayoutTime: '18:00',
  microEscrowRetryIntervalMins: 30,
  clawbackWriteoffThresholdPesewas: 10000,
  clawbackWriteoffInactiveDays: 90,
  emergencyAutoDialNumber: '191',
  shareTokenExpiryBufferMins: 30,
  welfareCheckTimeoutHours: 3,
} as const

type ConfigKey = keyof typeof DEFAULTS
type ConfigState = { [K in ConfigKey]: string | number }

function serverToState(items: { key: string; value: string }[]): Partial<ConfigState> {
  const result: Partial<ConfigState> = {}
  for (const { key, value } of items) {
    const camel = toCamel(key) as ConfigKey
    if (camel in DEFAULTS) {
      const def = DEFAULTS[camel]
      result[camel] = typeof def === 'number' ? Number(value) : value
    }
  }
  return result
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfigField({
  label, configKey, value, original, onChange, type = 'number', description,
}: {
  label: string
  configKey: ConfigKey
  value: string | number
  original: string | number
  onChange: (k: ConfigKey, v: string) => void
  type?: string
  description?: string
}) {
  const isDirty = String(value) !== String(original)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium text-gray-900">{label}</Label>
        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved change" />}
      </div>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <Input
        type={type}
        value={value}
        onChange={e => onChange(configKey, e.target.value)}
        className={`max-w-48 ${isDirty ? 'ring-2 ring-amber-300' : ''}`}
      />
    </div>
  )
}

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {children}
        </div>
      </CardContent>
    </Card>
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

  const dirty = Object.keys(config).some(
    k => String(config[k as ConfigKey]) !== String(saved[k as ConfigKey])
  )

  const changedKeys = (Object.keys(config) as ConfigKey[]).filter(
    k => String(config[k]) !== String(saved[k])
  )

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
    setConfig(prev => ({ ...prev, [key]: typeof def === 'number' ? Number(value) : value }))
    setSaveSuccess(false)
    setSaveError(null)
  }

  async function handleSave() {
    setConfirmDialog(false)
    setSaving(true)
    setSaveError(null)
    try {
      await Promise.all(
        changedKeys.map(k => updateConfig(toSnake(k), String(config[k])))
      )
      setSaved({ ...config })
      setSaveSuccess(true)
    } catch {
      setSaveError('Some settings could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
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
        subtitle="Adjust platform business rules. All changes apply to new bookings only — never retroactive."
        actions={
          <div className="flex items-center gap-3">
            {saveSuccess && !dirty && (
              <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>
            )}
            {saveError && (
              <span className="text-sm text-red-500">{saveError}</span>
            )}
            <Button
              onClick={() => setConfirmDialog(true)}
              disabled={!dirty || saving}
              className="gap-2 text-white"
              style={{ backgroundColor: dirty ? '#F5A623' : undefined }}
            >
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><Save className="h-4 w-4" /> Save Changes {dirty ? `(${changedKeys.length})` : ''}</>
              }
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        <Section title="Commission" description="Platform revenue settings">
          <ConfigField label="Commission Rate (%)" configKey="commissionRatePercent" value={config.commissionRatePercent} original={saved.commissionRatePercent} onChange={handleChange} description="Applied to pre-promo fare. Currently 20%." />
        </Section>

        <Section title="Ride Settings" description="Fare formula and operational parameters">
          <ConfigField label="Base Fare (pesewas)" configKey="rideBaseFarePesewas" value={config.rideBaseFarePesewas} original={saved.rideBaseFarePesewas} onChange={handleChange} description="GHS 3.00 default" />
          <ConfigField label="Per Km Rate (pesewas)" configKey="ridePerKmPesewas" value={config.ridePerKmPesewas} original={saved.ridePerKmPesewas} onChange={handleChange} description="GHS 1.50 default" />
          <ConfigField label="Per Minute Rate (pesewas)" configKey="ridePerMinPesewas" value={config.ridePerMinPesewas} original={saved.ridePerMinPesewas} onChange={handleChange} description="GHS 0.20 default" />
          <ConfigField label="Free Cancellation Window (secs)" configKey="rideCancellationWindowSecs" value={config.rideCancellationWindowSecs} original={saved.rideCancellationWindowSecs} onChange={handleChange} description="3 minutes = 180s" />
          <ConfigField label="Driver Acceptance Window (secs)" configKey="rideDriverAcceptanceWindowSecs" value={config.rideDriverAcceptanceWindowSecs} original={saved.rideDriverAcceptanceWindowSecs} onChange={handleChange} description="Default 15s" />
          <ConfigField label="Initial Match Radius (km)" configKey="rideInitialMatchRadiusKm" value={config.rideInitialMatchRadiusKm} original={saved.rideInitialMatchRadiusKm} onChange={handleChange} />
          <ConfigField label="Radius Expansion Step (km)" configKey="rideRadiusExpansionKm" value={config.rideRadiusExpansionKm} original={saved.rideRadiusExpansionKm} onChange={handleChange} />
          <ConfigField label="Max Match Radius (km)" configKey="rideMaxMatchRadiusKm" value={config.rideMaxMatchRadiusKm} original={saved.rideMaxMatchRadiusKm} onChange={handleChange} />
        </Section>

        <Section title="Provider Settings" description="Provider operational rules">
          <ConfigField label="Min Artisan Service Radius (km)" configKey="artisanMinServiceRadiusKm" value={config.artisanMinServiceRadiusKm} original={saved.artisanMinServiceRadiusKm} onChange={handleChange} />
          <ConfigField label="Cancellation Suspension Threshold" configKey="cancellationSuspensionThreshold" value={config.cancellationSuspensionThreshold} original={saved.cancellationSuspensionThreshold} onChange={handleChange} description="3 cancellations triggers suspension" />
          <ConfigField label="Cancellation Rolling Period (days)" configKey="cancellationRollingPeriodDays" value={config.cancellationRollingPeriodDays} original={saved.cancellationRollingPeriodDays} onChange={handleChange} />
          <ConfigField label="Rating Warning Threshold (stars)" configKey="ratingWarningThreshold" value={config.ratingWarningThreshold} original={saved.ratingWarningThreshold} onChange={handleChange} description="Default 3.5 stars, min 15 jobs" />
          <ConfigField label="Rating Suspension Threshold (stars)" configKey="ratingSuspensionThreshold" value={config.ratingSuspensionThreshold} original={saved.ratingSuspensionThreshold} onChange={handleChange} description="Default 3.0 stars" />
          <ConfigField label="Min Jobs for Rating Threshold" configKey="ratingMinJobsForThreshold" value={config.ratingMinJobsForThreshold} original={saved.ratingMinJobsForThreshold} onChange={handleChange} />
        </Section>

        <Section title="Artisan Job Settings" description="Bidding and job lifecycle rules">
          <ConfigField label="Bid Collection Window (secs)" configKey="jobBidWindowSecs" value={config.jobBidWindowSecs} original={saved.jobBidWindowSecs} onChange={handleChange} description="5 minutes = 300s" />
          <ConfigField label="Max Bids Per Job" configKey="jobMaxBids" value={config.jobMaxBids} original={saved.jobMaxBids} onChange={handleChange} />
          <ConfigField label="Free Cancellation Window (secs)" configKey="jobCancellationFreeWindowSecs" value={config.jobCancellationFreeWindowSecs} original={saved.jobCancellationFreeWindowSecs} onChange={handleChange} description="30 minutes = 1800s" />
          <ConfigField label="Cancellation Fee (%)" configKey="jobCancellationFeePercent" value={config.jobCancellationFeePercent} original={saved.jobCancellationFeePercent} onChange={handleChange} />
          <ConfigField label="High Bid Review Flag (pesewas)" configKey="jobHighBidFlagPesewas" value={config.jobHighBidFlagPesewas} original={saved.jobHighBidFlagPesewas} onChange={handleChange} description="GHS 5,000 = 500000 pesewas" />
        </Section>

        <Section title="Job Staleness Thresholds">
          <ConfigField label="Check-in Alert (hours)" configKey="jobStalenessCheckinHours" value={config.jobStalenessCheckinHours} original={saved.jobStalenessCheckinHours} onChange={handleChange} description="Default 8h — both parties notified" />
          <ConfigField label="Escalation Threshold (hours)" configKey="jobStalenessEscalationHours" value={config.jobStalenessEscalationHours} original={saved.jobStalenessEscalationHours} onChange={handleChange} description="Default 24h — admin alerted" />
          <ConfigField label="Payout Freeze Threshold (hours)" configKey="jobStalenessPayoutFreezeHours" value={config.jobStalenessPayoutFreezeHours} original={saved.jobStalenessPayoutFreezeHours} onChange={handleChange} description="Default 48h — payout frozen" />
        </Section>

        <Section title="Payment Settings">
          <ConfigField label="Batch Payout Time (HH:MM)" configKey="batchPayoutTime" value={config.batchPayoutTime} original={saved.batchPayoutTime} onChange={handleChange} type="text" description="Daily payout batch time (GMT)" />
          <ConfigField label="Refund Threshold for Support Agents (pesewas)" configKey="refundApprovalThresholdPesewas" value={config.refundApprovalThresholdPesewas} original={saved.refundApprovalThresholdPesewas} onChange={handleChange} description="Above this requires Ops Admin approval" />
          <ConfigField label="Micro-Escrow Retry Interval (mins)" configKey="microEscrowRetryIntervalMins" value={config.microEscrowRetryIntervalMins} original={saved.microEscrowRetryIntervalMins} onChange={handleChange} />
          <ConfigField label="Clawback Write-off Threshold (pesewas)" configKey="clawbackWriteoffThresholdPesewas" value={config.clawbackWriteoffThresholdPesewas} original={saved.clawbackWriteoffThresholdPesewas} onChange={handleChange} description="GHS 100 = 10000 pesewas" />
          <ConfigField label="Clawback Write-off Inactivity (days)" configKey="clawbackWriteoffInactiveDays" value={config.clawbackWriteoffInactiveDays} original={saved.clawbackWriteoffInactiveDays} onChange={handleChange} />
        </Section>

        <Section title="Safety Settings">
          <ConfigField label="Emergency Auto-Dial Number" configKey="emergencyAutoDialNumber" value={config.emergencyAutoDialNumber} original={saved.emergencyAutoDialNumber} onChange={handleChange} type="text" description="Ghana Police: 191" />
          <ConfigField label="Share Link Expiry Buffer (mins)" configKey="shareTokenExpiryBufferMins" value={config.shareTokenExpiryBufferMins} original={saved.shareTokenExpiryBufferMins} onChange={handleChange} description="After ride/job completion" />
          <ConfigField label="Welfare Check Timeout (hours)" configKey="welfareCheckTimeoutHours" value={config.welfareCheckTimeoutHours} original={saved.welfareCheckTimeoutHours} onChange={handleChange} description="'Arrived' with no activity" />
        </Section>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Save Configuration Changes
            </DialogTitle>
            <DialogDescription>
              You are about to update <strong>{changedKeys.length} setting{changedKeys.length !== 1 ? 's' : ''}</strong>.
              These changes will apply to <strong>all new bookings</strong> from this point forward.
              Existing bookings are not affected. This action will be logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-gray-500 space-y-1 max-h-40 overflow-y-auto">
            {changedKeys.map(k => (
              <div key={k} className="flex items-center justify-between gap-4 py-0.5">
                <span className="font-mono">{toSnake(k)}</span>
                <span>
                  <span className="line-through text-gray-400">{String(saved[k])}</span>
                  {' → '}
                  <span className="font-semibold text-gray-700">{String(config[k])}</span>
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} style={{ backgroundColor: '#F5A623' }} className="text-white">
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </PageGuard>
  )
}
