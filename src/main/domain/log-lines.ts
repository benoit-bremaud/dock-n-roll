// Pure log handling of UC7 (diagram 14, ADR-0008): Docker frames in, clean text lines out.

/** A longer line is cut, so one runaway line cannot fill the IPC push. */
export const MAX_LINE_CHARS = 2000

const HEADER_BYTES = 8

/* eslint-disable no-control-regex -- removing control characters is the point */
/** CSI (`ESC [ … final`) and OSC (`ESC ] … BEL` or `ESC ] … ESC \`) sequences: colours, cursor moves, titles. */
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
/** Every other control character but tab. */
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/g
/* eslint-enable no-control-regex */

/**
 * Splits Docker's multiplexed stream (no TTY): frames of an 8-byte header — stream, 3 zero
 * bytes, big-endian payload size — then the payload. A frame cut by the chunk boundary is
 * returned in `rest`, to prepend to the next chunk.
 */
export function parseLogFrames(data: Uint8Array): { payloads: Uint8Array[]; rest: Uint8Array } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const payloads: Uint8Array[] = []
  let offset = 0
  while (data.length - offset >= HEADER_BYTES) {
    const end = offset + HEADER_BYTES + view.getUint32(offset + 4)
    if (end > data.length) break
    payloads.push(data.subarray(offset + HEADER_BYTES, end))
    offset = end
  }
  return { payloads, rest: data.slice(offset) }
}

/** Text only: escape sequences and control characters removed, cut at `MAX_LINE_CHARS`. */
export function cleanLogLine(line: string): string {
  return line.replaceAll(ANSI, '').replaceAll(CONTROL, '').slice(0, MAX_LINE_CHARS)
}

/** Adds the complete lines of `text` (after `partial`, the unfinished line so far) and keeps the last `max`. */
export function appendLogText(lines: readonly string[], partial: string, text: string, max: number): { lines: string[]; partial: string } {
  const parts = (partial + text).split('\n')
  const unfinished = parts.pop() ?? ''
  return { lines: [...lines, ...parts.map(cleanLogLine)].slice(-max), partial: unfinished.slice(0, MAX_LINE_CHARS) }
}
