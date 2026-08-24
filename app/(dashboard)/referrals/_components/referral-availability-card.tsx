'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Power, RotateCcw } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { getAllConfig, updateConfig } from '@/lib/api'
import { RoleGate } from '@/components/common/role-gate'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const REFERRALS_ENABLED_KEY = 'role_account_referrals_enabled'

function parseConfigBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return null
}

export function ReferralAvailabilityCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const configs = await getAllConfig()
      const config = configs.find((item) => item.key === REFERRALS_ENABLED_KEY)
      if (!config) {
        setEnabled(null)
        setError(
          'The referral availability key is missing. Deploy and verify the role-owned-referrals database migration first.',
        )
        return
      }

      const nextEnabled = parseConfigBoolean(config.value)
      setEnabled(nextEnabled)
      if (nextEnabled === null) {
        setError('The referral availability value is invalid. It must be the JSON boolean true or false.')
      }
    } catch (caught) {
      setEnabled(null)
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not load referral availability.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (enabled === null) return
    setSaving(true)
    setError(null)
    try {
      const nextEnabled = !enabled
      await updateConfig(REFERRALS_ENABLED_KEY, String(nextEnabled))
      setEnabled(nextEnabled)
      setConfirming(false)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not update referral availability.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-gray-50 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50">
              <Power className="h-4 w-4 text-orange-500" />
            </span>
            <div>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Referral accounts
              </CardTitle>
              <CardDescription className="mt-0.5 text-[11px]">
                Runtime database gate for role-owned referral codes, histories, and awards
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading referral availability...
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      enabled === true
                        ? 'bg-emerald-500'
                        : enabled === false
                          ? 'bg-gray-400'
                          : 'bg-red-500'
                    }`}
                  />
                  <p className="font-semibold text-gray-900">
                    {enabled === true ? 'Enabled' : enabled === false ? 'Disabled' : 'Unavailable'}
                  </p>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  This database switch is independent of the Render{' '}
                  <code>FF_ROLE_ACCOUNT_REFERRALS</code> environment variable.
                </p>
                {error && (
                  <p className="mt-2 flex max-w-2xl items-start gap-1.5 text-xs text-red-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {error}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {enabled === null && (
                  <Button size="sm" variant="outline" onClick={() => void load()}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
                {enabled !== null && (
                  <RoleGate permission="view_config">
                    <Button
                      size="sm"
                      variant={enabled ? 'outline' : 'default'}
                      className={!enabled ? 'bg-orange-500 text-white hover:bg-orange-600' : ''}
                      onClick={() => setConfirming(true)}
                    >
                      {enabled ? 'Disable referrals' : 'Enable referrals'}
                    </Button>
                  </RoleGate>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirming} onOpenChange={(open) => !saving && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{enabled ? 'Disable referral accounts?' : 'Enable referral accounts?'}</DialogTitle>
            <DialogDescription>
              {enabled
                ? 'Mobile referral accounts, code linking, and new referral awards will be stopped by the database gate.'
                : 'Only continue after the role-owned-referrals migration has passed verification and FF_ROLE_ACCOUNT_REFERRALS=true is deployed on the matching API environment.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving}
              className={!enabled ? 'bg-orange-500 text-white hover:bg-orange-600' : ''}
              variant={enabled ? 'destructive' : 'default'}
              onClick={() => void save()}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {enabled ? 'disable' : 'enable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
