# Writing an episode

A plain-English guide for the author. An episode is a folder of small text files and images. You don't need
to run a build or edit any code: save a file and the preview updates.

The reference for every field is [`package-format-proposal.md`](package-format-proposal.md). This guide is the
practical version.

## 1. The two commands

```bash
npm install
```

Once, to set up. Needs Node 22.

```bash
npm run dev:viewer
```

Starts the live preview (open the address it prints, normally `http://localhost:5173`). It shows the archive
exactly as a reader sees it. **Save any file in `episodes/` or `theme/` and the browser refreshes by itself.** If
you make a mistake, a message appears over the page saying which file and what to fix.

```bash
npm run validate
```

Checks every episode and explains each problem in plain English, with a hint. Use
`npm run validate -- my-episode` to check just one.

## 2. Start an episode

1. Copy the example folder `packages/casefile/fixtures/valid/sample-placeholder` to `episodes/`, and rename the
   copy to your episode's id: lowercase words joined by hyphens, like `the-lighthouse-statement`.
2. Open `case.json` in the copy and change `"id"` to match the folder name exactly. Change the title and date.
3. Replace the placeholder text. Everything in the example is marked PLACEHOLDER, so you can see what to replace.

While `episodes/` is empty the viewer shows the placeholder example so there is always something to look at. The
moment you add a real episode, the example disappears.

**The episode id is permanent.** Other episodes refer to it, so don't rename it after you publish.

## 3. What's in the folder

```
episodes/the-lighthouse-statement/
  case.json                 the folder's title, date, and which documents are on the table
  documents/
    statement.json          one file per document: what kind it is, and its hotspots
    statement.md            the words of a text document
  registry/
    some-entry.json         the archive's answers (the registry overlay)
  media/images/             photographs and scans
```

Only `case.json` and the central document are required. An episode with no hotspots, no registry and no extras
still opens and reads fine.

## 4. case.json: the folder and the table

| Field | What it does |
| --- | --- |
| `id` | Must match the folder name |
| `title` | Shown on the folder |
| `submissionDate` | Shown on the folder, written `2026-03-14` |
| `folderLabel` | The word on the folder's tab (optional) |
| `order` | Position on the wall. Without it, folders are ordered by date |
| `centralDocument` | The id of the main document |
| `documents` | Every document on the table, each with a `layout` |

A document's `layout` places it on the table, as fractions of the table:

```json
{ "id": "statement", "layout": { "x": 0.33, "y": 0.04, "width": 0.32, "rotation": -2 } }
```

`x` and `y` are the top-left corner (0 is the left or top edge, 1 is the right or bottom). `width` is how wide it
is. `rotation` is a slight tilt in degrees (optional).

**Watch the height.** A document's height comes from its width, so a wide page is tall. As a rule of thumb, a
typed page's height is about `width × 2.4` of the table, so at `width: 0.32` it needs `y` under about 0.2 or it
runs off the bottom. Check in the preview.

A document marked `"hidden": true` isn't on the table at the start. It slides on when the reader clicks a
hotspot that points at it (see section 6).

## 5. Documents

Each file in `documents/` describes one document:

```json
{
  "template": "typed",
  "role": "central",
  "slots": {
    "title": { "kind": "value", "value": "WITNESS STATEMENT" },
    "body": { "kind": "markdown", "file": "documents/statement.md" }
  }
}
```

- **`role`** is `central` for the main document and `supporting` for everything else.
- **`template`** is the kind of document: it decides the layout. The ones that exist now are `witness-statement`,
  `receipt`, `typed`, `handwritten` and `photograph`.
- **`style`** (optional) changes the look: paper, ink, fonts. Each template has a default. A form's default makes
  what is filled in look **typed**; the `form-handwritten` style makes it look **handwritten** instead.
- **`slots`** are the named places the template fills with your content. Each template has its own:

| Template | Slots |
| --- | --- |
| `witness-statement` | A letterhead (`crest`, `agency`, `agencyLines`, `formNumber`, `formRevision`), `title`, `subtitle`, an optional stamp (`stampText`, `stampDate`), the labelled boxes (`witnessName`, `homePhone`, `cellPhone`, `campusDept`, `jobPosition`, `witnessAddress`, `injuredName`, `dateOfAccident`, `witnessSignature`, `dateOfStatement`, `timeTaken`), the statement itself (`body`, Markdown, set on ruled lines), `takenBy` and `officeUse` |
| `receipt` | `store`, `address`, `date`, `time`, `reference`, `items` (an item list, see below), `payment`, `footer` |
| `typed` | `title` (a value), `body` (Markdown) |
| `handwritten` | `body` (Markdown) |
| `photograph` | `image` (an image), `caption` (a value) |

The printed labels on a form (such as "Witness Name:") come from the template, so they are the same in every episode.
Leave a slot out and its box is simply empty on the form.

A slot is one of these kinds: `{ "kind": "value", "value": "..." }` for a short piece of text,
`{ "kind": "markdown", "text": "..." }` or `{ "kind": "markdown", "file": "documents/x.md" }` for longer text, and
`{ "kind": "image", "file": "media/images/photo.jpg", "alt": "what it shows" }` for a picture, and
`{ "kind": "items", ... }` for the lines of a receipt:

