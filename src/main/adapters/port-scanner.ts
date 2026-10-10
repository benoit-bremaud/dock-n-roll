import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ListeningSocket } from '../domain/types'

const run = promisify(execFile)

// users:(("name",pid=123,fd=4),...) — names are quoted and may contain spaces or commas.
const FIRST_PROCESS = /users:\(\("((?:[^"\\]|\\.)*)",pid=(\d+)/

/** Splits `addr:port` on the last colon: IPv6 addresses (`[::1]:631`) contain colons too. */
function splitAddress(local: string): { address: string; port: number } | null {
  const colon = local.lastIndexOf(':')
  if (colon <= 0) return null
  const port = Number(local.slice(colon + 1))
  return Number.isInteger(port) && port > 0 && port <= 65535 ? { address: local.slice(0, colon), port } : null
}

/**
 * TCP listening sockets from `ss -ltnpH` output. Unprivileged `ss` omits the process of
 * root-owned sockets (spec R3): those come back without `process`. Never throws.
 */
export function parseSsListening(output: string): ListeningSocket[] {
  const sockets: ListeningSocket[] = []
  for (const line of output.split('\n')) {
    const fields = line.trim().split(/\s+/)
    // State, Recv-Q, Send-Q, Local Address:Port, Peer Address:Port, [Process]
    if (fields[0] !== 'LISTEN' || fields[3] === undefined) continue
    const local = splitAddress(fields[3])
    if (local === null) continue
    const process = FIRST_PROCESS.exec(line)
    sockets.push(
      process?.[1] !== undefined && process[2] !== undefined
        ? { ...local, process: { name: process[1], pid: Number(process[2]) } }
        : local
    )
  }
  return sockets
}

/** Runs `ss` (no shell) and parses its output. */
export async function scanListeningPorts(): Promise<ListeningSocket[]> {
  const { stdout } = await run('ss', ['-ltnpH'], { timeout: 5000 })
  return parseSsListening(stdout)
}
