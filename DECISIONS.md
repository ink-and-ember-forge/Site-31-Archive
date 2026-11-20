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

## Still open (from the design document)

Hosting beyond GitHub Pages, reader-notes storage, voiceover presentation, release rhythm,
document types after the witness statement, house style. Next: the registry overlay (build step 4).
