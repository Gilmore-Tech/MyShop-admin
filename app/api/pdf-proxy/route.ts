import { type NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

// Fetches a file from Cloudinary and re-serves it with Content-Disposition: inline
// so the browser renders it instead of downloading it (Cloudinary sends attachment by default).
export async function GET(req: NextRequest) {
  const supportReference = randomUUID()
  const textError = (status: number, message: string) =>
    new NextResponse(`${message} Reference: ${supportReference}.`, {
      status,
      headers: { 'x-support-reference': supportReference },
    })
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return textError(400, 'A document URL is required.')
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return textError(400, 'The document URL is invalid.')
  }

  const isCloudinaryDelivery = parsed.hostname === 'res.cloudinary.com'
  const isSignedPrivateDownload =
    parsed.hostname === 'api.cloudinary.com' &&
    /^\/v1_1\/[A-Za-z0-9_-]+\/(?:image|raw)\/download$/.test(parsed.pathname) &&
    ['timestamp', 'public_id', 'type', 'signature', 'api_key'].every(key => parsed.searchParams.has(key))

  // Permit only normal Cloudinary delivery URLs or the SDK's exact signed
  // private-download route. Other API endpoints (including uploads) remain
  // blocked so this server-side proxy cannot be repurposed.
  if (!isCloudinaryDelivery && !isSignedPrivateDownload) {
    return textError(403, 'This document host is not allowed.')
  }

  let upstream: Response
  try {
    upstream = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'MyShopAdmin/1.0' },
    })
  } catch (err) {
    console.error('[pdf-proxy] upstream connection failed', {
      kind: err instanceof Error ? err.name : typeof err,
      supportReference,
    })
    return textError(502, 'The private document service could not be reached.')
  }

  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined)
    console.error('[pdf-proxy] upstream rejected document request', {
      status: upstream.status,
      supportReference,
    })
    return textError(upstream.status, 'The private document could not be loaded.')
  }

  const buffer = await upstream.arrayBuffer()

  // Cloudinary serves raw files with application/octet-stream by default which causes
  // browsers to download instead of render. Force application/pdf so the iframe displays it.
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
      'x-support-reference': supportReference,
    },
  })
}
