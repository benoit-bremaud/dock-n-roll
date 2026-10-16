// Pure log handling of UC7 (diagram 14, ADR-0008): Docker frames in, clean text lines out.

/** A longer line is cut, so one runaway line cannot fill the IPC push. */
export const MAX_LINE_CHARS = 2000
/** Lines asked from Docker (`tail`) and kept in the panel: a reopen shows the same window. */
export const MAX_LOG_LINES = 500
/** Docker cuts frames at a few KiB; a larger declared size means a corrupt or misread stream. */
export const MAX_FRAME_BYTES = 1024 * 1024

const HEADER_BYTES = 8

/* eslint-disable no-control-regex -- removing control characters is the point */
/** CSI (`ESC [ … final`) and OSC (`ESC ] … BEL` or `ESC ] … ESC \`) sequences: colours, cursor moves, titles. */
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
/** Every other control character but tab. */
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/g
/* eslint-enable no-control-regex */

/**
 * Splits Docker's multiplexed stream (no TTY): frames of an 8-byte header — stream 0/1/2, 3 zero
 * bytes, big-endian payload size — then the payload. A frame cut by the chunk boundary is
 * returned in `rest`, to prepend to the next chunk. `invalid` when a header is not one of
 * Docker's or declares more than `MAX_FRAME_BYTES`: the stream must be dropped, not buffered.
 */
export function parseLogFrames(data: Uint8Array): { payloads: Uint8Array[]; rest: Uint8Array; invalid: boolean } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const payloads: Uint8Array[] = []
  let offset = 0
  while (data.length - offset >= HEADER_BYTES) {
    const size = view.getUint32(offset + 4)
    const header = (data[offset] ?? 0) <= 2 && data[offset + 1] === 0 && data[offset + 2] === 0 && data[offset + 3] === 0
    if (!header || size > MAX_FRAME_BYTES) return { payloads, rest: new Uint8Array(), invalid: true }
    const end = offset + HEADER_BYTES + size
    if (end > data.length) break
    payloads.push(data.subarray(offset + HEADER_BYTES, end))
    offset = end
  }
  return { payloads, rest: data.slice(offset), invalid: false }
}

/** Text only: escape sequences and control characters removed, cut at `MAX_LINE_CHARS`. */
export function cleanLogLine(line: string): string {
  // Cut before the regexes too (with room for the sequences they remove): bounded work per line.
  return line.slice(0, MAX_LINE_CHARS * 4).replaceAll(ANSI, '').replaceAll(CONTROL, '').slice(0, MAX_LINE_CHARS)
}

/** Adds the complete lines of `text` (after `partial`, the unfinished line so far) and keeps the last `max`. */
export function appendLogText(lines: readonly string[], partial: string, text: string, max: number): { lines: string[]; partial: string } {
  const parts = (partial + text).split('\n')
  const unfinished = parts.pop() ?? ''
  // Only the lines that can survive are cleaned.
  return { lines: [...lines, ...parts.slice(-max).map(cleanLogLine)].slice(-max), partial: unfinished.slice(0, MAX_LINE_CHARS * 4) }
}
