# Decisions

Decisions made in conversation, newest last. Each has a date and a reason.

## 2026-11-20: Viewer stack

**Vite + TypeScript + Svelte 5**, built to a static site and deployed to GitHub Pages.
*Reason:* small static bundle with no server, well suited to drag, zoom and animation, and
low boilerplate keeps the code readable.

## 2026-11-20: Authoring tool is an Electron desktop app

Authoring tool is an **Electron** app (TypeScript), packaged for macOS, Windows and Linux.
*Reason:* the author wants a native desktop tool with real file access. Trade-off accepted:
larger installers and per-OS build automation. Installers are built by the release workflow
and attached to GitHub Releases; they are unsigned for now.

## 2026-11-20: Episodes live in this repo under `episodes/`

Each episode is one package folder. Merging to `main` rebuilds and publishes the site.
*Reason:* adding an episode must be one package and no code change. The archive index
generation step will be added once the package format is agreed.

## 2026-11-20: Monorepo with npm workspaces

`apps/viewer`, `apps/author`, `packages/casefile`, `episodes/`, `docs/`.
*Reason:* the preview must use the real viewer's rendering, so the tools need to share code.
`packages/casefile` is deliberately empty until the format is approved.

## 2026-11-20: Releases and changelog via release-please

`CHANGELOG.md` and version bumps are generated from Conventional Commit PR titles; a CI
check enforces the title format. *Reason:* zero manual release steps. Squash-merge PRs so the
PR title becomes the commit message.

## 2026-11-20: Design document moved to `docs/`

`Archive Project Design Document.md` is now `docs/design-document.md` (tidier path, no spaces).

## 2026-11-20: Package source is a folder; the build produces the single file

Each episode is authored as a plain folder in `episodes/<id>/` (the source of truth, hand-editable).
The build zips each folder into one portable file and generates the archive index automatically.
*Reason:* the author wants single-file portability for sharing and upload, and hand-editability
while writing. This gives both with no manual pack step. Format details are in
`docs/package-format-proposal.md` and are NOT yet approved.

## 2026-11-20: Hotspot and handwriting choices (draft format, not yet approved)

Text hotspots are marked spans in Markdown, rectangles for images and receipts. Handwriting is a font
style applied to Markdown, not scanned images. *Reason:* robust to reflow, text stays editable, and the
look is data.

## 2026-11-20: Archive index is generated at build; episodes publish via merge to main

`index.json` is never hand-edited: the build generates it from each episode's `case.json`. Static hosting
cannot list folders, so a generated index is required. Live GitHub API lookup and chained manifests were
rejected (rate limits and host lock-in; slow and fragile). Episodes go live when merged to `main`, which
redeploys the site. *Reason:* simplest, versioned, and no manual step. Independent publishing to storage
can be added later without changing the viewer's contract.

## 2026-11-20: Package format v1 approved, with an extensibility amendment

The author approved `docs/package-format-proposal.md`. Because many document styles and layouts are
expected, "type" is split into **template** (layout), **style** (look) and **block** (building piece).
Templates and styles are data in a shared `theme/` folder, with optional per-episode overrides taking
precedence. New blocks need a deliberate viewer change; packages never contain executable code.
*Reason:* keeps new document kinds as data, keeps one consistent archive look, and keeps packages plain data.

## 2026-11-20: Package format v1 implemented

Schemas, validator, loader and archive build are in `packages/casefile`, with tests. Refinements made
while implementing, all recorded in the spec: documents hidden at the start use `hidden: true` in the
manifest (replacing the unused `appearsWhen`); unknown extra fields are ignored so additive changes are
non-breaking; unsafe paths are treated as missing. The sample episode and starter theme are placeholders.

## 2026-11-20: Viewer step 3 direction

Folder wall is a **grid of upright Manila folders**, ordered by manifest `order` then submission date.
First viewer is **functional first, art later**: simple CSS shapes that read as folders and paper, with the
look swappable through the theme. *Reason:* simple, scales as episodes accumulate and works on any screen;
get behaviour in front of the author before investing in textures.

## 2026-11-20: Minimal viewer (build step 3) built

Folder wall grid, folder-opening animation, table with drag, wheel zoom and double-click focus (others
move aside), and template-driven document rendering. Layout uses fractions of the table width, so a tall
document can overflow the table height; the authoring tool should warn about this later. Hotspot spans are
shown but inert, and hidden documents are not yet revealed: hotspots and the registry overlay are step 4.
Content is parsed to data, never injected as HTML.

## 2026-11-20: Placeholder sample shows on the live site only while the archive is empty

The production build falls back to the labelled `sample-placeholder` episode when `episodes/` has no
real episodes, so the deployed viewer can be tried. It disappears automatically when the first real
episode is merged. *Reason:* the author wanted a live link to try the viewer.

