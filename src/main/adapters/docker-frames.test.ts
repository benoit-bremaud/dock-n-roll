import { describe, expect, it } from 'vitest'
import { MAX_FRAME_BYTES, parseLogFrames } from './docker-frames'

const OVER_CAP = MAX_FRAME_BYTES + 1

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function frame(stream: 1 | 2, text: string): Uint8Array {
  const payload = encoder.encode(text)
  const header = new Uint8Array(8)
  header[0] = stream
  new DataView(header.buffer).setUint32(4, payload.length)
  return new Uint8Array([...header, ...payload])
}

const texts = (frames: { readonly bytes: Uint8Array }[]): string[] => frames.map((f) => decoder.decode(f.bytes))

describe('parseLogFrames — diagram 14', () => {
  it('splits stdout and stderr frames', () => {
    const { frames, rest } = parseLogFrames(new Uint8Array([...frame(1, 'out\n'), ...frame(2, 'err\n')]))

    expect(texts(frames)).toEqual(['out\n', 'err\n'])
    expect(frames.map((f) => f.stream)).toEqual([1, 2])
    expect(rest).toHaveLength(0)
  })

  it('reads the size big-endian (cap check of the case below)', () => {
    expect(new DataView(new Uint8Array([0x00, 0x10, 0x00, 0x01]).buffer).getUint32(0)).toBe(OVER_CAP)
  })

  it.each([
    ['an unknown stream byte', [7, 0, 0, 0, 0, 0, 0, 1]],
    ['non-zero padding', [1, 0, 9, 0, 0, 0, 0, 1]],
    ['a frame over the cap', [1, 0, 0, 0, 0x00, 0x10, 0x00, 0x01]] // MAX_FRAME_BYTES + 1, big-endian
  ])('flags %s as invalid, keeping the frames before it and buffering nothing', (_name, header) => {
    const { frames, rest, invalid } = parseLogFrames(new Uint8Array([...frame(1, 'ok\n'), ...header]))

    expect(texts(frames)).toEqual(['ok\n'])
    expect(rest).toHaveLength(0)
    expect(invalid).toBe(true)
  })

  it('keeps a frame split across chunks, header or payload, for the next chunk', () => {
    const whole = frame(1, 'hello\n')

    const first = parseLogFrames(whole.slice(0, 5))
    expect(first.frames).toEqual([])
    const second = parseLogFrames(new Uint8Array([...first.rest, ...whole.slice(5, 10)]))
    expect(second.frames).toEqual([])
    const third = parseLogFrames(new Uint8Array([...second.rest, ...whole.slice(10)]))

    expect(texts(third.frames)).toEqual(['hello\n'])
    expect(third.rest).toHaveLength(0)
  })

  it('returns nothing for an empty chunk', () => {
    expect(parseLogFrames(new Uint8Array())).toEqual({ frames: [], rest: new Uint8Array(), invalid: false })
  })
})

