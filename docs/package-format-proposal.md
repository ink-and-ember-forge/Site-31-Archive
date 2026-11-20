# Case file package format: v1

**Status: approved by the author on 2026-11-20, with the extensibility amendment in section 4.**

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
    <doc-id>.json        one file per document: template, style, role, hotspots
    <doc-id>.md          text content for text slots
  registry/
    <entry-id>.json      registry entries this episode contributes
  media/
    images/              photographs, scans, stills
    audio/               archivist voiceover
  ledger.json            ledger references (optional)
  templates/             optional one-off templates, override the shared theme
  styles/                optional one-off styles, override the shared theme
```

Shared look-and-feel lives once at the repo level (not in packages):

```
theme/
  templates/<template-id>.json   layouts composed from blocks
  styles/<style-id>.json         fonts, paper, ink, wear, colours
  assets/                        textures, font files
```

Resolution order for a template or style key: the episode's own folder, then `theme/`, then the viewer's built-in fallback.

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
| `documents` | yes | List of `{ id, layout, hidden? }`. `layout` is `{ x, y, width, rotation? }` as fractions of the table (rotation in degrees). A `hidden` document is not placed at the start; a hotspot with a `document` target reveals it |
| `voiceover` | no | `{ file, transcript? }` pointing into `media/audio/` |

## 4. Documents, templates, styles and blocks (extensibility)

"Type" is split into three independent parts so new document kinds are data, not code:

| Part | Answers | Lives in | Needs code? |
| --- | --- | --- | --- |
| **Style** | How does it look? Fonts, paper, ink, wear | `theme/styles/` (or episode `styles/`) | No |
| **Template** | How is it laid out? Arrangement of blocks into regions and named slots | `theme/templates/` (or episode `templates/`) | No |
| **Block** | A building block: title, paragraph, field row, table, stamp, image, caption, and so on | Built into the viewer | Yes, rare |

`documents/<doc-id>.json`:

| Field | Required | Notes |
| --- | --- | --- |
| `template` | yes | Template key, e.g. `typed`, `handwritten`, `receipt`, `photograph`. The list is open |
| `style` | no | Style key. Defaults to the template's own default style |
| `role` | yes | `central` or `supporting` (must agree with the manifest) |
| `slots` | by template | Content for the template's named slots, each `{ kind: "markdown", file or text }`, `{ kind: "image", file, alt? }` or `{ kind: "value", value }` |
| `hotspots` | no | See section 5 |

Rules:

- A template is declarative data: a tree of blocks with slot bindings and style tokens. It contains no executable code, and neither does any package.
- A genuinely new block (for example a cipher grid) is a deliberate, one-off change to the viewer, added once and reusable by every template. Expect a handful over the project's life.
- Unknown templates, styles or blocks degrade gracefully: unknown template renders the slots as plain text on plain paper, unknown style uses the default, unknown block is skipped with a console warning. The episode still opens.
- The viewer ships starter templates (`typed`, `handwritten`, `receipt`, `photograph`) and starter styles as clearly labelled placeholders. The author's real ones are new files in `theme/`.
- `formatVersion` covers templates and styles too, so old episodes keep their look when blocks or tokens evolve.

## 5. Hotspots and marginalia

Each hotspot has an `id`, an **anchor** (where it sits) and a **target** (what it opens):

- **Anchor:** either `{ type: "text", slot }` (a marked span `[the words]{#hotspot-id}` in that slot's Markdown, where the id matches the hotspot's `id`, so it survives reflow) or `{ type: "rect", x, y, width, height }` in fractions of the document (for images and receipts).
- **Target** is one of:
  - `lightbox`: marginal note content shown in an overlay (`text` inline, or `file` inside the package, plus optional `title`)
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

- JSON Schemas in `packages/casefile/schema/` are the machine-readable contract; the viewer, the authoring tool and the build all use the same validator (`loadCasefile`).
- **Additive changes are non-breaking:** unknown extra fields are ignored, so new optional fields can be added without a new `formatVersion`. Removing or changing the meaning of a field is a breaking change and bumps the version.
- Missing optional files or fields never block opening. Malformed hotspots are dropped with a console warning; a malformed manifest fails that one episode only, and the wall still loads.
- Tests: a sample package labelled placeholder, plus malformed and partial fixtures.

## 8a. Implementation notes (added when the schema was written)

- **Hidden documents never opened by a hotspot** produce a warning, since the reader could never see them.
- **Paths inside a package** must be relative and may not contain `..`; unsafe paths are treated as missing.
- **Registry hotspots** are checked only against this episode's own entries; references to other episodes are never an error.
- **Build:** `npm run archive` (run automatically by the viewer's build) fails on an invalid episode, folder/id mismatch or broken theme, and prints warnings for degraded content.
- **Deterministic zips:** the same folder always produces the same `.casefile` bytes.

## 9. Decisions taken on this draft (2026-11-20)

1. **Hotspots in text** are marked spans inside the Markdown; rectangles are used for images and receipts.
2. **Handwritten documents** are Markdown text rendered with a handwriting font style (a swappable style asset). An image-based template remains available for special pages later.
3. **Index** is generated at build from each `case.json`; episodes publish by merging to `main`.

4. **Extensibility:** documents use template + style + blocks rather than a fixed type list (section 4). Templates and styles live in a shared `theme/` with optional per-episode overrides, and new blocks need a deliberate viewer change. Packages never contain executable code.

## 10. Still to confirm

- Nothing outstanding. Next: the schema, the placeholder sample package and the build step.
