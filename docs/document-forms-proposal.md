# Document forms: proposal (DRAFT, NOT APPROVED)

Nothing is built against this until the author approves it. It answers the author's feedback after trying
the authoring tool on 2026-11-20:

1. Each document type should have its own bespoke form in the tool. A receipt has two columns (item, price),
   one currency symbol for the whole list, an automatic total, and optional tax on chosen lines.
2. The main document needs far more styling: header information and real form structure, like the three
   example forms (a witness statement form, a police complaint form, a discharge summary).

## Decisions already made (author, 2026-11-20)

- **First types:** the witness statement form and the receipt. The complaint form and the discharge summary
  come later, as templates built from the same parts.
- **Filled-in voice:** set per template (a witness form is typed, a note is handwritten). Not per field.
- **Receipt tax:** a setting on each receipt, either added on top of the marked lines or already included in
  the prices.
- **New layouts:** the author asks and I add them as templates. There is no form designer in the tool, which would
  be the general-purpose design tool CLAUDE.md warns against.

## The idea: a kit of parts

The example forms are not three designs. They are the same few parts arranged differently:

| Part | What it is | Needed first? |
| --- | --- | --- |
| Letterhead | A crest (an image), an organisation block, a form number | Yes |
| Section bar | A bar across the form with a heading, black or grey | Yes |
| Field grid | Rows of labelled boxes of different widths, some shaded "office use only" | Yes |
| Ruled lines | The statement text set on the lines of the form | Yes |
| Stamp | A stamp at an angle (RECEIVED and a date) | Yes |
| Items list | Rows of name and price, with a subtotal, tax and total | Yes (receipt) |
| Check group | Tick-boxes in columns | Later (discharge summary) |
| Fill line | "Title: ______" lines | Later (discharge summary) |

A form is a **template** (a file in `theme/templates/`) that arranges these parts. That is the extensibility
already agreed in the package format: new look or layout = new data file, a genuinely new part = a deliberate
change to the viewer.

### Two voices

A form has the **printed** voice (black, a clean sans) and the **filled-in** voice (typewriter, or handwriting).
Styles already hold fonts and colours as data, so this needs no new mechanism: a style gets two groups of
tokens, one for print and one for entries. A template picks its default style, which picks its filled-in voice.
A document can still override the style, as it can today.

## Package format changes

All additive. `formatVersion` stays 1, because no existing episode changes meaning. The one consequence to
accept: an older viewer shown an episode that uses the new content kinds would drop that document with a
warning. That is acceptable because the viewer and the archive are published together.

### 1. Labels on template slots

A template slot may have a `label`: `{ "name": "witnessName", "kind": "value", "label": "Witness Name:" }`.
The printed form shows it, and the authoring tool uses it for the form field. Labels belong to the template, so
they are the same in every episode that uses it and are changed in one place.

### 2. A new slot kind, `items`

```json
{ "kind": "items",
  "currency": "£",
  "tax": { "mode": "added", "rate": 20, "label": "TAX" },
  "items": [
    { "name": "PLACEHOLDER ITEM A", "price": 4.50, "taxable": true },
    { "name": "PLACEHOLDER ITEM B", "price": 2.00 }
  ] }
```

- `currency` is one symbol for the whole list, shown before each amount. It is optional (no symbol).
- `tax` is optional (no tax lines). `mode` is `added` (tax is added to the total) or `included` (the prices already
  contain tax, and the receipt shows how much of the total is tax). `rate` is a percentage. `label` is the word
  printed on the tax line.
- Each item has a `name`, a `price` and optionally `taxable` (default false, so marked lines are taxed and the
  rest are not). A negative price is allowed, for a discount.
- **Nothing computed is stored.** Subtotal, tax and total are worked out when the receipt is shown, so they can
  never disagree with the items.

How the money is worked out, so it is exact and predictable:

