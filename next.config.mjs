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
    // Bridge the server-side Google Maps vars to the client bundle so the map
    // components (which read NEXT_PUBLIC_*) work from the single GOOGLE_MAPS_*
    // names already set in the environment (locally + on Render).
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY ?? '',
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: process.env.GOOGLE_MAPS_MAP_ID ?? '',
  },
}

export default nextConfig
