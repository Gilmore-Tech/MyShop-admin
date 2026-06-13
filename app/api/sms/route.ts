import { NextRequest, NextResponse } from 'next/server'

const ARKESEL_KEY   = process.env.ARKESEL_API_KEY!
const ARKESEL_FROM  = process.env.ARKESEL_SENDER_ID ?? 'MyShop'
const ARKESEL_URL   = 'https://sms.arkesel.com/api/v2/sms/send'
const BACKEND_BASE  = process.env.NEXT_PUBLIC_API_URL ?? 'https://myshop-api-2hy2.onrender.com/v1'

export type SmsAudience = 'all_users' | 'clients' | 'drivers' | 'artisans'

// Maps audience label → backend role query param
const ROLE_MAP: Record<SmsAudience, string | undefined> = {
  all_users: undefined,
  clients:   'client',
  drivers:   'driver',
  artisans:  'artisan',
}

// ── Fetch all phone numbers from NestJS backend for a given role ──────────────

async function fetchPhones(role: string | undefined, token: string): Promise<string[]> {
  const phones: string[] = []
  let page = 1
  const limit = 500

  while (true) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (role) params.set('role', role)

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

// ── Fetch a single user's phone from the NestJS backend ───────────────────────

async function fetchPhoneForUser(userId: string, token: string): Promise<string | null> {
  const res = await fetch(`${BACKEND_BASE}/admin/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Backend returned ${res.status} while fetching user`)
  }

  const body = await res.json()
  // NestJS TransformInterceptor wraps in { success, data, meta }
  const data = body?.data ?? body
  return data?.phone ?? null
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
    let result: any = null
    try { result = JSON.parse(rawBody) } catch { /* non-JSON error page */ }

    // Arkesel v2 signals batch-level acceptance via top-level status/code, NOT a
    // per-recipient `status` field. Treat the batch as accepted when the API says so.
    const ok =
      res.ok &&
      (result?.status === 'success' || result?.code === 'ok' || result?.code === 2000)

    if (ok) {
      sent += batch.length
    } else {
      failed += batch.length
      reason =
        result?.message ??
        result?.status ??
        `Arkesel rejected the send (HTTP ${res.status}).`
      // Surface the real reason in server logs — never logs the phone numbers.
      console.error('[SMS route] Arkesel send failed:', res.status, rawBody.slice(0, 300))
    }
  }

  return { sent, failed, reason }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { audience, userId, message } = (await req.json()) as {
      audience?: SmsAudience
      userId?: string
      message: string
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Either a single-recipient send (userId) or an audience broadcast is required.
    if (!userId && !audience) {
      return NextResponse.json({ error: 'userId or audience is required' }, { status: 400 })
    }

    if (audience && !Object.keys(ROLE_MAP).includes(audience)) {
      return NextResponse.json({ error: `Invalid audience: ${audience}` }, { status: 400 })
    }

    if (!ARKESEL_KEY) {
      return NextResponse.json({ error: 'Arkesel API key not configured on server' }, { status: 500 })
    }

    // Extract admin JWT from the incoming request
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized — no admin token' }, { status: 401 })
    }

    // 1. Resolve recipient phone numbers server-side (never exposed to the browser)
    let phones: string[]
    if (userId) {
      const phone = await fetchPhoneForUser(userId, token)
      if (!phone) {
        return NextResponse.json({ error: 'No phone number on file for this provider' }, { status: 404 })
      }
      phones = [phone]
    } else {
      phones = await fetchPhones(ROLE_MAP[audience!], token)
      if (phones.length === 0) {
        return NextResponse.json({ error: 'No phone numbers found for the selected audience' }, { status: 404 })
      }
    }

    // 2. Send via Arkesel
    const { sent, failed, reason } = await sendArkeselBatch(phones, message.trim())

    return NextResponse.json({
      success: true,
      total: phones.length,
      sent,
      failed,
      ...(failed > 0 && reason ? { reason } : {}),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[SMS route]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
