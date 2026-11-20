/**
 * Text hotspots are marked spans in Markdown: `[the words]{#hotspot-id}`.
 * Returns the hotspot ids found in the text.
 */
export function extractSpanIds(markdown: string): string[] {
  const ids: string[] = [];
  for (const match of markdown.matchAll(/\[[^\]]+\]\{#([a-z0-9]+(?:-[a-z0-9]+)*)\}/g)) ids.push(match[1]);
  return ids;
}
