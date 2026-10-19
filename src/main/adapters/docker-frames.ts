// Docker's multiplexed log stream (diagram 14, ADR-0008): bytes in, frames per stream out.

/** Docker cuts frames at a few KiB; a larger declared size means a corrupt or misread stream. */
export const MAX_FRAME_BYTES = 1024 * 1024

const HEADER_BYTES = 8

/** One frame: 1 stdout, 2 stderr (0 stdin is never sent for logs). */
export interface LogFrame {
  readonly stream: number
  readonly bytes: Uint8Array
}

/**
 * Splits Docker's multiplexed stream (no TTY): frames of an 8-byte header — stream 0/1/2, 3 zero
 * bytes, big-endian payload size — then the payload. A frame cut by the chunk boundary is
 * returned in `rest`, to prepend to the next chunk. `invalid` when a header is not one of
 * Docker's or declares more than `MAX_FRAME_BYTES`: the stream must be dropped, not buffered.
 */
export function parseLogFrames(data: Uint8Array): { frames: LogFrame[]; rest: Uint8Array; invalid: boolean } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const frames: LogFrame[] = []
  let offset = 0
  while (data.length - offset >= HEADER_BYTES) {
    const stream = data[offset] ?? 0
    const size = view.getUint32(offset + 4)
    const header = stream <= 2 && data[offset + 1] === 0 && data[offset + 2] === 0 && data[offset + 3] === 0
    if (!header || size > MAX_FRAME_BYTES) return { frames, rest: new Uint8Array(), invalid: true }
    const end = offset + HEADER_BYTES + size
    if (end > data.length) break
    frames.push({ stream, bytes: data.subarray(offset + HEADER_BYTES, end) })
    offset = end
  }
  return { frames, rest: data.slice(offset), invalid: false }
}
