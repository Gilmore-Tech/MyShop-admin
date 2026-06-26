import { execSync } from 'node:child_process'

/** Read the latest git commit (short sha + subject) at build time. */
function gitInfo() {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim()
    const message = execSync('git log -1 --pretty=%s').toString().trim()
    return { sha, message }
  } catch {
    return { sha: '', message: '' }
  }
}

const { sha, message } = gitInfo()

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_GIT_SHA: sha,
    NEXT_PUBLIC_GIT_MESSAGE: message,
    // Bridge the Google Maps vars to the client bundle so the map components
    // (which read NEXT_PUBLIC_*) resolve a key. Prefer an already-set
    // NEXT_PUBLIC_* value (don't clobber it), then fall back to the unprefixed
    // GOOGLE_MAPS_* names. NEXT_PUBLIC_* is inlined at build time, so whichever
    // name is used must be present in the build environment (locally + Render).
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? '',
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? process.env.GOOGLE_MAPS_MAP_ID ?? '',
  },
}

export default nextConfig
