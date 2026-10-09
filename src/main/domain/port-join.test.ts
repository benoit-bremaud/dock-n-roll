import { describe, expect, it } from 'vitest'
import { joinPorts } from './port-join'
import { container } from './test-fixtures'

const sonarqube = container({
  name: 'sonarqube',
  publishedPorts: [
    { hostIp: '0.0.0.0', hostPort: 9000, containerPort: 9000, protocol: 'tcp' },
    { hostIp: '::', hostPort: 9000, containerPort: 9000, protocol: 'tcp' }
  ]
})

describe('joinPorts — spec UC4 and R3', () => {
  it('names the process when ss can see it', () => {
    expect(joinPorts([{ address: '127.0.0.1', port: 4321, process: { name: 'node', pid: 42 } }], [])).toEqual([
      { address: '127.0.0.1', port: 4321, owner: { kind: 'process', name: 'node', pid: 42 } }
    ])
  })

  it('falls back to the container publishing a root-owned port', () => {
    expect(joinPorts([{ address: '0.0.0.0', port: 9000 }], [sonarqube])).toEqual([
      { address: '0.0.0.0', port: 9000, owner: { kind: 'container', name: 'sonarqube' } }
    ])
  })

  it('lists the IPv4 and IPv6 sockets of one published port once', () => {
    const ports = joinPorts([{ address: '0.0.0.0', port: 9000 }, { address: '[::]', port: 9000 }], [sonarqube])

    expect(ports).toHaveLength(1)
  })

  it('reports an unknown owner when neither ss nor Docker knows it', () => {
    expect(joinPorts([{ address: '127.0.0.53', port: 53 }], [])).toEqual([
      { address: '127.0.0.53', port: 53, owner: { kind: 'unknown' } }
    ])
  })

  it('ignores ports published by stopped containers', () => {
    const stopped = container({ ...sonarqube, state: 'exited' })

    expect(joinPorts([{ address: '0.0.0.0', port: 9000 }], [stopped])[0]?.owner).toEqual({ kind: 'unknown' })
  })

  it('sorts the result by port', () => {
    const ports = joinPorts([{ address: '0.0.0.0', port: 8080 }, { address: '127.0.0.1', port: 631 }], [])

    expect(ports.map((p) => p.port)).toEqual([631, 8080])
  })
})
