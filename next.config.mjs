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
  },
}

export default nextConfig
