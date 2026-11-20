// Tiny, safe Markdown subset: paragraphs, pipe tables, and hotspot spans `[text]{#id}`.
// It returns data, never HTML, so nothing from a package is injected into the page.

export type Inline = { t: 'text'; text: string } | { t: 'span'; id: string; text: string };
export type MdBlock =
  | { t: 'p'; inline: Inline[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

const SPAN = /\[([^\]]+)\]\{#([a-z0-9]+(?:-[a-z0-9]+)*)\}/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(SPAN)) {
    if (m.index! > last) out.push({ t: 'text', text: text.slice(last, m.index) });
    out.push({ t: 'span', id: m[2], text: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) });
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

const isSeparator = (line: string) => /^\|?[\s:|-]+\|?$/.test(line) && line.includes('-');

export function parseMarkdown(source: string): MdBlock[] {
  return source
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): MdBlock => {
      const lines = chunk.split('\n').map((l) => l.trim());
      if (lines.length >= 2 && lines.every((l) => l.startsWith('|'))) {
        const body = lines.filter((l, i) => !(i === 1 && isSeparator(l)));
        return { t: 'table', head: cells(body[0]), rows: body.slice(1).map(cells) };
      }
      // A single line break stays a line break (see Rich), so addresses and typed lines keep their lines.
      return { t: 'p', inline: parseInline(lines.join('\n')) };
    });
}
