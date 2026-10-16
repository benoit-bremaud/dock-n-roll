// E2E smoke of the packaged app (ADR-0010, diagram 10): run under a display, e.g. `xvfb-run -a pnpm e2e:smoke`.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { FuseV1Options, FuseState, getCurrentFuseWire } from '@electron/fuses'
import { chromium } from 'playwright-core'

const BINARY = resolve(process.argv[2] ?? 'dist/linux-unpacked/dock-n-roll')
const DASHBOARD_URL = 'app://dashboard/index.html'
const TRAVERSAL_URL = 'app://dashboard/..%2f..%2fetc%2fpasswd'
const TIMEOUT_MS = 30_000

/** A port free at the time of the call, for the CDP endpoint. */
function freePort() {
  return new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })
}

function check(condition, message) {
  if (!condition) throw new Error(`smoke: ${message}`)
  console.log(`ok - ${message}`)
}

/** Retries the CDP connection while the first instance starts. */
async function connect(endpoint) {
  const deadline = Date.now() + TIMEOUT_MS
  for (;;) {
    try {
      return await chromium.connectOverCDP(endpoint)
    } catch (error) {
      if (Date.now() > deadline) throw error
      await delay(250)
    }
  }
}

async function main() {
  const fuses = await getCurrentFuseWire(BINARY)
  check(fuses[FuseV1Options.GrantFileProtocolExtraPrivileges] === FuseState.DISABLE, 'fuse GrantFileProtocolExtraPrivileges is off')

  const configHome = await mkdtemp(join(tmpdir(), 'dock-n-roll-smoke-'))
  const env = { ...process.env, XDG_CONFIG_HOME: configHome }
  const port = await freePort()
  const first = spawn(BINARY, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env, stdio: 'inherit' })
  let browser
  try {
    browser = await connect(`http://127.0.0.1:${port}`)
    const context = browser.contexts()[0]
    const opened = context.waitForEvent('page', { timeout: TIMEOUT_MS })
    // A second launch hits the single-instance lock: the first one opens the dashboard.
    const second = spawn(BINARY, [], { env, stdio: 'inherit' })
    const page = await opened

    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    // Reload with the listeners attached so load-time errors (CSP included) are caught.
    await page.reload({ waitUntil: 'load' })

    check(page.url() === DASHBOARD_URL, `page URL is ${DASHBOARD_URL}`)
    check((await page.title()) === 'dock-n-roll', 'title is dock-n-roll')
    await page.locator('#root > *').first().waitFor({ timeout: TIMEOUT_MS })
    check(true, 'React root renders')
    const state = await page.evaluate(() => window.dockNRoll.getState().then(() => 'answered'))
    check(state === 'answered', 'window.dockNRoll.getState() answers (Docker may be unavailable)')
    // Checked before the 404 probe, which Chromium logs as a failed resource.
    check(errors.length === 0, `no console or CSP error${errors.length ? `: ${errors.join(' | ')}` : ''}`)
    const status = await page.evaluate((url) => fetch(url).then((response) => response.status), TRAVERSAL_URL)
    check(status === 404, `${TRAVERSAL_URL} answers 404`)
    second.kill()
  } finally {
    await browser?.close().catch(() => undefined)
    // The app writes to its config dir until it exits: remove it afterwards.
    if (first.exitCode === null && first.signalCode === null) {
      const exited = once(first, 'exit')
      first.kill()
      await exited
    }
    await rm(configHome, { recursive: true, force: true })
  }
}

await main()
