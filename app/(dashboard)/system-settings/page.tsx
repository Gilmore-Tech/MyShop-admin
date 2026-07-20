'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Zap, Globe, Lock, Plug, AlertTriangle,
  Save, Loader2, RefreshCw, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAllConfig, updateConfig } from '@/lib/api'

// ─── Config keys managed by this page ────────────────────────────────────────

const BOOL_DEFAULTS = {
  maintenance_mode:            false,
  rides_enabled:               true,
  artisan_jobs_enabled:        true,
  new_registrations_enabled:   true,
  momo_payments_enabled:       true,
  cash_payments_enabled:       true,
  require_2fa_admins:          false,
} as const

const NUM_DEFAULTS = {
  admin_session_timeout_mins:  480,
} as const

const STR_DEFAULTS = {
  default_language:            'en',
  pilot_region:                'Ashanti',
  support_email:               'support@gilmoretechnologies.com.gh',
  support_phone:               '+233 XX XXX XXXX',
} as const

type BoolKey = keyof typeof BOOL_DEFAULTS
type NumKey  = keyof typeof NUM_DEFAULTS
type StrKey  = keyof typeof STR_DEFAULTS

type SettingsState = {
  [K in BoolKey]: boolean
} & {
  [K in NumKey]: number
} & {
  [K in StrKey]: string
}

const FULL_DEFAULTS: SettingsState = {
  ...Object.fromEntries(Object.entries(BOOL_DEFAULTS).map(([k, v]) => [k, v])) as Record<BoolKey, boolean>,
  ...Object.fromEntries(Object.entries(NUM_DEFAULTS).map(([k, v]) => [k, v]))   as Record<NumKey, number>,
  ...Object.fromEntries(Object.entries(STR_DEFAULTS).map(([k, v]) => [k, v]))   as Record<StrKey, string>,
}

function parseServerValue(key: string, value: string): boolean | number | string {
  if (key in BOOL_DEFAULTS) return value === 'true' || value === '1'
  if (key in NUM_DEFAULTS)  return Number(value)
  return value
}

