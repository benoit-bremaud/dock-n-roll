import { describe, expect, it } from 'vitest'
import { composeProjectOf, isRelevant } from './compose-labels'
import { composeLabels, container } from './test-fixtures'

describe('composeProjectOf', () => {
  it('reads the project name, working dir and config file from Compose labels', () => {
    const snapshot = container({ labels: composeLabels('sonarqube', '/home/u/sonarqube-stack', '/home/u/sonarqube-stack/docker-compose.yml') })

    expect(composeProjectOf(snapshot)).toEqual({
      name: 'sonarqube',
      workingDir: '/home/u/sonarqube-stack',
      configFiles: ['/home/u/sonarqube-stack/docker-compose.yml']
    })
  })

  it('splits a comma-separated config_files label into one path per file', () => {
    const snapshot = container({ labels: composeLabels('app', '/srv/app', '/srv/app/compose.yaml,/srv/app/compose.override.yaml') })

    expect(composeProjectOf(snapshot)?.configFiles).toEqual(['/srv/app/compose.yaml', '/srv/app/compose.override.yaml'])
  })

  it('returns null for a container started outside Compose', () => {
    expect(composeProjectOf(container({ labels: {} }))).toBeNull()
  })

  it('returns null when the working dir label is missing', () => {
    expect(composeProjectOf(container({ labels: { 'com.docker.compose.project': 'app' } }))).toBeNull()
  })
})

describe('isRelevant', () => {
  it('keeps a regular Compose container', () => {
    expect(isRelevant(container({ labels: composeLabels('app', '/srv/app') }))).toBe(true)
  })

  it('ignores a one-off container left by `docker compose run`', () => {
    const labels = { ...composeLabels('app', '/srv/app'), 'com.docker.compose.oneoff': 'True' }

    expect(isRelevant(container({ labels }))).toBe(false)
  })
})
