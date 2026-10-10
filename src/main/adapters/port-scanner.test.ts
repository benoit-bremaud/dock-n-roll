import { describe, expect, it } from 'vitest'
import { parseSsListening, scanListeningPorts } from './port-scanner'

// Lines recorded from `ss -ltnpH` on the workstation (2026-10-10).
const RECORDED = [
  'LISTEN 0      511                      127.0.0.1:18791 0.0.0.0:* users:(("openclaw-gatewa",pid=1875,fd=33))  ',
  'LISTEN 0      511                      127.0.0.1:4401  0.0.0.0:* users:(("ng serve --host",pid=132719,fd=52))',
  'LISTEN 0      4096                    127.0.0.54:53    0.0.0.0:*                                             ',
  'LISTEN 0      4096                 127.0.0.53%lo:53    0.0.0.0:*',
  'LISTEN 0      4096                          [::]:9000     [::]:*',
  'LISTEN 0      511                          [::1]:18789    [::]:* users:(("openclaw-gatewa",pid=1875,fd=23))  ',
  'LISTEN 0      4096   [fd7a:115c:a1e0::fe01:55af]:42061    [::]:*'
].join('\n')

describe('parseSsListening', () => {
  it('reads address, port and owning process from recorded ss output', () => {
    expect(parseSsListening(RECORDED)).toEqual([
      { address: '127.0.0.1', port: 18791, process: { name: 'openclaw-gatewa', pid: 1875 } },
      { address: '127.0.0.1', port: 4401, process: { name: 'ng serve --host', pid: 132719 } },
      { address: '127.0.0.54', port: 53 },
      { address: '127.0.0.53%lo', port: 53 },
      { address: '[::]', port: 9000 },
      { address: '[::1]', port: 18789, process: { name: 'openclaw-gatewa', pid: 1875 } },
      { address: '[fd7a:115c:a1e0::fe01:55af]', port: 42061 }
    ])
  })

  it('keeps the first process when several share a socket', () => {
    const line = 'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=900,fd=3),("systemd",pid=1,fd=40))'

    expect(parseSsListening(line)).toEqual([{ address: '0.0.0.0', port: 22, process: { name: 'sshd', pid: 900 } }])
  })

  it('reads a wildcard written as *', () => {
    expect(parseSsListening('LISTEN 0 4096 *:8080 *:*')).toEqual([{ address: '*', port: 8080 }])
  })

  it('ignores blank and malformed lines instead of throwing', () => {
    expect(parseSsListening('\n  \nLISTEN garbage\nLISTEN 0 1 127.0.0.1:notaport 0.0.0.0:*\n')).toEqual([])
  })
})

describe('scanListeningPorts', () => {
  it('runs the real ss and returns typed sockets', async () => {
    const sockets = await scanListeningPorts()

    expect(Array.isArray(sockets)).toBe(true)
    for (const socket of sockets) {
      expect(Number.isInteger(socket.port)).toBe(true)
    }
  })
})
