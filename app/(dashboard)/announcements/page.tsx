'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useCallback, useEffect, useState } from 'react'
import { BellRing, Car, Send, User, Users, Wrench, X } from 'lucide-react'
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
  listUsers,
  previewAnnouncement,
  publishAnnouncement,
  type AnnouncementAudience,
  type AnnouncementAudienceScope,
  type AnnouncementChannel,
  type AnnouncementClassification,
  type AnnouncementDestination,
  type AnnouncementDraft,
  type AnnouncementHistoryItem,
  type AnnouncementPreview,
  type PlatformUser,
  type Region,
} from '@/lib/api'
import {
  ANNOUNCEMENT_REASON_MIN_CHARS,
  ANNOUNCEMENT_SMS_PREFIX,
  announcementIncludesPush,
  announcementIncludesSms,
  announcementSmsLength,
  announcementSmsUnitsLabel,
  announcementStatusPresentation,
  shouldClearAnnouncementPreview,
} from '@/lib/announcement-campaign-contract'
import { ApiError, userSafeAdminError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import { formatDateTime } from '@/lib/format-date'
import { useAdminRegionScope } from '@/components/admin/admin-region-scope'

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

const CHANNEL_LABELS: Record<AnnouncementChannel, string> = {
  push: 'Push notification',
  sms: 'SMS only (Arkesel)',
  sms_push: 'SMS + Push',
}

const AUDIENCE_SCOPE: Array<{
  value: AnnouncementAudienceScope
  label: string
  sub: string
}> = [
  { value: 'home_region', label: 'Home region', sub: 'Stable account region; best for regional marketing.' },
  { value: 'current_region', label: 'Currently in region', sub: 'Only accounts currently resolved inside this region.' },
  { value: 'all_regions', label: 'All regions', sub: 'Company-wide audience; Super Admin or Product Owner only.' },
  { value: 'unassigned', label: 'Unassigned clients', sub: 'Clients without reliable regional evidence.' },
  { value: 'specific_users', label: 'Specific users', sub: 'Search and select exact role accounts.' },
]

const AUDIENCE_SCOPE_LABELS = Object.fromEntries(
  AUDIENCE_SCOPE.map(option => [option.value, option.label]),
) as Record<AnnouncementAudienceScope, string>

export default function AnnouncementsPage() {
  const { activeRegion, canSelectRegion } = useAdminRegionScope()
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
  const regions: Region[] = activeRegion ? [activeRegion] : []

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
      render: campaign => (
        <div className="space-y-0.5 whitespace-nowrap">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{campaign.targetAudience}</span>
          <p className="text-[10px] text-gray-400">{AUDIENCE_SCOPE_LABELS[campaign.audienceScope]}</p>
        </div>
      ),
    },
    {
      key: 'channel', header: 'Channel',
      render: campaign => (
        <div className="whitespace-nowrap">
          <p className="text-xs text-gray-600">{CHANNEL_LABELS[campaign.channel]}</p>
          {announcementIncludesPush(campaign.channel) && (
            <p className="text-[10px] text-gray-400">Opens {DESTINATION_LABELS[campaign.destination]}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: campaign => {
        const presentation = announcementStatusPresentation(campaign.status)
        return (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${presentation.className}`}>
            {presentation.label}
          </span>
        )
      },
    },
    {
      key: 'recipients', header: 'Audience profiles', align: 'right',
      render: campaign => <span className="text-sm font-medium text-gray-800">{campaign.recipientCount.toLocaleString()}</span>,
    },
    {
      key: 'transport', header: 'Transport',
      render: campaign => (
        <div className="space-y-0.5 text-[11px] text-gray-500 whitespace-nowrap">
          {announcementIncludesPush(campaign.channel) && (
            <p>
              Push: {campaign.activePushCount.toLocaleString()} eligible, {campaign.acceptedCount.toLocaleString()} accepted
              {campaign.failedCount > 0 ? `, ${campaign.failedCount.toLocaleString()} failed` : ''}
              {campaign.noActiveTokenCount > 0 ? `, ${campaign.noActiveTokenCount.toLocaleString()} no active token` : ''}
            </p>
          )}
          {announcementIncludesSms(campaign.channel) && (
            <>
              <p>
                SMS: {campaign.smsEligibleCount.toLocaleString()} eligible, {campaign.smsAcceptedCount.toLocaleString()} accepted
                {campaign.smsFailedCount > 0 ? `, ${campaign.smsFailedCount.toLocaleString()} failed` : ''}
                {campaign.smsNoValidPhoneCount > 0 ? `, ${campaign.smsNoValidPhoneCount.toLocaleString()} no valid phone` : ''}
              </p>
              {campaign.smsUnknownCount > 0 && (
                <p className="font-medium text-amber-700">
                  {campaign.smsUnknownCount.toLocaleString()} SMS outcomes unknown - attention required
                </p>
              )}
            </>
          )}
        </div>
      ),
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
          subtitle="Preview and publish audited push and SMS campaigns"
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
          empty={<EmptyState title="No campaigns yet" description="Preview and publish your first announcement to see it here." />}
          caption={`${history.length} campaigns`}
        />

        <ComposeDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          lockedAudience={lockedAudience}
          audienceOptions={audienceOptions}
          regions={regions}
          canSelectRegion={canSelectRegion}
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
  open, onClose, lockedAudience, audienceOptions, regions, canSelectRegion, onPublished,
}: {
  open: boolean
  onClose: () => void
  lockedAudience: AnnouncementAudience | null
  audienceOptions: typeof AUDIENCE
  regions: Region[]
  canSelectRegion: boolean
  onPublished: () => void
}) {
  const [regionId, setRegionId] = useState('')
  const [targetAudience, setTargetAudience] = useState<AnnouncementAudience>(lockedAudience ?? 'all')
  const [audienceScope, setAudienceScope] = useState<AnnouncementAudienceScope>('home_region')
  const [specificSearch, setSpecificSearch] = useState('')
  const [specificResults, setSpecificResults] = useState<PlatformUser[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<PlatformUser[]>([])
  const [searchingRecipients, setSearchingRecipients] = useState(false)
  const [classification, setClassification] = useState<AnnouncementClassification>('service')
  const [channel, setChannel] = useState<AnnouncementChannel>('push')
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
    setAudienceScope('home_region')
    setSpecificSearch('')
    setSpecificResults([])
    setSelectedRecipients([])
    setRegionId(regions.length === 1 ? regions[0].id : '')
    setClassification('service')
    setChannel('push')
    setDestination('notifications')
    setTitle('')
    setBody('')
    setReason('')
    setPreview(null)
    setError('')
  }, [open, lockedAudience, regions])

  useEffect(() => {
    if (!open || audienceScope !== 'specific_users' || targetAudience === 'all') {
      setSpecificResults([])
      setSearchingRecipients(false)
      return
    }
    const query = specificSearch.trim()
    if (query.length < 2) {
      setSpecificResults([])
      setSearchingRecipients(false)
      return
    }
    const role = targetAudience === 'clients' ? 'client' : targetAudience === 'drivers' ? 'driver' : 'artisan'
    let cancelled = false
    setSearchingRecipients(true)
    const timer = window.setTimeout(() => {
      listUsers({
        role,
        search: query,
        page: 1,
        limit: 10,
        ...(role === 'client' && canSelectRegion ? { clientRegionScope: 'all' as const } : {}),
      })
        .then(result => {
          if (!cancelled) {
            const chosen = new Set(selectedRecipients.map(item => item.roleAccountId))
            setSpecificResults(result.items.filter(item => !chosen.has(item.roleAccountId)))
          }
        })
        .catch(() => { if (!cancelled) setSpecificResults([]) })
        .finally(() => { if (!cancelled) setSearchingRecipients(false) })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [audienceScope, canSelectRegion, open, selectedRecipients, specificSearch, targetAudience])

  function invalidatePreview() {
    setPreview(null)
    setError('')
  }

  function draft(): AnnouncementDraft {
    return {
      regionId,
      title: title.trim(),
      body: body.trim(),
      targetAudience,
      audienceScope,
      specificRecipientRoleAccountIds: selectedRecipients.map(item => item.roleAccountId),
      classification,
      channel,
      destination,
      reason: reason.trim(),
    }
  }

  async function handleSubmit() {
    const request = draft()
    if (
      !request.title ||
      !request.body ||
      request.reason.length < ANNOUNCEMENT_REASON_MIN_CHARS
    ) return
    if (
      preview != null &&
      preview.rendered.channel !== 'push' &&
      preview.rendered.smsBody.trim().length === 0
    ) {
      setPreview(null)
      setError('The reviewed SMS text is missing. Generate a new server preview before publishing.')
      return
    }
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
      if (err instanceof ApiError && shouldClearAnnouncementPreview(err.code)) {
        setPreview(null)
      }
      setError(userSafeAdminError(
        err,
        preview == null ? 'Failed to generate the server preview.' : 'Failed to publish the campaign.',
      ))
    } finally {
      setSubmitting(false)
    }
  }

  const selectedAudience = AUDIENCE.find(a => a.value === targetAudience) ?? AUDIENCE[0]
  const audienceScopeOptions = AUDIENCE_SCOPE.filter(option => {
    if ((option.value === 'all_regions' || option.value === 'unassigned') && !canSelectRegion) return false
    if (option.value === 'unassigned' && targetAudience !== 'clients') return false
    if (option.value === 'specific_users' && targetAudience === 'all') return false
    return true
  })
  const SelectedAudienceIcon = selectedAudience.icon
  const isSmsChannel = announcementIncludesSms(channel)
  const smsLength = announcementSmsLength(body)
  const smsUnitsLabel = announcementSmsUnitsLabel(smsLength.encoding)
  const reasonLength = reason.trim().length
  const reasonTooShort = reasonLength > 0 && reasonLength < ANNOUNCEMENT_REASON_MIN_CHARS
  const invalid =
    !regionId ||
    !title.trim() ||
    !body.trim() ||
    reasonLength < ANNOUNCEMENT_REASON_MIN_CHARS ||
    (audienceScope === 'specific_users' && selectedRecipients.length === 0) ||
    (isSmsChannel && smsLength.tooLong)
  const publishLabel = preview == null
    ? 'Generate server preview'
    : preview.rendered.channel === 'push'
      ? `Publish to ${preview.counts.activePushRecipients.toLocaleString()} devices`
      : preview.rendered.channel === 'sms'
        ? `Publish to ${preview.counts.smsRecipients.toLocaleString()} SMS recipients`
        : `Publish to ${preview.counts.activePushRecipients.toLocaleString()} devices + ${preview.counts.smsRecipients.toLocaleString()} SMS recipients`

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Compose announcement"
      description="Choose a channel, then verify the exact server preview and audience before publishing."
      submitLabel={publishLabel}
      onSubmit={handleSubmit}
      size="lg"
      loading={submitting}
      disabled={invalid}
      error={error || null}
      footerNote={preview == null
        ? 'Nothing is sent while generating a preview.'
        : 'Publishing queues this exact revision. The preview token is time-limited and single-use.'}
    >
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operational region</Label>
        <Select value={regionId} onValueChange={(value) => { setRegionId(value); invalidatePreview() }}>
          <SelectTrigger className="bg-gray-50"><SelectValue placeholder="Select a region" /></SelectTrigger>
          <SelectContent>
            {regions.map((region) => (
              <SelectItem key={region.id} value={region.id}>{region.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-400">
          Region-sensitive audiences use this region. Company-wide and unassigned audiences remain explicit in the preview.
        </p>
      </div>

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
                onClick={() => {
                  setTargetAudience(a.value)
                  setSelectedRecipients([])
                  setSpecificResults([])
                  setSpecificSearch('')
                  if (a.value === 'all' && audienceScope === 'specific_users') setAudienceScope('home_region')
                  if (a.value !== 'clients' && audienceScope === 'unassigned') setAudienceScope('home_region')
                  invalidatePreview()
                }}
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

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience location</Label>
        <Select
          value={audienceScope}
          onValueChange={(value: AnnouncementAudienceScope) => {
            setAudienceScope(value)
            setSpecificSearch('')
            setSpecificResults([])
            setSelectedRecipients([])
            invalidatePreview()
          }}
        >
          <SelectTrigger className="bg-gray-50"><SelectValue /></SelectTrigger>
          <SelectContent>
            {audienceScopeOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-400">
          {AUDIENCE_SCOPE.find(option => option.value === audienceScope)?.sub}
        </p>
      </div>

      {audienceScope === 'specific_users' && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Specific recipients</Label>
          <Input
            value={specificSearch}
            onChange={event => setSpecificSearch(event.target.value)}
            placeholder="Search by name, phone, or email"
          />
          {selectedRecipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedRecipients.map(recipient => (
                <span key={recipient.roleAccountId} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[11px] text-blue-800">
                  {recipient.fullName}
                  <button
                    type="button"
                    aria-label={`Remove ${recipient.fullName}`}
                    onClick={() => {
                      setSelectedRecipients(current => current.filter(item => item.roleAccountId !== recipient.roleAccountId))
                      invalidatePreview()
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {specificSearch.trim().length >= 2 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white">
              {searchingRecipients ? (
                <p className="px-3 py-2 text-xs text-gray-500">Searching...</p>
              ) : specificResults.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-500">No matching accounts.</p>
              ) : specificResults.map(result => (
                <button
                  key={result.roleAccountId}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-0 hover:bg-gray-50"
                  onClick={() => {
                    setSelectedRecipients(current => [...current, result])
                    setSpecificSearch('')
                    setSpecificResults([])
                    invalidatePreview()
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-gray-800">{result.fullName}</span>
                    <span className="block truncate text-[10px] text-gray-500">{result.phone}{result.email ? ` - ${result.email}` : ''}</span>
                  </span>
                  <span className="text-[10px] uppercase text-gray-400">Add</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-400">
            Search runs only while this audience is selected. The server preview freezes the final list.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Channel</Label>
          <Select value={channel} onValueChange={(value: AnnouncementChannel) => { setChannel(value); invalidatePreview() }}>
            <SelectTrigger className="bg-gray-50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="push">Push notification</SelectItem>
              <SelectItem value="sms">SMS only (Arkesel)</SelectItem>
              <SelectItem value="sms_push">SMS + Push</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
      </div>

      {announcementIncludesPush(channel) && (
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
      )}

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
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message body</Label>
          {isSmsChannel && (
            <span className={`text-[11px] font-medium tabular-nums ${smsLength.tooLong ? 'text-red-600' : smsLength.unitsLeft <= 20 ? 'text-amber-600' : 'text-gray-400'}`}>
              {smsLength.tooLong
                ? `${Math.abs(smsLength.unitsLeft)} units over the one-SMS limit`
                : `${smsLength.unitsLeft} units left with ${ANNOUNCEMENT_SMS_PREFIX.trim()} prefix`}
            </span>
          )}
        </div>
        <Textarea
          placeholder="Write your announcement..."
          rows={4}
          value={body}
          onChange={event => { setBody(event.target.value); invalidatePreview() }}
          className={`resize-none ${isSmsChannel && smsLength.tooLong ? 'border-red-300 focus-visible:ring-red-200' : ''}`}
          maxLength={500}
        />
        <p className="text-[11px] text-gray-400 text-right">
          {isSmsChannel ? `${smsLength.units}/${smsLength.unitLimit} ${smsUnitsLabel}` : `${body.length}/500`}
        </p>
        {isSmsChannel && smsLength.tooLong && (
          <p className="text-[11px] text-red-600">
            Shorten the text to one SMS. The limit depends on whether the text uses GSM-7 or UCS-2.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason for sending</Label>
        <Textarea
          placeholder="Internal audit reason (not shown to recipients)..."
          rows={2}
          value={reason}
          onChange={event => { setReason(event.target.value); invalidatePreview() }}
          className={`resize-none ${reasonTooShort ? 'border-red-300 focus-visible:ring-red-200' : ''}`}
          maxLength={500}
        />
        <p className={`text-[11px] ${reasonTooShort ? 'text-red-600' : 'text-gray-400'}`}>
          Enter at least {ANNOUNCEMENT_REASON_MIN_CHARS} characters. {reasonLength}/500
        </p>
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <PreviewCount label="Audience profiles" value={preview.counts.eligibleRecipients} />
            {announcementIncludesPush(preview.rendered.channel) && (
              <>
                <PreviewCount label="Push devices" value={preview.counts.activePushRecipients} />
                <PreviewCount label="No push token" value={preview.counts.noActiveToken} />
              </>
            )}
            {announcementIncludesSms(preview.rendered.channel) && (
              <>
                <PreviewCount label="SMS recipients" value={preview.counts.smsRecipients} />
                <PreviewCount label="No valid phone" value={preview.counts.smsNoValidPhone} />
              </>
            )}
          </div>
          {preview.rendered.channel !== 'push' && (
            <div className="rounded-md border border-blue-100 bg-white/80 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Exact SMS text</p>
                <p className="text-[10px] text-slate-500">
                  {preview.rendered.smsUnits}/{preview.rendered.smsUnitLimit}{' '}
                  {announcementSmsUnitsLabel(preview.rendered.smsEncoding)}
                </p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{preview.rendered.smsBody}</p>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <SelectedAudienceIcon className="h-3 w-3" />
            <span>{selectedAudience.label}</span>
            <span>-</span>
            <span>{AUDIENCE_SCOPE_LABELS[preview.rendered.audienceScope]}</span>
            <span>-</span>
            <span>{CHANNEL_LABELS[preview.rendered.channel]}</span>
            {announcementIncludesPush(preview.rendered.channel) && (
              <>
                <span>-</span>
                <span>{DESTINATION_LABELS[preview.rendered.destination]}</span>
              </>
            )}
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
