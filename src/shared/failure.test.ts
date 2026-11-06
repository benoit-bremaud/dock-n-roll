import { describe, expect, it } from 'vitest'
import { failedLabel, lastLine } from './failure'

describe('failedLabel / lastLine (#85)', () => {
  it.each([
    ['start', 'Start failed'],
    ['stop', 'Stop failed'],
    ['restart', 'Restart failed']
  ] as const)('names a failed %s', (operation, label) => {
    expect(failedLabel({ operation, message: 'boom', occurrence: 1 })).toBe(label)
  })

  it('keeps the last line of the message', () => {
    expect(lastLine({ operation: 'start', message: 'Container a Waiting\ncontainer a exited (3)', occurrence: 1 })).toBe('container a exited (3)')
    expect(lastLine({ operation: 'stop', message: 'boom', occurrence: 1 })).toBe('boom')
  })
})
