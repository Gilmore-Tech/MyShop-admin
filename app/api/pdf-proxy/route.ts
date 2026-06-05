import { type NextRequest, NextResponse } from 'next/server'

// Fetches a file from Cloudinary and re-serves it with Content-Disposition: inline
// so the browser renders it instead of downloading it (Cloudinary sends attachment by default).
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new NextResponse(`Invalid URL: ${url}`, { status: 400 })
  }

  // Only allow Cloudinary delivery hostnames — block api.cloudinary.com (upload endpoint)
  if (parsed.hostname !== 'res.cloudinary.com') {
    return new NextResponse(
      `URL not allowed. Expected res.cloudinary.com, got: ${parsed.hostname}`,
      { status: 403 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'MyShopAdmin/1.0' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new NextResponse(`Failed to reach Cloudinary: ${msg}`, { status: 502 })
  }

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '')
    console.error(`[pdf-proxy] Cloudinary ${upstream.status} for ${url}: ${body}`)
    return new NextResponse(
      `Cloudinary returned ${upstream.status} for this file. URL: ${url}`,
      { status: upstream.status },
    )
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
    },
  })
}
