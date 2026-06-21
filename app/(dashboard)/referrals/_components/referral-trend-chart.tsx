'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatDayShort } from '@/lib/format-date'
import type { ReferralByDayPoint } from '@/lib/api'

const GOLD = '#F5A623'
const GREEN = '#10B981'

/** Daily referrals created vs awarded, over the selected date range (metrics.byDay). */
export function ReferralTrendChart({ byDay }: { byDay: ReferralByDayPoint[] }) {
  if (!byDay || byDay.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-xs text-gray-400">No referral activity in this period</p>
      </div>
    )
  }

  const data = byDay.map(d => ({
    date: formatDayShort(d.date),
    Created: d.created,
    Awarded: d.awarded,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gradReferralCreated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={GOLD} stopOpacity={0.18} />
            <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradReferralAwarded" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={GREEN} stopOpacity={0.18} />
            <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          interval={Math.max(0, Math.floor(data.length / 8))}
        />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="Created" stroke={GOLD} strokeWidth={2} fill="url(#gradReferralCreated)" dot={false} />
        <Area type="monotone" dataKey="Awarded" stroke={GREEN} strokeWidth={2} fill="url(#gradReferralAwarded)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