```json
"items": {
  "kind": "items",
  "currency": "£",
  "tax": { "mode": "added", "rate": 20, "label": "VAT" },
  "items": [
    { "name": "Tea", "price": 4.5, "taxable": true },
    { "name": "Biscuits", "price": 2 }
  ]
}
```

The total is worked out for you, so you never type it. `currency` is one symbol for the whole list (leave it out for
none). `tax` is optional: `"mode": "added"` adds the tax to the total, and `"included"` means the prices already
contain it and the receipt shows how much of the total is tax. Only items marked `"taxable": true` are taxed. A
negative price is a discount. A price with more than two decimals is rounded to the nearest penny, and an item with
no usable price is left out with a warning.

Text keeps your line breaks, so pressing Enter starts a new line (a blank line starts a new paragraph). It also supports simple tables:

```
| Item | Price |
| --- | --- |
| Example item | 0.00 |
```

## 6. Hotspots: making words clickable

In your text, mark the words with square brackets and an id in curly brackets:

```
He said he saw [the grey van]{#grey-van} outside.
```

Then list that id in the document's `hotspots`:

```json
"hotspots": [
  { "id": "grey-van",
    "anchor": { "type": "text", "slot": "body" },
    "target": { "type": "registry", "entry": "the-lighthouse-statement/grey-van" } }
]
```

The id in the text and the hotspot's `id` must be the same. For a picture or a receipt, where there's no text to
mark, use a box instead: `"anchor": { "type": "rect", "x": 0.1, "y": 0.1, "width": 0.4, "height": 0.1 }`
(fractions of the document).

What a hotspot opens is its `target`:

| Target | What the reader sees |
| --- | --- |
| `{ "type": "lightbox", "text": "..." }` | A small marginal note beside the document |
| `{ "type": "document", "document": "ticket" }` | A hidden document slides onto the table |
| `{ "type": "registry", "entry": "episode-id/entry-id" }` | The registry overlay: the archive answering back |

A marginal note can be `"variant": "formal"` (the default: a slim typed card with a dotted string) or
`"variant": "note"` (handwritten, written straight onto the table). It can have a `title`, and its text can come
from a file with `"file"` instead of `"text"`.

## 7. The registry

Each file in `registry/` is one entry. The file name is the entry id:

```json
{
  "id": "grey-van",
  "kind": "record",
  "title": "Grey van, registration unknown",
  "fields": [{ "label": "First reported", "value": "2026-03-14" }],
  "body": "Text of the entry.",
  "references": ["another-episode/some-entry"]
}
```

An entry's full name is `episode-id/entry-id`. `references` are links to other entries, in this episode or any
other, and the reader follows them from inside the overlay. **A reference to an episode that isn't published
yet is fine.** It shows as a redacted "no record on file", never an error. That's how threads between episodes
can be laid down before the other episode exists.

Readers reach entries only by clicking hotspots and following references. There is no search box.

## 8. Things not in the viewer yet

These can be written into an episode but don't do anything yet:

- **Voiceover.** `voiceover` in `case.json` is accepted and kept, but the viewer doesn't play it.
- **The continuity ledger.** `ledger.json` is accepted and ignored. Ledger tooling comes later.
- **Custom fonts.** Styles can name a font that's on the reader's computer. Loading a font file from the theme
  isn't built yet, so the handwritten look is a stand-in.
- **Reader notes**, and **video**.

## 9. Warnings and errors

- A **✗ error** means the episode can't open at all (the folder's id doesn't match, `case.json` is broken, the
  central document is missing). It must be fixed.
- A **⚠ warning** means the episode opens but something was left out: an image that isn't there, a hotspot
  with no matching words, a template that doesn't exist. The reader never sees an error, but the missing piece
  won't be there either.

Fix the first error first: later ones are often caused by it.

## 10. The look: `theme/`

Templates and styles live in `theme/`, shared by every episode, so the whole archive keeps one look.

- `theme/styles/` holds looks: fonts, paper colour, ink colour. Copy one, give it a new `id`, change the values.
- `theme/templates/` holds layouts: which pieces appear and where. A template arranges built-in pieces
  (`title`, `paragraph`, `field-row`, `table`, `stamp`, `image`, `caption`, `stack`, `columns`, and for forms and
  receipts `letterhead`, `section-bar`, `field-grid`, `ruled-lines`, `items-list`, `barcode`, `rule`, `split-row`).

The ones that exist now are starter placeholders. A new look or layout is just a new file there, and the preview
picks it up when you save. A genuinely new kind of piece (say, a cipher grid) is a small change to the viewer,
so ask for it. New form layouts (a complaint form, a discharge summary) are also templates: ask and they are
added from the same parts.

## 11. Publishing

Add your episode folder and merge it. The site rebuilds, validates it, packages it and updates the folder wall
automatically. There is no index to edit. If the episode has an error, the build fails and says which file.