## 2026-11-20: Hotspots and registry overlay (build step 4) built

All three hotspot targets work: light-box for marginal notes, supplementary documents slide onto the table
from the document that mentions them, and the registry overlay. The overlay is a **search panel that "runs"
the lookup** (query types out, short search beat, record appears). Entries are reached **only through
hotspots and cross-references**, never free search. Cross-references to other episodes load that episode on
demand; an unpublished episode or missing entry shows as a redacted "no record on file", never an error.
Interface wording lives in `apps/viewer/src/lib/strings.ts` and is **placeholder**: the registry's voice is
the author's to write.

## 2026-11-20: Marginal notes are callouts, not an overlay

Marginal notes (light-box targets) open as small callouts beside the document with a pointer to the
highlighted words, with no dimming or blocking, replacing the full-screen light-box. Several can be open at
once; clicking the words again, the close mark, or Esc (newest first) closes them. They travel with their
document and keep a fixed readable size when it is zoomed. Notes go to the right of the document, or the left
if there is no room, and stack rather than overlap. The registry stays a full-attention overlay because it is
the archive answering back. *Reason:* the author wanted marginalia to feel lighter; mockup provided.
Callout styling is placeholder and should move into the theme later.

## 2026-11-20: Two marginal-note variants, replacing the single callout

The first callout (card with a solid wedge) was judged bulky. Marginal notes now have an optional
`variant` on the lightbox hotspot target: **formal** (default; slim dark glass card, typed voice, straight
dotted string with a dot at each end) and **note** (handwritten straight onto the table with no box, with a
curved pen line and arrow). Connectors have a light core with a dark glow so they read over both the cream
paper and the dark table. This is an additive optional field, so the format version stays at 1; the spec and
schema are updated. Colours and the handwriting font stack are placeholders in the viewer and are to move
into the shared theme (a real handwriting font is a theme asset). *Reason:* author feedback with design mocks.

## 2026-11-20: First release is 0.1.0

release-please proposed 1.0.0 for the first release even though it is configured to stay below 1.0 until
the first stable release. The author wants 0.1.0, since the viewer and authoring tool are not finished. This
is set with a one-time `Release-As: 0.1.0` commit footer, not a config setting, so it does not keep forcing
the version on later releases. Move to 1.0.0 deliberately when the first real episode ships.

## 2026-11-20: Installer build fixed after the first release failed

The v0.1.0 installer jobs failed on all three platforms. Causes found and fixed: Electron was a version range
(electron-builder needs an exact version, now pinned to 45.4.1); the Linux executable name was derived from the
scoped package name (now `archive-author`); electron-builder crashed generating auto-update info without a publish
target (publishing disabled, since the workflow uploads installers itself); and installers would have been labelled
0.0.0 because release-please only bumps the root version (the release version is now passed to the build).
The Linux AppImage build was verified end to end in the sandbox; the Mac and Windows builds could not be tested
there. **v0.1.0 has no installers attached**; the fix ships in the next release (0.1.1).
Note for later: when upgrading Electron, update the pinned version by hand.

## 2026-11-20: Next step is the writing loop first, then the authoring tool (A, then B)

