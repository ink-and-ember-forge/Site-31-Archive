// Hooks for the authoring tool, which shows this viewer in a frame as its live preview.
// They do nothing on the website: they only act when the page is inside that frame (`?instant`).

/** The preview reloads on every edit, so it skips the opening animation. */
export const instant = typeof location !== 'undefined' && new URLSearchParams(location.search).has('instant');

const inAuthorFrame = instant && typeof window !== 'undefined' && window.parent !== window;

export type AuthorMessage =
  | { type: 'select'; doc: string }
  | { type: 'layout'; doc: string; x: number; y: number };

/** Tells the authoring tool what the author just did on the table. */
export function notifyAuthor(message: AuthorMessage): void {
  if (inAuthorFrame) window.parent.postMessage({ source: 'archive-viewer', ...message }, 'app://author');
}
