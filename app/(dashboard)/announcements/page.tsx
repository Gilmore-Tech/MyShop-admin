'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useCallback, useEffect, useState } from 'react'
import { BellRing, Car, Send, User, Users, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import { FormDialog } from '@/components/common/form-dialog'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import {
  getAnnouncementHistory,
  previewAnnouncement,
  publishAnnouncement,
  type AnnouncementAudience,
  type AnnouncementClassification,
  type AnnouncementDestination,
  type AnnouncementDraft,
  type AnnouncementHistoryItem,
  type AnnouncementPreview,
} from '@/lib/api'
import { userSafeAdminError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import { formatDateTime } from '@/lib/format-date'

const AUDIENCE: {
  value: AnnouncementAudience
  label: string
  sub: string
  icon: React.ElementType
  colors: string
  active: string
}[] = [
  { value: 'all', label: 'All users', sub: 'Clients - Drivers - Artisans', icon: Users, colors: ' text-gray-600 hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'clients', label: 'Clients', sub: 'App users who book', icon: User, colors: ' text-gray-600 hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'drivers', label: 'Drivers', sub: 'Registered ride drivers', icon: Car, colors: ' text-gray-600 hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'artisans', label: 'Artisans', sub: 'Service providers', icon: Wrench, colors: ' text-gray-600 hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
]

const DESTINATION_LABELS: Record<AnnouncementDestination, string> = {
  notifications: 'Notifications',
  activity: 'Activity',
  support: 'Support',
  promotions: 'Promotions',
  app_store: 'App store',
}

function statusClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'completed' || normalized === 'sent') return 'bg-emerald-50 text-emerald-700'
  if (normalized === 'failed') return 'bg-red-50 text-red-700'
  if (normalized === 'partial') return 'bg-amber-50 text-amber-700'
  return 'bg-blue-50 text-blue-700'
}

export default function AnnouncementsPage() {
  const { category } = useRole()
  const lockedAudience: AnnouncementAudience | null =
    category === 'rides' ? 'drivers' : category === 'artisan' ? 'artisans' : null
  const audienceOptions = lockedAudience
    ? AUDIENCE.filter(a => a.value === lockedAudience)
    : AUDIENCE

  const [composeOpen, setComposeOpen] = useState(false)
  const [history, setHistory] = useState<AnnouncementHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const loadHistory = useCallback(() => {
    setHistoryLoading(true)
    setHistoryError(null)
    getAnnouncementHistory()
      .then(items => setHistory(items))
      .catch(err => setHistoryError(userSafeAdminError(err, 'Failed to load campaign history.')))
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const columns: DataTableColumn<AnnouncementHistoryItem>[] = [
    {
      key: 'title', header: 'Title', className: 'max-w-52',
      render: campaign => <p className="truncate text-sm font-medium text-gray-800">{campaign.title}</p>,
    },
    {
      key: 'audience', header: 'Audience',
      render: campaign => <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">{campaign.targetAudience}</span>,
    },
    {
      key: 'destination', header: 'Opens',
      render: campaign => <span className="text-xs text-gray-500 whitespace-nowrap">{DESTINATION_LABELS[campaign.destination]}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: campaign => <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap capitalize ${statusClass(campaign.status)}`}>{campaign.status}</span>,
    },
    {
      key: 'recipients', header: 'Recipients', align: 'right',
      render: campaign => <span className="text-sm font-medium text-gray-800">{campaign.recipientCount.toLocaleString()}</span>,
    },
    {
      key: 'queued', header: 'Queued',
      render: campaign => <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(campaign.queuedAt)}</span>,
    },
  ]

  return (
    <PageGuard permission="send_announcement">
      <div>
        <PageHeader
          title="Announcements"
          subtitle="Preview and publish audited push campaigns"
          actions={
            <Button variant="brand" className="gap-2" onClick={() => setComposeOpen(true)}>
              <Send className="h-4 w-4" /> Compose announcement
            </Button>
          }
        />

        <DataTable<AnnouncementHistoryItem>
          columns={columns}
          rows={history}
          rowKey={campaign => campaign.id}
          loading={historyLoading}
          error={historyError}
          onRetry={loadHistory}
          empty={<EmptyState title="No campaigns yet" description="Preview and publish your first push announcement to see it here." />}
          caption={`${history.length} campaigns`}
        />

        <ComposeDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          lockedAudience={lockedAudience}
          audienceOptions={audienceOptions}
          onPublished={() => {
            setComposeOpen(false)
            loadHistory()
          }}
        />
      </div>
    </PageGuard>
  )
}

function ComposeDialog({
  open, onClose, lockedAudience, audienceOptions, onPublished,
}: {
  open: boolean
  onClose: () => void
  lockedAudience: AnnouncementAudience | null
  audienceOptions: typeof AUDIENCE
  onPublished: () => void
}) {
  const [targetAudience, setTargetAudience] = useState<AnnouncementAudience>(lockedAudience ?? 'all')
  const [classification, setClassification] = useState<AnnouncementClassification>('service')
  const [destination, setDestination] = useState<AnnouncementDestination>('notifications')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<AnnouncementPreview | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTargetAudience(lockedAudience ?? 'all')
    setClassification('service')
    setDestination('notifications')
    setTitle('')
    setBody('')
    setReason('')
    setPreview(null)
    setError('')
  }, [open, lockedAudience])

  function invalidatePreview() {
    setPreview(null)
    setError('')
  }

  function draft(): AnnouncementDraft {
    return {
      title: title.trim(),
      body: body.trim(),
      targetAudience,
      classification,
      destination,
      reason: reason.trim(),
    }
  }

  async function handleSubmit() {
    const request = draft()
    if (!request.title || !request.body || !request.reason) return
    setSubmitting(true)
    setError('')
    try {
      if (preview == null) {
        setPreview(await previewAnnouncement(request))
      } else {
        await publishAnnouncement(request, preview.previewToken, preview.campaignId)
        onPublished()
      }
    } catch (err) {
      setError(userSafeAdminError(
        err,
        preview == null ? 'Failed to generate the server preview.' : 'Failed to publish the campaign.',
      ))
    } finally {
      setSubmitting(false)
    }
  }

  const selectedAudience = AUDIENCE.find(a => a.value === targetAudience) ?? AUDIENCE[0]
  const SelectedAudienceIcon = selectedAudience.icon
  const invalid = !title.trim() || !body.trim() || !reason.trim()

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Compose announcement"
      description="Push only. Generate the server preview and verify the audience before publishing."
      submitLabel={preview == null
        ? 'Generate server preview'
        : `Publish to ${preview.counts.activePushRecipients.toLocaleString()} devices`}
      onSubmit={handleSubmit}
      size="lg"
      loading={submitting}
      disabled={invalid}
      error={error || null}
      footerNote={preview == null
        ? 'Nothing is sent while generating a preview.'
        : 'Publishing queues this exact revision. The preview token is time-limited and single-use.'}
    >
      <div>
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Target audience</Label>
        <div className="grid grid-cols-2 gap-2">
          {audienceOptions.map(a => {
            const Icon = a.icon
            const isActive = targetAudience === a.value
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => { setTargetAudience(a.value); invalidatePreview() }}
                className={`flex items-center gap-2.5 rounded-lg p-2.5 text-left transition-all ${isActive ? a.active : a.colors}`}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isActive ? 'bg-white/60' : 'bg-gray-100'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight">{a.label}</p>
                  <p className="text-[10px] opacity-70 leading-tight mt-0.5 truncate">{a.sub}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Classification</Label>
          <Select value={classification} onValueChange={(value: AnnouncementClassification) => { setClassification(value); invalidatePreview() }}>
            <SelectTrigger className="bg-gray-50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="service">Service update</SelectItem>
              <SelectItem value="critical">Critical notice</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opens in app</Label>
          <Select value={destination} onValueChange={(value: AnnouncementDestination) => { setDestination(value); invalidatePreview() }}>
            <SelectTrigger className="bg-gray-50"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(DESTINATION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</Label>
        <Input
          placeholder="Message title..."
          value={title}
          onChange={event => { setTitle(event.target.value); invalidatePreview() }}
          maxLength={100}
        />
        <p className="text-[11px] text-gray-400 text-right">{title.length}/100</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message body</Label>
        <Textarea
          placeholder="Write your announcement..."
          rows={4}
          value={body}
          onChange={event => { setBody(event.target.value); invalidatePreview() }}
          className="resize-none"
          maxLength={500}
        />
        <p className="text-[11px] text-gray-400 text-right">{body.length}/500</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason for sending</Label>
        <Textarea
          placeholder="Internal audit reason (not shown to recipients)..."
          rows={2}
          value={reason}
          onChange={event => { setReason(event.target.value); invalidatePreview() }}
          className="resize-none"
          maxLength={500}
        />
      </div>

      {preview && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Server preview</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{preview.rendered.title}</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{preview.rendered.body}</p>
            </div>
            <BellRing className="h-5 w-5 text-blue-600 shrink-0" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PreviewCount label="Eligible" value={preview.counts.eligibleRecipients} />
            <PreviewCount label="Push devices" value={preview.counts.activePushRecipients} />
            <PreviewCount label="No token" value={preview.counts.noActiveToken} />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <SelectedAudienceIcon className="h-3 w-3" />
            <span>{selectedAudience.label}</span>
            <span>-</span>
            <span>{DESTINATION_LABELS[preview.rendered.destination]}</span>
            <span>- revision {preview.revision}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">Expires {formatDateTime(preview.previewExpiresAt)}</p>
            <button
              type="button"
              className="text-[11px] font-semibold text-blue-700 hover:text-blue-900"
              onClick={invalidatePreview}
            >
              Regenerate preview
            </button>
          </div>
        </div>
      )}
    </FormDialog>
  )
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/80 px-2 py-2">
      <p className="text-base font-semibold text-slate-900">{value.toLocaleString()}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  )
}