Before building the Electron authoring tool, give the author a way to write episode one now: a plain-English
guide (`docs/writing-an-episode.md`), `npm run validate` (clear per-file messages with hints), and a live preview.
The preview is built into the viewer's dev server: `npm run dev:viewer` builds the archive, rebuilds when anything
in `episodes/` or `theme/` is saved, refreshes the browser, and shows mistakes as an overlay. It uses the real viewer,
so it is exactly what the reader sees. The archive build now overwrites its output in place instead of deleting the
folder (which broke the dev server's file watching). *Reason:* the design says to grow the editor from friction actually
felt while writing, and a visual editor can quietly consume the time meant for writing. The Electron authoring tool is
next, built around what the author finds painful. Not yet in the viewer: voiceover playback, ledger use, custom font
files, reader notes (all listed in the guide).

## 2026-11-20: Authoring tool comes before writing episode one

Offered the choice of writing in conversation, using the live preview on their own computer, editing on GitHub's
website, or having the authoring tool first, the author chose the **authoring tool first**: they do not want to edit
files by hand. The live preview, validate command and writing guide stay as the fallback and as the engine under
the tool. Scope still to agree before building (see the proposal): how editing works, and how a finished episode
reaches the repo. *Reason:* author preference; the design warns the editor can consume writing time, so v0 stays small.

## 2026-11-20: Authoring tool v0 approved; step 1 built

The author approved `docs/authoring-tool-v0.md` (forms beside the real viewer; the tool saves to a folder that is
uploaded on GitHub; no Publish button in v0). The author uses Windows. Step 1 is built: an Electron app with a Svelte
window, an episode form that autosaves, a problems list, and the real viewer bundled and shown in a sandboxed frame
fed by the same archive build the website uses. Design choices: the window and the preview are separate origins
(`app://author`, `app://viewer`) so the preview cannot reach the window; the window has no Node access and only a
narrow set of actions; all file work is in the main process and is tested without Electron; helpers for ids, starter
files and saving live in `packages/casefile` so the format has one owner. The app bundles the viewer and theme as of
its release, so its preview matches the app's version, not necessarily the live site. The packaged Linux build was run
end to end in the sandbox; Windows and macOS builds are produced by the release workflow.

## 2026-11-20: Authoring tool step 2 (documents) built

Documents can be added by type and name, filled through forms generated from their template (a value is a box, text is a
text area, an image is a file chooser that copies it into the episode with a description), placed by dragging on the
preview or by number, made the main document, hidden, or removed. The author chose a plain text box for document text
(not typing onto the page itself). The preview opens documents in place instead of sliding them out of the folder, since
it reloads on each edit; this also applies when the reader has reduced motion on. Every edit changes only what it means
to, so hotspots and unknown fields in a document file are preserved, ids and file paths are validated so nothing can be
written outside the episode folder, and tests cover these. The author asked to hold the pull request until step 2 was
finished, so steps 1 and 2 ship together.

## 2026-11-20: Windows build fixed; CI now checks Windows

The v0.1.2 Windows installer job failed: the archive command built its folder paths from a file URL's `.pathname`,
which on Windows is `/D:/a/...` and became `D:\D:\a\...`. Fixed by using `fileURLToPath`. Also fixed while checking for the
same class of problem: the live preview's file watcher compared Windows backslash paths with the watcher's forward-slash
paths, so on Windows saving a file would not have rebuilt the preview; and a wrong Vite log level name. A test now fails if
any source builds a path from `.pathname`, and the archive command is tested from a different working directory.
Cause of the miss: everything was tested on Linux only. CI now runs the checks on Windows as well as Linux, and builds the
Windows app (without the installer) on every pull request, so a Windows-only problem shows up before a release.
The v0.1.2 release has no Windows installer; the fix ships in the next release.
The first Windows CI run proved its worth at once: 66 of 67 tests passed and the Windows app packaged, but one test failed
because an episode's id was taken from its folder path by splitting on the system separator, which breaks on Windows paths that
mix `\` and `/`. It now splits on both (`folderName`), with a test.

## 2026-11-20: Windows app works; feedback leads to a document-forms proposal

The author installed the Windows build (v0.1.3) and said it works well. Two improvements asked for: bespoke forms per
template (a receipt with item and price columns, one currency for the list, an automatic total, and optional tax on
chosen lines), and far richer main documents with header information and real form structure, shown by three example
forms. After a visual mock, the author decided: first types are the **witness statement form and the receipt** (the
complaint form and discharge summary come later from the same parts); the filled-in voice (typed or handwritten) is
**set per template**; receipt tax is **a setting, added on top or already included**; and new layouts are **built by me
as templates on request, with no form designer in the tool**. The proposal is `docs/document-forms-proposal.md` and is
awaiting approval, since it adds new content kinds to the package format (additively, `formatVersion` stays 1).

## 2026-11-20: Document forms approved; step 1 built

The author approved `docs/document-forms-proposal.md`. Step 1 is in: template slot labels, `items` (itemised lists with one
currency, optional tax added or included, marked taxable lines) and `choices` (ticked options) content kinds, the money
maths in whole pence (never floating point, half away from zero), schema changes, and loader tolerance (a bad item, currency
or tax setting is dropped with a reason and never loses the document). `formatVersion` stays 1. Step 2 (viewer look) is next.

## 2026-11-20: Document forms step 2 (viewer look) built, awaiting sign-off

The viewer has new parts (letterhead, section bar, field grid, ruled lines, items list with computed totals, improved stamp,
decorative barcode, rule, split row), the `witness-statement` template, an upgraded `receipt`, and two filled-in voices
(typed and handwritten, as styles). The placeholder sample now uses them. Found and fixed while checking in a browser: a
page's shape must be a minimum height, not fixed (a fixed shape clipped long content); single line breaks are kept; thin
ruled lines vanished at some sizes until snapped to whole pixels; the focused view is sized from the real page shape. The
author's sign-off on the look is needed before step 3 (the tool's forms). The pull request waits for step 3, because in
between, the tool could not edit a receipt's items.

## 2026-11-20: Document forms step 3 (the tool's forms) built; look signed off

The author signed off the viewer look and asked for step 3. The tool now builds each document's form from its template (the
same sections and rows of labelled boxes as the paper), gives receipts an item table (currency, tax none/added/included with
a rate and name, taxed ticks, reorder and remove, live totals from the same code as the viewer), and starts new episodes from
the witness statement form. Safety rules: a list is saved only when every box is valid, so a half-typed price never drops a
row; item lists are re-checked strictly in the main process; and the window may only import the browser-safe parts of the
format package (a test enforces it, after a blank-window bug caused by importing the whole package). One pull request carries
the document forms work, as agreed, because releasing step 2 alone would have left the tool unable to edit receipts.

## 2026-11-20: The preview keeps its place while you edit, and follows the document being edited

The author found that every edit reloaded the preview, resetting zoom and positions, and asked that the edited document be
brought into view. Now the tool sends the viewer a "reload" message instead of replacing the frame, and the viewer swaps in the
new episode while keeping each document's drag, zoom and stacking (`tablestate.ts`, unit tested). A document's position follows
the file only when the file's own position changed (typing numbers), so width or tilt edits never snap a dragged document back.
Selecting or editing a document focuses it in the preview; editing positions steps back to the table so the move is visible.
New documents appear in place, a hidden document is revealed when it is the one being edited, and a failed reload leaves the old
table on screen. The messages are origin-checked in both directions, and do nothing on the public website.

## 2026-11-20: Richer receipts approved; step 1 (format and maths) built

The author approved `docs/receipt-proposal.md`: named tax categories on each receipt, per-item product code and quantity at unit price,
tender and change, and free-text slots for everything else, with paper wear left for later. Step 1 is in: all additive, `formatVersion`
stays 1, and older single-rate receipts load and total exactly as before (read as one category, "T"). Money stays whole pence; quantities are
held in thousandths; each category is rounded on its own so the printed table adds up. Bad categories, item fields and tenders are dropped
or ignored with a reason, never losing the receipt. The tool does not yet edit the new fields, so until step 3 such a receipt must be edited by hand.

## 2026-11-21: Richer receipts, step 2 (viewer) built

The receipt now shows what the four example receipts have: logo, store, address and detail lines, items with product codes, quantity at unit price
lines and a tax letter, subtotal and tax lines (when tax is added on top), total, tender and change due, a tax table (rate, sales, tax per category),
a payment block, notes, closing message, and a barcode with its number. New parts `tax-table` and `tender`; `paragraph` accepts a plain one-line slot
and `image` an optional `width`, so older receipts still render. Still additive, `formatVersion` 1. Paper wear remains a later step.

## 2026-11-21: Richer receipts, step 3 (the tool) built

The authoring tool now edits everything the receipt can hold: tax categories (code, name, rate) with a per-item picker and a setting for added or
included tax, product codes, quantity at unit price, tender and change, with totals from the same code as the viewer. The free-text parts (header
details, payment details, notes, closing message, barcode number) sit in collapsible form sections, named by `formSection` on a template block, so any
template can do the same. Older single-rate receipts open as one category "T" and save in the new form with the same figures. Saving never drops
the new fields, so the step 1 warning is gone. Paper wear remains a later step.

## 2026-11-21: Receipt round two approved; step 1 (format and maths) built

Approved: discounts under an item (reducing its line, tax on the net), printed text overrides with a warning in the tool when they differ from the worked-out
figure, a real scannable QR code from a message, and form sections that organise the form only. The barcode stays decorative. Step 1 adds discounts, item
and receipt overrides, and computed total savings; all additive, `formatVersion` 1. `lineMinor` now means the amount after discounts (`grossMinor` is before).
The tool preserves what it cannot yet edit when saving, so nothing is lost before step 3. Sections, QR and the viewer are step 2. Style picker and receipt looks are the next round.

## 2026-11-21: Receipt round two, step 2 (viewer and template) built

Viewer: discount lines under items, total savings, printed overrides (item, subtotal, tax, total, change, savings), a real scannable QR code and bars that follow the
barcode number. Templates may declare `sections` (with an optional `open`) and blocks join one with `section`; the form shows each as a collapsible group,
replacing the earlier `formSection`. The QR uses `qrcode-generator` 2.0.4 (MIT, pinned, about 10 kB gzipped), and its output was decoded from a screenshot to check it scans.
Messages are limited to 300 characters. The tool for editing the new fields is step 3.

## 2026-11-21: Receipt round two, step 3 (the tool) built

The tool edits discounts (label and amount, with a limit that keeps them within the line), printed text on items, and printed overrides for the subtotal, each category's
tax, total, savings and change, each with a note saying whether it differs from the worked-out figure. The QR message and caption are ordinary boxes, and a template slot
may now set `maxLength` (300 for the QR message), enforced in the tool and in the file layer. The form is grouped by the template's sections. Style picker and receipt looks
are the next round.

## Still open (from the design document)

Hosting beyond GitHub Pages, reader-notes storage, voiceover presentation, release rhythm,
document types after the witness statement, house style. Next: authoring tool step 3 (hotspots), then 4 (registry and problems) and 5 (hardening).