- Amounts are held in whole pence or cents, never as floating point, so 0.1 + 0.2 is exactly 0.30.
- `added`: tax = taxable subtotal × rate ÷ 100, rounded half up to the nearest penny. Total = subtotal + tax.
- `included`: tax = taxable subtotal × rate ÷ (100 + rate), rounded half up. Total = subtotal.
- Two decimal places always. A price with more than two decimals is rounded half up when read, and the tool
  will not let the author enter one.

### 3. A new slot kind, `choices`

For tick-boxes: `{ "kind": "choices", "selected": ["improved", "other"] }`, where the options themselves are
defined by the template's check group. Not needed for the first two types, so it is specified here and built
with the discharge summary.

### 4. Older receipts keep working

Today a receipt's `items` slot is a Markdown table. The viewer renders a slot according to what is actually in it,
so an episode that still has the Markdown table renders as before. The tool shows a short note on such a slot and
offers to replace it with an item list. No real episode exists yet, so only the placeholder sample is affected.

## New parts in the viewer (blocks)

| Block | Properties (in the template) | Notes |
| --- | --- | --- |
| `letterhead` | slots for the crest, organisation name, address lines, form number and revision | The crest is optional: with no image, nothing is drawn |
| `section-bar` | `text`, `tone`: `black`, `grey` or `plain` | |
| `field-grid` | `rows`: lists of cells, each `{ slot, width, shaded?, voice? }` | The label comes from the slot. `shaded` is an office-use box. `voice: "script"` sets a signature cell in handwriting |
| `ruled-lines` | `slot`, `lines` (the minimum number) | Text wraps onto the lines. A longer statement adds lines rather than being cut off |
| `stamp` | slots for the text and the date, a tilt | An existing block, improved |
| `items-list` | `slot` | Two columns, with the subtotal, tax and total beneath |
| `barcode` | a slot to seed it | Decorative only: a pattern, never a real code |

Everything is sized in container-relative units, so a document looks identical at any zoom, as now.

## Templates shipped (clearly labelled placeholders)

- **`witness-statement`**: the form in the mock. Slots (labels as on the author's example): crest, organisation
  name and address, form number, title and subtitle, witness name, home phone, cell phone, campus/department, job
  position, witness address, injured employee name, date of accident, signature, date of statement, time statement
  taken, the statement itself, who took it, an office-use box, and a stamp. The starter episode's main document
  becomes this template.
- **`receipt`**, upgraded: store, address, date, time, reference, the item list, payment line, footer message.
- The existing `typed` and `handwritten` templates stay for plain pages.

## The authoring tool

The tool builds each document's form from its template:

- A **field grid** appears as the same rows of labelled boxes, so the form on the left matches the paper on
  the right. A shaded box is labelled as office use.
- **Ruled lines** become a text area.
- An **items list** becomes a small table: a row per item (name, price, a "taxable" tick), buttons to add and remove
  rows, one currency box, and a tax setting (none, added on top, or included) with a rate. The subtotal, tax and
  total are shown live under the table, using the same code as the viewer.
- The crest is an image chooser, as for photographs.

## Build order (each step shown to the author before the next)

1. **Format, money and loader.** Labels, the `items` kind, the money maths (heavily tested), the schema and
   the loader, with tests for malformed and partial data.
2. **Viewer.** The new parts, the two templates and their styles. Screenshots for the author to judge the look
   before anything else is built on it.
3. **Authoring tool.** The bespoke forms and the items editor, with end-to-end tests on the real app.

Each step ships as a release so the author can try it.

## Open points

1. **Wording of the form labels.** The field labels in `witness-statement` come from the author's example form. They
   live in the template file, so they can be changed or translated without touching code.
2. **Statement length.** A statement longer than the lines on the form makes the form longer. I think that is right
   (the alternative is cutting text off), but it means a very long statement makes a very tall document. Say if you
   would rather it stop and show "continued on reverse".
3. **Real fonts.** Typewriter and handwriting still use fonts already on the reader's computer. Loading font files
   from the theme is a separate, later step.
