// Passenger/cPanel entry point for the Next.js admin dashboard.
// cPanel's "Setup Node.js App" runs this file and provides the port via
// process.env.PORT. Next handles SSR, API routes (/api/proxy, /api/sms,
// /api/pdf-proxy) and static assets itself.
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const port = process.env.PORT || 3000
const app = next({ dev: false })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res, parse(req.url, true))
  }).listen(port, () => {
    console.log(`> Admin dashboard ready on port ${port}`)
  })
})
