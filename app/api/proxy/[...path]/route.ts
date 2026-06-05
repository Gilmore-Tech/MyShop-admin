import { type NextRequest, NextResponse } from 'next/server'

const UPSTREAM =
  process.env.UPSTREAM_API_URL ?? 'https://myshop-api-2hy2.onrender.com/v1'

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const url = new URL(req.url)
  const upstream = `${UPSTREAM}/${path.join('/')}${url.search}`

  const headers = new Headers()
  const authHeader = req.headers.get('authorization')
  if (authHeader) headers.set('authorization', authHeader)
  headers.set('content-type', req.headers.get('content-type') ?? 'application/json')

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined

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
        },
      }),
      { status: isTimeout ? 504 : 502, headers: { 'content-type': 'application/json' } },
    )
  }

  const resBody = await res.text()
  return new NextResponse(resBody, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}

export const GET    = handler
export const POST   = handler
export const PATCH  = handler
export const PUT    = handler
export const DELETE = handler
