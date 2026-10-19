import { describe, expect, it } from 'vitest'
import { appendLogText, cleanLogLine, MAX_LINE_CHARS } from './log-lines'

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

  it.each([
    ['a progress bar redrawn with \\r', '10%\r50%\r100%', '100%'],
    ['a CRLF line ending', 'done\r', 'done'],
    ['several trailing \\r', 'done\r\r', 'done'],
    ['a line wiped with spaces', 'abc\r   ', '   ']
  ])('keeps what a terminal shows for %s', (_name, line, expected) => {
    expect(cleanLogLine(line)).toBe(expected)
  })

  it('keeps the last redraw of a progress line longer than the cap', () => {
    expect(cleanLogLine(`${'#'.repeat(MAX_LINE_CHARS * 5)}\rdone`)).toBe('done')
  })

  it('cuts a line longer than the cap', () => {
    expect(cleanLogLine('x'.repeat(MAX_LINE_CHARS + 10))).toHaveLength(MAX_LINE_CHARS)
  })
})

describe('appendLogText', () => {
  it('shows the last state of a progress bar written in pieces', () => {
    const first = appendLogText([], '', '10%\r', 10)
    const second = appendLogText(first.lines, first.partial, '50%\r', 10)
    const third = appendLogText(second.lines, second.partial, '100%\r\n', 10)

    expect(third).toEqual({ lines: ['100%'], partial: '' })
  })

  it('keeps the last redraw of an unfinished progress line longer than the cap', () => {
    const { partial } = appendLogText([], '', `${'#'.repeat(MAX_LINE_CHARS * 5)}\r50%`, 10)

    expect(appendLogText([], partial, '\n', 10).lines).toEqual(['50%'])
  })

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
