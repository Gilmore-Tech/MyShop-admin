import { type NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

const UPSTREAM =
  process.env.UPSTREAM_API_URL ?? 'https://myshop-api-2hy2.onrender.com/v1'
const SUPPORT_REFERENCE_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const localSupportReference = randomUUID()
  const { path } = await params
  const url = new URL(req.url)
  const upstream = `${UPSTREAM}/${path.join('/')}${url.search}`

  const headers = new Headers()
  const authHeader = req.headers.get('authorization')
  if (authHeader) headers.set('authorization', authHeader)
  headers.set('content-type', req.headers.get('content-type') ?? 'application/json')
  // Publish endpoints use this header to make one reviewed action safe to
  // retry. Keep the proxy allow-list narrow, but do not drop the browser's
  // server-issued idempotency key on the way to the API.
  const idempotencyKey = req.headers.get('idempotency-key')
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey)

  // Forward the body as raw bytes, not text — reading multipart/form-data via
  // req.text() decodes as UTF-8 and corrupts binary uploads (e.g. profile photos).
  // An ArrayBuffer round-trips both JSON and binary payloads unchanged.
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : undefined

  let res: Response
  try {
    res = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'TimeoutError'
    return new NextResponse(
      JSON.stringify({
        error: {
          code: isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
          message: isTimeout
            ? 'The server is warming up (cold start). Please wait 30 seconds and try again.'
            : 'Unable to reach the API server. Please try again.',
          supportReference: localSupportReference,
        },
      }),
      {
        status: isTimeout ? 504 : 502,
        headers: {
          'content-type': 'application/json',
          'x-support-reference': localSupportReference,
        },
      },
    )
  }

  const resBody = await res.text()
  const upstreamSupportReference = res.headers.get('x-support-reference')
  const supportReference = upstreamSupportReference && SUPPORT_REFERENCE_RX.test(upstreamSupportReference)
    ? upstreamSupportReference
    : localSupportReference
  return new NextResponse(resBody, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'x-support-reference': supportReference,
    },
  })
}

export const GET    = handler
export const POST   = handler
export const PATCH  = handler
export const PUT    = handler
export const DELETE = handler
