import { cn } from '@/lib/utils'
import type { PromoCampaignAudience } from '@/lib/api'

// Audience tints stay subtle (unlike the louder lifecycle badges): client keeps
// the monochrome default, provider audiences get a quiet hue so a commission-
// relief campaign is recognisable at a glance without shouting over the status.
const AUDIENCE_CLASS: Record<PromoCampaignAudience, string> = {
  client: 'bg-gray-100 text-gray-600',
  driver: 'bg-sky-100 text-sky-700',
  artisan: 'bg-violet-100 text-violet-700',
}

export const AUDIENCE_LABELS: Record<PromoCampaignAudience, string> = {
  client: 'Client',
  driver: 'Drivers',
  artisan: 'Artisans',
}

export function CampaignAudienceBadge({ audience }: { audience: PromoCampaignAudience }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        AUDIENCE_CLASS[audience],
      )}
    >
      {AUDIENCE_LABELS[audience]}
    </span>
  )
}
