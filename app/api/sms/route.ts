import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

const ARKESEL_KEY   = process.env.ARKESEL_API_KEY!
const ARKESEL_FROM  = process.env.ARKESEL_SENDER_ID ?? 'MyShop'
const ARKESEL_URL   = 'https://sms.arkesel.com/api/v2/sms/send'
const BACKEND_BASE  = process.env.NEXT_PUBLIC_API_URL ?? 'https://myshop-api-2hy2.onrender.com/v1'

export type SmsAudience = 'all_users' | 'clients' | 'drivers' | 'artisans'
type RoleAccountRole = 'client' | 'driver' | 'artisan'

// Every list request names one exact public role. An all-user broadcast performs
// three isolated reads and deduplicates phone numbers without loading a shared
// identity record.
const ROLE_MAP: Record<SmsAudience, readonly RoleAccountRole[]> = {
  all_users: ['client', 'driver', 'artisan'],
  clients:   ['client'],
  drivers:   ['driver'],
  artisans:  ['artisan'],
}

// The Arkesel route runs in Next.js, outside Nest's guards. Ask a harmless
// backend endpoint protected by the same permission to validate both the JWT
// and the current database-backed `send_announcement` grant before spending.
async function authorizeAnnouncement(token: string): Promise<Response> {
  return fetch(`${BACKEND_BASE}/admin/announcements/history`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

// ── Fetch all phone numbers from NestJS backend for a given role ──────────────

async function fetchPhones(role: RoleAccountRole, token: string): Promise<string[]> {
  const phones: string[] = []
  let page = 1
  const limit = 500

  while (true) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    params.set('role', role)

    const res = await fetch(`${BACKEND_BASE}/admin/users?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status} while fetching users`)
    }

    const body = await res.json()
    // NestJS TransformInterceptor wraps in { success, data, meta }
    const data = body?.data ?? body
    const items: { phone?: string }[] = Array.isArray(data) ? data : (data?.items ?? [])

    for (const u of items) {
      if (u.phone) phones.push(u.phone)
    }

    const totalPages: number = body?.meta?.totalPages ?? data?.totalPages ?? 1
    if (page >= totalPages || items.length === 0) break
    page++
  }

  return phones
}

// Normalises a Ghana phone number to the format Arkesel expects: 233XXXXXXXXX
// (international, no leading + or 0). Returns null if it can't be made valid.
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '') // strip +, spaces, dashes
  if (digits.startsWith('233') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return '233' + digits.slice(1)
  if (digits.length === 9) return '233' + digits // bare 9-digit local number
  return null
}

// ── Send to Arkesel in batches of 100 ────────────────────────────────────────

async function sendArkeselBatch(
  recipients: string[],
  message: string,
  supportReference: string,
): Promise<{ sent: number; failed: number; reason?: string }> {
  const BATCH = 100
  let sent = 0
  let failed = 0
  let reason: string | undefined

  // Normalise up front; drop (and count as failed) anything we can't format.
  const normalised: string[] = []
  for (const r of recipients) {
    const n = normalisePhone(r)
    if (n) normalised.push(n)
    else {
      failed++
      reason = 'One or more phone numbers are not in a valid Ghana format.'
    }
  }

  for (let i = 0; i < normalised.length; i += BATCH) {
    const batch = normalised.slice(i, i + BATCH)

    const res = await fetch(ARKESEL_URL, {
      method: 'POST',
      headers: {
        'api-key': ARKESEL_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender:     ARKESEL_FROM,
        message,
        recipients: batch,
      }),
    })

    const rawBody = await res.text()
    let result: Record<string, unknown> | null = null
    try {
      const parsed: unknown = JSON.parse(rawBody)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        result = parsed as Record<string, unknown>
      }
    } catch { /* non-JSON error page */ }

    // Arkesel v2 signals batch-level acceptance via top-level status/code, NOT a
    // per-recipient `status` field. Treat the batch as accepted when the API says so.
    const ok =
      res.ok &&
      (result?.status === 'success' || result?.code === 'ok' || result?.code === 2000)

    if (ok) {
      sent += batch.length
    } else {
      failed += batch.length
      reason = `The SMS provider did not accept this batch (HTTP ${res.status}).`
      console.error('[SMS route] carrier batch rejected', {
        status: res.status,
        structuredResponse: result !== null,
        supportReference,
      })
    }
  }

  return { sent, failed, reason }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supportReference = randomUUID()
  const errorResponse = (status: number, code: string, message: string) =>
    NextResponse.json(
      { success: false, error: { code, message, supportReference } },
      { status, headers: { 'x-support-reference': supportReference } },
    )
  try {
    const { audience, recipient, message } = (await req.json()) as {
      audience?: SmsAudience
      recipient?: string
      message: string
    }

    if (!message?.trim()) {
      return errorResponse(400, 'MESSAGE_REQUIRED', 'Enter an announcement message.')
    }

    if (!audience && !recipient) {
      return errorResponse(400, 'RECIPIENT_REQUIRED', 'Select an audience or enter a recipient.')
    }

    if (audience && recipient) {
      return errorResponse(400, 'RECIPIENT_CONFLICT', 'Send to either an audience or one recipient.')
    }

    if (audience && !Object.keys(ROLE_MAP).includes(audience)) {
      return errorResponse(400, 'INVALID_AUDIENCE', 'Select a valid announcement audience.')
    }

    if (!ARKESEL_KEY) {
      console.error('[SMS route] carrier configuration unavailable', { supportReference })
      return errorResponse(503, 'SMS_SERVICE_UNAVAILABLE', 'The SMS service is temporarily unavailable.')
    }

    // Extract admin JWT from the incoming request
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) {
      return errorResponse(401, 'ADMIN_SESSION_REQUIRED', 'Sign in before sending announcements.')
    }

    const authorization = await authorizeAnnouncement(token)
    if (!authorization.ok) {
      const status = authorization.status === 401 || authorization.status === 403
        ? authorization.status
        : 502
      return errorResponse(
        status,
        status === 403 ? 'OUT_OF_SCOPE' : status === 401 ? 'ADMIN_SESSION_INVALID' : 'AUTHORIZATION_UNAVAILABLE',
        status === 403
          ? 'You do not have permission to send announcements.'
          : status === 401
            ? 'Admin session is no longer valid.'
            : 'Unable to verify announcement permission with the backend.',
      )
    }

    // Resolve recipients through exact role-account lists only. A phone number
    // shared by multiple role accounts receives one copy of a broad broadcast.
    const phones = recipient
      ? [recipient]
      : [...new Set((await Promise.all(ROLE_MAP[audience!].map(role => fetchPhones(role, token)))).flat())]
    if (phones.length === 0) {
      return errorResponse(404, 'AUDIENCE_EMPTY', 'No valid recipients were found for this audience.')
    }

    // 2. Send via Arkesel
    const { sent, failed, reason } = await sendArkeselBatch(
      phones,
      message.trim(),
      supportReference,
    )

    return NextResponse.json(
      {
        success: true,
        total: phones.length,
        sent,
        failed,
        ...(failed > 0 && reason ? { reason } : {}),
      },
      { headers: { 'x-support-reference': supportReference } },
    )
  } catch (err) {
    console.error('[SMS route] unexpected failure', {
      kind: err instanceof Error ? err.name : typeof err,
      supportReference,
    })
    return errorResponse(500, 'SMS_SEND_FAILED', 'The announcement could not be sent. Try again.')
  }
}