function serverToState(items: { key: string; value: string }[]): Partial<SettingsState> {
  const result: Partial<SettingsState> = {}
  for (const { key, value } of items) {
    if (key in FULL_DEFAULTS) {
      (result as Record<string, unknown>)[key] = parseServerValue(key, value)
    }
  }
  return result
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, disabled, danger,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? danger ? 'bg-red-500 focus-visible:ring-red-500' : 'bg-orange-500 focus-visible:ring-orange-500'
          : 'bg-gray-200 focus-visible:ring-gray-400'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, description, icon, children }: {
  title: string; description?: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-gray-400">{icon}</span>}
          <div>
            <CardTitle className="text-sm font-semibold text-gray-900">{title}</CardTitle>
            {description && <CardDescription className="text-[11px] mt-0.5">{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        {children}
      </CardContent>
    </Card>
  )
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({ label, description, checked, onChange, danger, dirty }: {
  label: string; description?: string; checked: boolean
  onChange: (v: boolean) => void; danger?: boolean; dirty?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {dirty && <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700">unsaved</span>}
        </div>
        {description && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} danger={danger} />
    </div>
  )
}

// ─── Integration status card ──────────────────────────────────────────────────

type IntegStatus = 'operational' | 'degraded' | 'offline' | 'unknown'

const STATUS_META: Record<IntegStatus, { label: string; dot: string; text: string }> = {
  operational: { label: 'Operational', dot: 'bg-gray-400', text: 'text-gray-600' },
  degraded:    { label: 'Degraded',    dot: 'bg-gray-400', text: 'text-gray-600' },
  offline:     { label: 'Offline',     dot: 'bg-gray-400', text: 'text-gray-600' },
  unknown:     { label: 'Unknown',     dot: 'bg-gray-300', text: 'text-gray-400' },
}

function IntegCard({ name, description, status }: { name: string; description: string; status: IntegStatus }) {
  const m = STATUS_META[status]
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`w-2 h-2 rounded-full ${m.dot}`} />
        <span className={`text-xs font-semibold ${m.text}`}>{m.label}</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SettingsState>({ ...FULL_DEFAULTS })
  const [saved, setSaved]       = useState<SettingsState>({ ...FULL_DEFAULTS })
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const allKeys = Object.keys(FULL_DEFAULTS) as (BoolKey | NumKey | StrKey)[]
  const changedKeys = allKeys.filter(k => String(settings[k]) !== String(saved[k]))
  const dirty = changedKeys.length > 0

  // Warn on tab close if unsaved
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const load = useCallback(() => {
    setLoading(true); setLoadError(false)
    getAllConfig()
      .then(items => {
        const from = serverToState(items)
        const merged = { ...FULL_DEFAULTS, ...from }
        setSettings(merged); setSaved(merged)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function setBool(key: BoolKey, value: boolean) {
    setSettings(p => ({ ...p, [key]: value }))
    setSaveSuccess(false); setSaveError(null)
  }
  function setNum(key: NumKey, value: string) {
    setSettings(p => ({ ...p, [key]: Number(value) }))
    setSaveSuccess(false); setSaveError(null)
  }
  function setStr(key: StrKey, value: string) {
    setSettings(p => ({ ...p, [key]: value }))
    setSaveSuccess(false); setSaveError(null)
  }

  function isDirty(key: BoolKey | NumKey | StrKey) {
    return String(settings[key]) !== String(saved[key])
  }

  async function handleSave() {
    setConfirmOpen(false); setSaving(true); setSaveError(null)
    try {
      await Promise.all(
        changedKeys.map(k => {
          const val = settings[k]
          return updateConfig(k, String(val))
        })
      )
      setSaved({ ...settings }); setSaveSuccess(true)
    } catch {
      setSaveError('Some settings could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="System Settings" subtitle="Platform-wide toggles and infrastructure settings." />
        <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading settings…</span>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="System Settings" subtitle="Platform-wide toggles and infrastructure settings." />
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-gray-500">Failed to load settings from the server.</p>
          <Button variant="outline" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <PageGuard permission="manage_admins">
      <div>
        <PageHeader
          title="System Settings"
          subtitle="Platform-wide toggles, security policies, and integration status."
          actions={
            <div className="flex items-center gap-3">
              {saveSuccess && !dirty && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Saved
                </span>
              )}
              {saveError && <span className="text-sm text-red-500">{saveError}</span>}
              {dirty && (
                <Button variant="ghost" size="sm" className="text-gray-500" onClick={() => { setSettings({ ...saved }); setSaveError(null); setSaveSuccess(false) }}>
                  Discard
                </Button>
              )}
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!dirty || saving}
                className="gap-2 text-white"
                style={{ backgroundColor: dirty ? '#F5A623' : undefined }}
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : <><Save className="h-4 w-4" /> Save {dirty ? `(${changedKeys.length})` : 'Changes'}</>}
              </Button>
            </div>
          }
        />

        {dirty && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm bg-amber-50 border border-amber-200 text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {changedKeys.length} unsaved change{changedKeys.length !== 1 ? 's' : ''} - save before navigating away.
          </div>
        )}

        <div className="space-y-4">

          {/* ── Platform Status ─────────────────────────────────────────────── */}
          <Section
            title="Platform Status"
            description="Enable or disable core platform services globally."
            icon={<Zap className="h-4 w-4" />}
          >
            <ToggleRow
              label="Maintenance Mode"
              description="Blocks all client and provider app access. Show a maintenance screen to all users."
              checked={settings.maintenance_mode}
              onChange={v => setBool('maintenance_mode', v)}
              danger
              dirty={isDirty('maintenance_mode')}
            />
            <ToggleRow
              label="Ride Hailing"
              description="Allow clients to book rides and drivers to receive requests."
              checked={settings.rides_enabled}
              onChange={v => setBool('rides_enabled', v)}
              dirty={isDirty('rides_enabled')}
            />
            <ToggleRow
              label="Artisan Jobs"
              description="Allow clients to post artisan jobs and artisans to place bids."
              checked={settings.artisan_jobs_enabled}
              onChange={v => setBool('artisan_jobs_enabled', v)}
              dirty={isDirty('artisan_jobs_enabled')}
            />
            <ToggleRow
              label="New User Registrations"
              description="Allow new clients and providers to register. Disable during invite-only periods."
              checked={settings.new_registrations_enabled}
              onChange={v => setBool('new_registrations_enabled', v)}
              dirty={isDirty('new_registrations_enabled')}
            />
          </Section>

          {/* ── Payments ────────────────────────────────────────────────────── */}
          <Section
            title="Payment Methods"
            description="Control which payment methods are available at checkout."
            icon={<Globe className="h-4 w-4" />}
          >
            <ToggleRow
              label="Mobile Money (MoMo)"
              description="MTN, Vodafone, AirtelTigo MoMo payments."
              checked={settings.momo_payments_enabled}
              onChange={v => setBool('momo_payments_enabled', v)}
              dirty={isDirty('momo_payments_enabled')}
            />
            <ToggleRow
              label="Cash on Delivery"
              description="Allow clients to pay the provider in cash at the end of a job or ride."
              checked={settings.cash_payments_enabled}
              onChange={v => setBool('cash_payments_enabled', v)}
              dirty={isDirty('cash_payments_enabled')}
            />
          </Section>

          {/* ── Security ────────────────────────────────────────────────────── */}
          <Section
            title="Security"
            description="Admin authentication and session policies."
            icon={<Lock className="h-4 w-4" />}
          >
            <ToggleRow
              label="Require 2FA for All Admins"
              description="Enforce two-factor authentication on next login. Admins without 2FA set up will be locked out."
              checked={settings.require_2fa_admins}
              onChange={v => setBool('require_2fa_admins', v)}
              dirty={isDirty('require_2fa_admins')}
            />

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium text-gray-800">Admin Session Timeout (minutes)</Label>
                {isDirty('admin_session_timeout_mins') && (
                  <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700">unsaved</span>
                )}
              </div>
              <p className="text-xs text-gray-400">Idle admins are logged out after this many minutes. Min 15, max 1440 (24 hr).</p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={15}
                  max={1440}
                  value={settings.admin_session_timeout_mins}
                  onChange={e => setNum('admin_session_timeout_mins', e.target.value)}
                  className={`w-36 h-8 text-sm ${isDirty('admin_session_timeout_mins') ? 'ring-2 ring-amber-200 border-amber-300' : ''}`}
                />
                <span className="text-xs text-gray-400">
                  = {(settings.admin_session_timeout_mins / 60).toFixed(1).replace(/\.0$/, '')} hr
                </span>
              </div>
            </div>
          </Section>

          {/* ── Regional & Localisation ──────────────────────────────────────── */}
          <Section
            title="Regional & Localisation"
            description="Default locale, pilot region, and contact information."
            icon={<Globe className="h-4 w-4" />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-gray-800">Default Language</Label>
                  {isDirty('default_language') && (
                    <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700">unsaved</span>
                  )}
                </div>
                <Select value={settings.default_language} onValueChange={v => setStr('default_language', v)}>
                  <SelectTrigger className="w-44 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="tw">Twi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-gray-800">Pilot Region</Label>
                  {isDirty('pilot_region') && (
                    <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700">unsaved</span>
                  )}
                </div>
                <Input
                  value={settings.pilot_region}
                  onChange={e => setStr('pilot_region', e.target.value)}
                  className={`w-44 h-8 text-sm ${isDirty('pilot_region') ? 'ring-2 ring-amber-200 border-amber-300' : ''}`}
                  placeholder="e.g. Ashanti"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-gray-800">Support Email</Label>
                  {isDirty('support_email') && (
                    <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700">unsaved</span>
                  )}
                </div>
                <Input
                  type="email"
                  value={settings.support_email}
                  onChange={e => setStr('support_email', e.target.value)}
                  className={`w-64 h-8 text-sm ${isDirty('support_email') ? 'ring-2 ring-amber-200 border-amber-300' : ''}`}
                  placeholder="support@gilmoretechnologies.com.gh"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-gray-800">Support Phone</Label>
                  {isDirty('support_phone') && (
                    <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700">unsaved</span>
                  )}
                </div>
                <Input
                  type="tel"
                  value={settings.support_phone}
                  onChange={e => setStr('support_phone', e.target.value)}
                  className={`w-64 h-8 text-sm ${isDirty('support_phone') ? 'ring-2 ring-amber-200 border-amber-300' : ''}`}
                  placeholder="+233 XX XXX XXXX"
                />
              </div>
            </div>
          </Section>

          {/* ── Integrations ─────────────────────────────────────────────────── */}
          <Section
            title="Integrations"
            description="Status of external services connected to the platform."
            icon={<Plug className="h-4 w-4" />}
          >
            <div className="-mt-2">
              <IntegCard name="Firebase Cloud Messaging" description="Push notifications to client and provider apps" status="operational" />
              <IntegCard name="Arkesel SMS" description="OTP delivery and transactional SMS (sender: MyShop)" status="operational" />
              <IntegCard name="Mobile Money (MoMo)" description="MTN, Vodafone Cash, AirtelTigo payouts via payment gateway" status="operational" />
              <IntegCard name="Google Maps" description="Admin map rendering (live ops, emergency, dispute routes), geocoding, distance matrix, and route planning" status="operational" />
              <IntegCard name="Mapbox" description="Artisan navigation tiles in the mobile provider app" status="operational" />
              <IntegCard name="Cloudinary" description="Provider document and image storage" status="operational" />
              <IntegCard name="Neon PostgreSQL" description="Primary database (Neon serverless, eu-central-1)" status="operational" />
            </div>
            <p className="text-[11px] text-gray-400 pt-1">
              Integration status is updated every 5 minutes. Contact engineering if a service shows degraded or offline.
            </p>
          </Section>

          {/* ── About ────────────────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#F5A623' }}>
                    <span className="text-white font-bold text-sm">M</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">MyShop Admin Console</p>
                    <p className="text-xs text-gray-400">v1.0.0 | Gilmore Technologies | Pilot - Ashanti Region, Ghana</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    <span>JWT Auth</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last deploy: -</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* ── Confirm dialog ────────────────────────────────────────────────── */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Save {changedKeys.length} System Setting{changedKeys.length !== 1 ? 's' : ''}
              </DialogTitle>
              <DialogDescription>
                Some changes (maintenance mode, feature toggles) take effect immediately for all users.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100 text-xs overflow-hidden">
              {changedKeys.map(k => (
                <div key={k} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-2">
                  <span className="font-mono text-gray-500 truncate">{k}</span>
                  <span className="text-gray-300">-&gt;</span>
                  <div className="flex items-center gap-2">
                    <span className="line-through text-gray-400">{String(saved[k as keyof SettingsState])}</span>
                    <span className="font-semibold text-gray-800">{String(settings[k as keyof SettingsState])}</span>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} className="text-white gap-2" style={{ backgroundColor: '#F5A623' }}>
                <Save className="h-4 w-4" /> Confirm & Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </PageGuard>
  )
}
