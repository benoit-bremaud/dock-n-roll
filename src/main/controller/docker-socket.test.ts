import { describe, expect, it } from 'vitest'
import { dockerSocketPath } from './docker-socket'

describe('dockerSocketPath — one socket for observer and runner (ADR-0002)', () => {
  it('uses the standard socket by default', () => {
    expect(dockerSocketPath({})).toBe('/var/run/docker.sock')
  })

  it('follows a unix DOCKER_HOST, as rootless Docker sets it', () => {
    expect(dockerSocketPath({ DOCKER_HOST: 'unix:///run/user/1000/docker.sock' })).toBe('/run/user/1000/docker.sock')
  })

  it.each(['tcp://remote:2375', 'ssh://host', 'unix://relative.sock'])('ignores a DOCKER_HOST the observer cannot use: %s', (host) => {
    expect(dockerSocketPath({ DOCKER_HOST: host })).toBe('/var/run/docker.sock')
  })
})
