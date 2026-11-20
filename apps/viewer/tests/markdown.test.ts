import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/lib/markdown';

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines', () => {
    expect(parseMarkdown('one\n\ntwo')).toHaveLength(2);
  });

  it('keeps a single line break as a line break, and a blank line as a new paragraph', () => {
    const blocks = parseMarkdown('line one\nline two\n\nnext paragraph');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ t: 'p', inline: [{ t: 'text', text: 'line one\nline two' }] });
  });

  it('extracts hotspot spans', () => {
    const [p] = parseMarkdown('see [the words]{#note-1} here');
    expect(p).toEqual({
      t: 'p',
      inline: [
        { t: 'text', text: 'see ' },
        { t: 'span', id: 'note-1', text: 'the words' },
        { t: 'text', text: ' here' },
      ],
    });
  });

  it('parses a pipe table', () => {
    const [t] = parseMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(t.t).toBe('table');
    if (t.t === 'table') {
      expect(t.head).toHaveLength(2);
      expect(t.rows).toHaveLength(1);
    }
  });

  it('never produces HTML: markup in content stays plain text', () => {
    const [p] = parseMarkdown('<img src=x onerror=alert(1)>');
    expect(p).toEqual({ t: 'p', inline: [{ t: 'text', text: '<img src=x onerror=alert(1)>' }] });
  });

  it('returns nothing for empty input', () => {
    expect(parseMarkdown('  \n ')).toEqual([]);
  });
});
