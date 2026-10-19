// Pure log handling of UC7 (diagram 14, ADR-0008): decoded text in, clean text lines out.

/** A longer line is cut, so one runaway line cannot fill the IPC push. */
export const MAX_LINE_CHARS = 2000
/** Lines asked from Docker (`tail`) and kept in the panel: a reopen shows the same window. */
export const MAX_LOG_LINES = 500

/* eslint-disable no-control-regex -- removing control characters is the point */
/** CSI (`ESC [ … final`) and OSC (`ESC ] … BEL` or `ESC ] … ESC \`) sequences: colours, cursor moves, titles. */
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
/** Every other control character but tab. */
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/g
/* eslint-enable no-control-regex */

/**
 * Text only: what a terminal shows of a line redrawn with `\r` (its last segment, a trailing
 * `\r` ignored), escape sequences and control characters removed, cut at `MAX_LINE_CHARS`.
 */
export function cleanLogLine(line: string): string {
  let end = line.length
  while (line[end - 1] === '\r') end -= 1
  // Last redraw first, then the cut (with room for the sequences the regexes remove): bounded
  // work per line, and a long progress line still shows its last state.
  return line
    .slice(line.lastIndexOf('\r', end - 1) + 1, end)
    .slice(0, MAX_LINE_CHARS * 4).replaceAll(ANSI, '').replaceAll(CONTROL, '').slice(0, MAX_LINE_CHARS)
}

/** Adds the complete lines of `text` (after `partial`, the unfinished line so far) and keeps the last `max`. */
export function appendLogText(lines: readonly string[], partial: string, text: string, max: number): { lines: string[]; partial: string } {
  const parts = (partial + text).split('\n')
  const unfinished = parts.pop() ?? ''
  // Only the lines that can survive are cleaned.
  // The unfinished line keeps its last redraw (a final `\r` stays: the next text overwrites it).
  const redraw = unfinished.slice(unfinished.lastIndexOf('\r', unfinished.length - 2) + 1)
  return { lines: [...lines, ...parts.slice(-max).map(cleanLogLine)].slice(-max), partial: redraw.slice(0, MAX_LINE_CHARS * 4) }
}
