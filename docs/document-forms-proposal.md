# Document forms

**Status: approved by the author on 2026-11-20. All three steps are built; see the end.** It answers the author's feedback after trying
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

## Progress

| Step | Status |
| --- | --- |
| 1. Format, money and loader | **Built.** Template slot labels, the `items` and `choices` content kinds, exact money maths, schema, tolerant loader, and 62 new tests. Nothing changes on screen yet. |
| 2. Viewer | **Built, signed off by the author.** The new parts, the `witness-statement` template, the upgraded receipt, and the two voices (typed and handwritten). |
| 3. Authoring tool | **Built.** Each document's form mirrors its paper (the same sections and rows of labelled boxes), the receipt has an item table with currency, tax and live totals, and new episodes start from the witness statement form. |

Details settled while building step 1:

- A price is read from its written form, not its binary value, so 1.005 is 1.01 and 0.1 + 0.2 is exactly 0.30. Rounding is half away from zero.
- Prices are limited to plus or minus 1,000,000 and a list to 1,000 items, so the arithmetic is always exact.
- A malformed receipt never loses the whole document. A bad item, currency or tax setting is dropped or ignored on its own, with a plain-English reason shown as a warning.
- Until step 2, the placeholder receipt and the tool behave exactly as before. The viewer and the tool already accept the new kinds without breaking.

Decisions made while building step 2:

- A single line break is now kept as a line break (a blank line is a new paragraph), so addresses and typed lines keep their lines. Authors pressing Enter get a new line.
- A page's shape is a **minimum height**, not a fixed one: a longer statement or receipt makes the page longer instead of being cut off. The focused view is sized from the page's real shape.
- Templates may set `defaultWidth`, how wide a new document of that type starts on the table (a receipt is narrower than a form). Optional and additive.
- The theme is checked at build: a template that refers to a slot it does not define, or a block that does not exist, fails the build with a plain message.
- The stamp is drawn only when its text slot has something in it, so leaving it empty means no stamp.
- Ruled lines and thin rules snap to whole pixels where the browser supports it, so they stay crisp.
- Old receipts written as a Markdown table still render as they did.

Decisions made while building step 3:

- The tool's form for a document is worked out from the template's layout (`editorPlan`), so a new template gets a matching form with no new tool code. Every part of a template appears exactly once, and any the layout does not use are gathered under "Other parts".
- A part's printed label comes from the template (for example "Witness Name:"), with a readable fallback for a part that has none.
- The item list is saved only when every box in it is valid. A half-typed price holds the whole save ("Not saved yet", with the reason) and never drops a row; it saves as soon as it is valid. Prices are typed as plain numbers with at most two decimals and no symbol, since the symbol is set once for the list.
- The tool shows the same totals as the receipt, from the same code, so they cannot disagree.
- An older receipt whose items are a Markdown table is shown, and can be replaced by an item list after a confirmation.
- The window may import only the small browser-safe parts of the format package (`/money`, `/authoring`). The whole package builds code at load time, which the window's security policy forbids, and a test enforces this.
- Items are written in reading order (`kind`, `currency`, `tax`, `items`) so saved files are tidy.
