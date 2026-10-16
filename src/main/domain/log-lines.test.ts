import { describe, expect, it } from 'vitest'
import { appendLogText, cleanLogLine, MAX_LINE_CHARS, parseLogFrames } from './log-lines'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function frame(stream: 1 | 2, text: string): Uint8Array {
  const payload = encoder.encode(text)
  const header = new Uint8Array(8)
  header[0] = stream
  new DataView(header.buffer).setUint32(4, payload.length)
  return new Uint8Array([...header, ...payload])
}

const texts = (payloads: Uint8Array[]): string[] => payloads.map((payload) => decoder.decode(payload))

describe('parseLogFrames — diagram 14', () => {
  it('splits stdout and stderr frames', () => {
    const { payloads, rest } = parseLogFrames(new Uint8Array([...frame(1, 'out\n'), ...frame(2, 'err\n')]))

    expect(texts(payloads)).toEqual(['out\n', 'err\n'])
    expect(rest).toHaveLength(0)
  })

  it('keeps a frame split across chunks, header or payload, for the next chunk', () => {
    const whole = frame(1, 'hello\n')

    const first = parseLogFrames(whole.slice(0, 5))
    expect(first.payloads).toEqual([])
    const second = parseLogFrames(new Uint8Array([...first.rest, ...whole.slice(5, 10)]))
    expect(second.payloads).toEqual([])
    const third = parseLogFrames(new Uint8Array([...second.rest, ...whole.slice(10)]))

    expect(texts(third.payloads)).toEqual(['hello\n'])
    expect(third.rest).toHaveLength(0)
  })

  it('returns nothing for an empty chunk', () => {
    expect(parseLogFrames(new Uint8Array())).toEqual({ payloads: [], rest: new Uint8Array() })
  })
})

describe('cleanLogLine — text only', () => {
  it.each([
    ['\u001b[31mred\u001b[0m text', 'red text'],
    ['\u001b]0;title\u0007after', 'after'],
    ['progress\r', 'progress'],
    ['bell\u0007 and nul\u0000', 'bell and nul'],
    ['tab\tkept', 'tab\tkept']
  ])('cleans %j', (raw, clean) => {
    expect(cleanLogLine(raw)).toBe(clean)
  })

  it('cuts a line longer than the cap', () => {
    expect(cleanLogLine('x'.repeat(MAX_LINE_CHARS + 10))).toHaveLength(MAX_LINE_CHARS)
  })
})

describe('appendLogText', () => {
  it('adds complete lines and keeps the unfinished one for later', () => {
    const first = appendLogText([], '', 'a\nb', 10)
    expect(first).toEqual({ lines: ['a'], partial: 'b' })

    expect(appendLogText(first.lines, first.partial, 'c\n', 10)).toEqual({ lines: ['a', 'bc'], partial: '' })
  })

  it('keeps only the last lines', () => {
    expect(appendLogText(['1', '2'], '', '3\n4\n', 3).lines).toEqual(['2', '3', '4'])
  })

  it('cleans each line', () => {
    expect(appendLogText([], '', '\u001b[1mbold\u001b[0m\n', 10).lines).toEqual(['bold'])
  })
})
