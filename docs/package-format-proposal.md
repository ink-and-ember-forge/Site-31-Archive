# Case file package format: proposal (v1) — DRAFT, NOT APPROVED

Nothing in `apps/` or `packages/casefile` should be built against this until the author approves it.
All names below are structure only. No story content is implied.

## 1. Principles

- **Folder is the source of truth.** Authored by hand or by the authoring tool in `episodes/<episode-id>/`.
- **The build produces the portable file.** CI zips each folder to `<episode-id>.casefile` (a zip with the same internal layout) and generates `index.json` listing every episode's metadata. Adding an episode means adding one folder.
- **Plain data plus media.** JSON for structure, Markdown for text, normal image and audio files. Readable without the authoring tool.
- **Explicit version.** `formatVersion` in the manifest. The viewer keeps one small upgrade step per old version, so old episodes keep loading.
- **Everything optional is optional.** Only the manifest and one central document are required.

## 2. Folder structure

```
episodes/<episode-id>/
  case.json              manifest: metadata, document list, layout
  documents/
    <doc-id>.json        one file per document: type, style, role, hotspots
    <doc-id>.md          text content, for text-based document types
  registry/
    <entry-id>.json      registry entries this episode contributes
  media/
    images/              photographs, scans, stills
    audio/               archivist voiceover
  ledger.json            ledger references (optional)
```

Build output (not committed):

```
dist/archive/
  index.json             metadata for every episode, drives the folder wall
  <episode-id>.casefile  zip of the folder above
```

`<episode-id>` is a stable slug (lowercase, hyphens). It never changes once published, because other episodes cross-reference it.

## 3. `case.json` (manifest)

| Field | Required | Notes |
| --- | --- | --- |
| `formatVersion` | yes | Integer, starts at 1 |
| `id` | yes | Must match the folder name |
| `title` | yes | Shown on the folder |
| `submissionDate` | yes | ISO date, shown on the folder |
| `folderLabel` | no | Text or style key for the folder face |
| `order` | no | Position in the archive; falls back to date |
| `centralDocument` | yes | `doc-id` of the main document |
| `documents` | yes | List of `{ id, layout }` where `layout` is `{ x, y, width, rotation? }` as fractions of the table |
| `voiceover` | no | `{ file, transcript? }` pointing into `media/audio/` |

## 4. Documents

`documents/<doc-id>.json`:

| Field | Required | Notes |
| --- | --- | --- |
| `type` | yes | e.g. `typed`, `handwritten`, `receipt`, `photograph`. The list is open: unknown types fall back to a plain rendering |
| `style` | no | Style key into the shared look-and-feel assets (fonts, textures, handwriting). Styles live outside the package so the author can change the look without touching episodes |
| `role` | yes | `central` or `supporting` (must agree with the manifest) |
| `content` | by type | `file` for Markdown text, or `image` for photographs |
| `appearsWhen` | no | Supplementary documents revealed by a hotspot rather than placed at the start |
| `hotspots` | no | See below |

## 5. Hotspots and marginalia

Each hotspot has an `id`, an **anchor** (where it sits) and a **target** (what it opens):

- **Anchor:** either a text anchor (a marked span in the Markdown, so it survives reflow) or a rectangle in fractions of the document (for images and receipts).
- **Target** is one of:
  - `lightbox`: marginal note content shown in an overlay
  - `document`: reveals a supplementary document by id
  - `registry`: opens a registry entry by global id

## 6. Registry entries (highest priority layer)

`registry/<entry-id>.json`: `id`, `kind` (open list, e.g. person, place, object, record), `title`, `fields` (ordered label/value pairs), `body` (Markdown), and `references`.

- Global id is `<episode-id>/<entry-id>`.
- `references` lists global ids of entries in this or other episodes.
- **Dangling references are tolerated:** a reference to an unpublished episode renders as an unresolved or redacted link, never an error.
- The registry's voice is data, so a single stylistic break is an authoring choice, not a code change.

## 7. Ledger references

`ledger.json` lists the recurring elements this episode touches: `{ element, layer }` where `layer` is `main`, `marginalia`, `supplementary` or `registry`. The ledger itself (canonical names, symbols, ciphers, details, consistency warnings) is a repo-level file maintained by the authoring tool; packages only reference it. The viewer ignores this file.

## 8. Tolerance and validation

- A JSON Schema in `packages/casefile` is the machine-readable contract; both tools use the same validator.
- Missing optional files or fields never block opening. Malformed hotspots are dropped with a console warning; a malformed manifest fails that one episode only, and the wall still loads.
- Tests: a sample package labelled placeholder, plus malformed and partial fixtures.

## 9. Decisions taken on this draft (2026-11-20)

1. **Hotspots in text** are marked spans inside the Markdown; rectangles are used for images and receipts.
2. **Handwritten documents** are Markdown text rendered with a handwriting font style (a swappable style asset). An image document type remains available for special pages later.

## 10. Still to confirm

- `index.json` is generated from each `case.json` at build, so nothing is duplicated by hand (assumed yes).
- Final approval of this proposal as a whole.
