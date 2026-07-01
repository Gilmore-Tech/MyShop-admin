'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useState, useEffect } from 'react'
import { Send, Users, Car, Wrench, User, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/page-header'
import { sendAnnouncement, getAnnouncementHistory, sendSms, type AnnouncementTopic, type AnnouncementHistoryItem, type SmsAudience } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'

const AUDIENCE: { value: AnnouncementTopic; label: string; sub: string; icon: React.ElementType; colors: string; active: string }[] = [
  { value: 'all_users', label: 'All Users', sub: 'Clients - Drivers - Artisans', icon: Users, colors: ' text-gray-600 hover: hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'clients', label: 'Clients', sub: 'App users who book', icon: User, colors: ' text-gray-600 hover: hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'drivers', label: 'Drivers', sub: 'Registered ride drivers', icon: Car, colors: ' text-gray-600 hover: hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
  { value: 'artisans', label: 'Artisans', sub: 'Service providers', icon: Wrench, colors: ' text-gray-600 hover: hover:bg-gray-50', active: ' bg-gray-100 text-gray-700 ring-1 ring-gray-200' },
]

const CHANNEL_LABELS: Record<string, string> = {
  push: 'Push Notification',
  sms: 'SMS (Arkesel)',
  sms_push: 'SMS + Push',
}

const SMS_MAX = 160

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AnnouncementsPage() {
  const { category } = useRole()
  // A category-scoped coordinator can only broadcast to their vertical's
  // providers — the audience is locked to that one option.
  const lockedTopic: AnnouncementTopic | null =
    category === 'rides' ? 'drivers' : category === 'artisan' ? 'artisans' : null
  const audienceOptions = lockedTopic ? AUDIENCE.filter(a => a.value === lockedTopic) : AUDIENCE
  const [topic, setTopic] = useState<AnnouncementTopic>(lockedTopic ?? 'all_users')
  const [channel, setChannel] = useState('push')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [history, setHistory] = useState<AnnouncementHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getAnnouncementHistory()
      .then(items => setHistory(items))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }, [])

  const isSmsChannel = channel === 'sms' || channel === 'sms_push'
  const charsLeft = SMS_MAX - body.length
  const isOverLimit = isSmsChannel && charsLeft < 0

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim() || isOverLimit) return
    setSending(true)
    setError('')
    setSuccess('')

    const label = AUDIENCE.find(a => a.value === topic)?.label ?? topic

    try {
      const pushChannels = ['push', 'sms_push']
      const smsChannels = ['sms', 'sms_push']

      if (pushChannels.includes(channel)) {
        await sendAnnouncement(title.trim(), body.trim(), topic)
      }

      if (smsChannels.includes(channel)) {
        const result = await sendSms(topic as SmsAudience, `MyShop: ${body.trim()}`)
        setSuccess(`Sent to ${label} - ${result.sent.toLocaleString()} SMS delivered, ${result.failed} failed.`)
      } else {
        setSuccess(`Message sent to ${label}.`)
      }

      // Optimistically prepend to history
      setHistory(prev => [{
        id: Date.now().toString(),
        title: title.trim(),
        body: body.trim(),
        audience: label,
        channel: CHANNEL_LABELS[channel] ?? channel,
        sentAt: new Date().toISOString(),
        sentBy: null,
        delivered: 0,
        opened: 0,
      }, ...prev])

      setTitle('')
      setBody('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to send.')
    } finally {
      setSending(false)
    }
  }

  const selectedAudience = AUDIENCE.find(a => a.value === topic)!

  return (
     <PageGuard permission="send_announcement">
    <div>
      <PageHeader
        title="Messages & Announcements"
        subtitle="Broadcast push notifications and in-app messages to platform users"
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-6">

        {/* ── Compose panel ────────────────────────────────────────────────── */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm p-5 flex flex-col">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Send className="h-4 w-4 text-gray-600" />
            Compose Message
          </h2>

          <form onSubmit={handleSend} className="flex flex-col gap-4 flex-1">
            <div>
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Target Audience</Label>
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
                  <SelectItem value="push">Push Notification</SelectItem>
                  <SelectItem value="sms">SMS only (Arkesel)</SelectItem>
                  <SelectItem value="sms_push">SMS + Push Notification</SelectItem>
                </SelectContent>
              </Select>
              {isSmsChannel && (
                <p className="text-[11px] text-gray-400 mt-1">SMS uses the message body. Keep it under 160 characters to avoid split billing.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</Label>
              <Input
                placeholder="Message title…"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-[11px] text-gray-400 text-right">{title.length}/100</p>
            </div>

            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message Body</Label>
                {isSmsChannel && (
                  <span className={`text-[11px] font-medium tabular-nums ${isOverLimit ? 'text-red-500' : charsLeft <= 20 ? 'text-orange-500' : 'text-gray-400'}`}>
                    {charsLeft} chars left (SMS)
                  </span>
                )}
              </div>
              <Textarea
                placeholder="Write your message here…"
                rows={4}
                value={body}
                onChange={e => setBody(e.target.value)}
                className={` resize-none ${isOverLimit ? ' focus-visible:ring-red-200' : ''}`}
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

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            {success && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                <CheckCircle className="h-3.5 w-3.5 shrink-0" /> {success}
              </div>
            )}

            <Button
              type="submit"
              disabled={!title.trim() || !body.trim() || sending || isOverLimit}
              className="w-full gap-2 text-white mt-auto"
              style={{ backgroundColor: '#F5A623' }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : `Send to ${selectedAudience.label}`}
            </Button>
          </form>
        </div>

        {/* ── History ──────────────────────────────────────────────────────── */}
        <div className="xl:col-span-3 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Sent Messages</h2>
            <span className="text-xs text-gray-400">
              {historyLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `${history.length} total`}
            </span>
          </div>
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Channel</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Delivered</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  [...Array(4)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-gray-400 text-sm">No messages sent yet</TableCell>
                  </TableRow>
                ) : (
                  history.map(a => (
                    <TableRow key={a.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium text-sm text-gray-800 max-w-48">
                        <p className="truncate">{a.title}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">{a.audience}</span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 whitespace-nowrap">{a.channel}</TableCell>
                      <TableCell className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(a.sentAt)}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-gray-800">{a.delivered.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {a.delivered > 0 ? (
                          <span className="text-sm font-medium text-emerald-600">
                            {a.opened.toLocaleString()}
                            <span className="text-gray-400 font-normal ml-1 text-xs">({Math.round(a.opened / a.delivered * 100)}%)</span>
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  </PageGuard>
  )
}
