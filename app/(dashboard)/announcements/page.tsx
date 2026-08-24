'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useCallback, useState, useEffect } from 'react'
import { Send, Users, Car, Wrench, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import { FormDialog } from '@/components/common/form-dialog'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { sendAnnouncement, getAnnouncementHistory, sendSms, type AnnouncementTopic, type AnnouncementHistoryItem, type SmsAudience } from '@/lib/api'
import { userSafeAdminError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import { formatDateTime } from '@/lib/format-date'

const AUDIENCE: { value: AnnouncementTopic; label: string; sub: string; icon: React.ElementType; colors: string; active: string }[] = [
  { value: 'all_users', label: 'All users', sub: 'Clients - Drivers - Artisans', icon: Users, colors: ' text-gray-600 hover: hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'clients', label: 'Clients', sub: 'App users who book', icon: User, colors: ' text-gray-600 hover: hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'drivers', label: 'Drivers', sub: 'Registered ride drivers', icon: Car, colors: ' text-gray-600 hover: hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'artisans', label: 'Artisans', sub: 'Service providers', icon: Wrench, colors: ' text-gray-600 hover: hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
]

const CHANNEL_LABELS: Record<string, string> = {
  push: 'Push notification',
  sms: 'SMS (Arkesel)',
  sms_push: 'SMS + Push',
}

const SMS_MAX = 160

export default function AnnouncementsPage() {
  const { category } = useRole()
  // A category-scoped coordinator can only broadcast to their own line's
  // providers - the audience is locked to that one option.
  const lockedTopic: AnnouncementTopic | null =
    category === 'rides' ? 'drivers' : category === 'artisan' ? 'artisans' : null
  const audienceOptions = lockedTopic ? AUDIENCE.filter(a => a.value === lockedTopic) : AUDIENCE

  const [composeOpen, setComposeOpen] = useState(false)
  const [history, setHistory] = useState<AnnouncementHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const loadHistory = useCallback(() => {
    setHistoryLoading(true)
    setHistoryError(null)
    getAnnouncementHistory()
      .then(items => setHistory(items))
      .catch(err => setHistoryError(userSafeAdminError(err, 'Failed to load message history.')))
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const columns: DataTableColumn<AnnouncementHistoryItem>[] = [
    {
      key: 'title', header: 'Title', className: 'max-w-48',
      render: a => <p className="truncate text-sm font-medium text-gray-800">{a.title}</p>,
    },
    {
      key: 'audience', header: 'Audience',
      render: a => <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">{a.audience}</span>,
    },
    { key: 'channel', header: 'Channel', render: a => <span className="text-xs text-gray-500 whitespace-nowrap">{a.channel}</span> },
    { key: 'sent', header: 'Sent', render: a => <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(a.sentAt)}</span> },
    {
      key: 'delivered', header: 'Delivered', align: 'right',
      render: a => <span className="text-sm font-medium text-gray-800">{a.delivered.toLocaleString()}</span>,
    },
    {
      key: 'opened', header: 'Opened', align: 'right',
      render: a => a.delivered > 0 ? (
        <span className="text-sm font-medium text-emerald-600">
          {a.opened.toLocaleString()}
          <span className="text-gray-400 font-normal ml-1 text-xs">({Math.round(a.opened / a.delivered * 100)}%)</span>
        </span>
      ) : (
        <span className="text-sm text-gray-400">-</span>
      ),
    },
  ]

  return (
    <PageGuard permission="send_announcement">
      <div>
        <PageHeader
          title="Announcements"
          subtitle="Messages shown to clients and providers"
          actions={
            <Button variant="brand" className="gap-2" onClick={() => setComposeOpen(true)}>
              <Send className="h-4 w-4" /> Compose message
            </Button>
          }
        />

        <DataTable<AnnouncementHistoryItem>
          columns={columns}
          rows={history}
          rowKey={a => a.id}
          loading={historyLoading}
          error={historyError}
          onRetry={loadHistory}
          empty={<EmptyState title="No messages sent yet" description="Compose your first announcement to see it here." />}
          caption={`${history.length} sent`}
        />

        <ComposeDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          lockedTopic={lockedTopic}
          audienceOptions={audienceOptions}
          onSent={item => { setHistory(prev => [item, ...prev]); setComposeOpen(false) }}
        />
      </div>
    </PageGuard>
  )
}

function ComposeDialog({
  open, onClose, lockedTopic, audienceOptions, onSent,
}: {
  open: boolean
  onClose: () => void
  lockedTopic: AnnouncementTopic | null
  audienceOptions: typeof AUDIENCE
  onSent: (item: AnnouncementHistoryItem) => void
}) {
  const [topic, setTopic] = useState<AnnouncementTopic>(lockedTopic ?? 'all_users')
  const [channel, setChannel] = useState('push')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTopic(lockedTopic ?? 'all_users')
    setChannel('push')
    setTitle('')
    setBody('')
    setError('')
  }, [open, lockedTopic])

  const isSmsChannel = channel === 'sms' || channel === 'sms_push'
  const charsLeft = SMS_MAX - body.length
  const isOverLimit = isSmsChannel && charsLeft < 0
  const selectedAudience = AUDIENCE.find(a => a.value === topic)!

  async function handleSend() {
    if (!title.trim() || !body.trim() || isOverLimit) return
    setSending(true)
    setError('')

    const label = AUDIENCE.find(a => a.value === topic)?.label ?? topic

    try {
      const pushChannels = ['push', 'sms_push']
      const smsChannels = ['sms', 'sms_push']
      let delivered = 0

      if (pushChannels.includes(channel)) {
        await sendAnnouncement(title.trim(), body.trim(), topic)
      }

      if (smsChannels.includes(channel)) {
        const result = await sendSms(topic as SmsAudience, `MyShop: ${body.trim()}`)
        delivered = result.sent
      }

      onSent({
        id: Date.now().toString(),
        title: title.trim(),
        body: body.trim(),
        audience: label,
        channel: CHANNEL_LABELS[channel] ?? channel,
        sentAt: new Date().toISOString(),
        sentBy: null,
        delivered,
        opened: 0,
      })
    } catch (err) {
      setError(userSafeAdminError(err, 'Failed to send.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Compose message"
      description="Broadcast a push notification, SMS, or both to platform users."
      submitLabel={`Send to ${selectedAudience.label}`}
      onSubmit={handleSend}
      size="lg"
      loading={sending}
      disabled={!title.trim() || !body.trim() || isOverLimit}
      error={error || null}
    >
      <div>
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Target audience</Label>
        <div className="grid grid-cols-2 gap-2">
          {audienceOptions.map(a => {
            const Icon = a.icon
            const isActive = topic === a.value
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => setTopic(a.value)}
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
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Channel</Label>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="push">Push notification</SelectItem>
            <SelectItem value="sms">SMS only (Arkesel)</SelectItem>
            <SelectItem value="sms_push">SMS + Push notification</SelectItem>
          </SelectContent>
        </Select>
        {isSmsChannel && (
          <p className="text-[11px] text-gray-400 mt-1">SMS uses the message body. Keep it under 160 characters to avoid split billing.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</Label>
        <Input
          placeholder="Message title..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={100}
        />
        <p className="text-[11px] text-gray-400 text-right">{title.length}/100</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message body</Label>
          {isSmsChannel && (
            <span className={`text-[11px] font-medium tabular-nums ${isOverLimit ? 'text-red-500' : charsLeft <= 20 ? 'text-orange-500' : 'text-gray-400'}`}>
              {charsLeft} chars left (SMS)
            </span>
          )}
        </div>
        <Textarea
          placeholder="Write your message here..."
          rows={4}
          value={body}
          onChange={e => setBody(e.target.value)}
          className={`resize-none ${isOverLimit ? 'focus-visible:ring-red-200' : ''}`}
          maxLength={isSmsChannel ? undefined : 500}
        />
        <p className="text-[11px] text-gray-400 text-right">{body.length}/500</p>
      </div>

      {title && (
        <div className="bg-slate-900 rounded-lg p-3.5 text-white">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Preview</p>
          <p className="text-xs font-semibold">{title}</p>
          {body && <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{body}</p>}
          <div className="flex items-center gap-1.5 mt-2">
            <selectedAudience.icon className="h-3 w-3 text-slate-400" />
            <p className="text-[10px] text-slate-400">{selectedAudience.label} - {CHANNEL_LABELS[channel]}</p>
          </div>
        </div>
      )}
    </FormDialog>
  )
}
