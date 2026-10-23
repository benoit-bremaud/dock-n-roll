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

    expect(ports).toEqual([{ address: '0.0.0.0', port: 9000, owner: { kind: 'container', name: 'sonarqube' } }])
  })

  it('keeps the best-known owner when merging the IPv4 and IPv6 sockets of a port', () => {
    const ports = joinPorts([{ address: '0.0.0.0', port: 80 }, { address: '[::]', port: 80, process: { name: 'nginx', pid: 7 } }], [])

    expect(ports).toEqual([{ address: '0.0.0.0', port: 80, owner: { kind: 'process', name: 'nginx', pid: 7 } }])
  })

  it('prefers the process seen by ss over a container publishing the same port', () => {
    expect(joinPorts([{ address: '0.0.0.0', port: 9000, process: { name: 'java', pid: 9 } }], [sonarqube])[0]?.owner).toEqual({
      kind: 'process',
      name: 'java',
      pid: 9
    })
  })

  it('does not credit a container publishing a UDP port with a TCP listener', () => {
    const dns = container({ name: 'dns', publishedPorts: [{ hostIp: '127.0.0.1', hostPort: 53, containerPort: 53, protocol: 'udp' }] })

    expect(joinPorts([{ address: '127.0.0.53%lo', port: 53 }], [dns])[0]?.owner).toEqual({ kind: 'unknown' })
  })

  it('does not credit a container bound to one address with a listener on another', () => {
    const db = container({ name: 'db', publishedPorts: [{ hostIp: '127.0.0.1', hostPort: 5432, containerPort: 5432, protocol: 'tcp' }] })

    expect(joinPorts([{ address: '[::1]', port: 5432 }], [db])[0]?.owner).toEqual({ kind: 'unknown' })
  })

  it.each([
    ['[fe80::1%eth0]', 'fe80::1'],
    ['127.0.0.1%lo%x', '127.0.0.1'],
    ['[::1', '::1'],
    ['::1]', '::1']
  ])('strips brackets and zone of %s before comparing with Docker', (address, hostIp) => {
    const db = container({ name: 'db', publishedPorts: [{ hostIp, hostPort: 5432, containerPort: 5432, protocol: 'tcp' }] })

    expect(joinPorts([{ address, port: 5432 }], [db])[0]?.owner).toMatchObject({ kind: 'container' })
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
