import { describe, expect, it } from 'vitest'
import { composeLabelsOf, isRelevant } from './compose-labels'
import { composeLabels, container } from './test-fixtures'

describe('composeLabelsOf', () => {
  it('reads the project name, working dir and config file from Compose labels', () => {
    const snapshot = container({ labels: composeLabels('sonarqube', '/home/u/sonarqube-stack', '/home/u/sonarqube-stack/docker-compose.yml') })

    expect(composeLabelsOf(snapshot)).toEqual({
      kind: 'valid',
      ref: { name: 'sonarqube', workingDir: '/home/u/sonarqube-stack', configFiles: ['/home/u/sonarqube-stack/docker-compose.yml'] }
    })
  })

  it('splits a comma-separated config_files label and trims each path', () => {
    const snapshot = container({ labels: composeLabels('app', '/srv/app', '/srv/app/a.yaml, /srv/app/b.yaml') })

    expect(composeLabelsOf(snapshot)).toEqual({
      kind: 'valid',
      ref: { name: 'app', workingDir: '/srv/app', configFiles: ['/srv/app/a.yaml', '/srv/app/b.yaml'] }
    })
  })

  it('normalizes the working dir and config file paths', () => {
    const snapshot = container({ labels: composeLabels('app', '/srv/app/', '/srv/app//compose.yaml') })

    expect(composeLabelsOf(snapshot)).toEqual({
      kind: 'valid',
      ref: { name: 'app', workingDir: '/srv/app', configFiles: ['/srv/app/compose.yaml'] }
    })
  })

  it('reports a container started outside Compose as none', () => {
    expect(composeLabelsOf(container({ labels: {} }))).toEqual({ kind: 'none' })
  })

  it.each([
    [composeLabels('app', 'srv/app'), 'app', 'srv/app', 'working dir is not an absolute path: "srv/app"'],
    [composeLabels('', '/srv/app'), '', '/srv/app', 'not a valid Compose project name: ""'],
    [composeLabels('Bad Name', '/srv/app'), 'Bad Name', '/srv/app', 'not a valid Compose project name: "Bad Name"'],
    [composeLabels('app', '/srv/app', 'compose.yaml'), 'app', '/srv/app', 'config file is not an absolute path: "compose.yaml"'],
    [{ 'com.docker.compose.project': 'app' }, 'app', '', 'missing working dir label']
  ])('keeps a container with unsafe labels as invalid, with its raw labels and the reason (spec §10 P2): %j', (labels, rawProject, rawWorkingDir, reason) => {
    expect(composeLabelsOf(container({ labels }))).toEqual({ kind: 'invalid', rawProject, rawWorkingDir, reason })
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
