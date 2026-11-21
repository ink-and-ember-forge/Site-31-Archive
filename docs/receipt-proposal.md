# Richer receipts

**Status: approved by the author on 2026-11-20. All three steps are built.** It answers the author's request (2026-11-20)
for more information on the receipt, drawing on four real receipts (US supermarket, UK supermarket, UK discounter, a crumpled
US discounter receipt).

## Decisions already made (author, 2026-11-20)

- **Tax:** named categories defined on the receipt. Each item picks one. Totals and any tax table are computed.
- **Structured fields:** quantity at unit price with a product code; tender and change; the payment block as labelled text.
- **Free text:** everything else (header details, savings, loyalty and survey text).
- **Paper wear** (crumple, stains, fading): a later, separate step, as a style.

## What the four receipts have in common

| Part | Seen on | Treatment |
| --- | --- | --- |
| Logo or store name, address, phone | all | Existing `store` and `address`, plus an optional `logo` image |
| Store, till, operator, transaction numbers | all | One free-text `details` block (a line each) |
| Item: product code, name, price, tax letter | US, UK discounter | Structured (new item fields) |
| Quantity at unit price, line total | US, crumpled | Structured (new item fields) |
| Several tax rates and a tax table | UK discounter, crumpled | Tax categories, table computed |
| Subtotal, total | all | Computed (as now) |
| Tender (cash, card), amount paid, change due | all | Structured |
| Card, approval code, AID, terminal | US, UK discounter | Free-text `payment` block |
| Items sold, savings, loyalty, survey, slogan | most | Free-text `notes` blocks |
| Barcode and its number | all | Existing decorative barcode, plus the number |

## Package format changes (additive; `formatVersion` stays 1)

### 1. Tax categories replace the single rate

```json
{ "kind": "items",
  "currency": "£",
  "taxes": [
    { "code": "A", "label": "VAT", "rate": 20 },
    { "code": "B", "label": "VAT", "rate": 0 }
  ],
  "taxMode": "included",
  "items": [
    { "name": "PLACEHOLDER ITEM A", "price": 4.50, "tax": "A" },
    { "name": "PLACEHOLDER ITEM B", "price": 2.00, "tax": "B" }
  ] }
```

- Each category has a short `code` (the letter printed beside an item), a `label` and a `rate`.
- `taxMode` is `added` or `included`, for the whole receipt (as today).
- An item with no `tax` is untaxed. The printed tax table has one row per category that is used: its rate, the sales
  amount and the tax. Tax is worked out per category, rounded half away from zero to whole pence, and the total is the sum.
- **Older receipts keep working.** The existing `tax: { mode, rate, label }` plus `taxable: true` still loads. It is read as
  one category (code `T`), so nothing in an existing episode changes.

### 2. Item fields

Each item may also have `code` (product code), `quantity` (a whole number or a decimal such as a weight) and `unitPrice`.
When `quantity` and `unitPrice` are given, the line total is quantity × unit price, rounded to whole pence, and the receipt
prints a second line "2 @ 1.50" under the name. The authoring tool shows a price instead when only a price is given, as now.
Prices stay whole pence internally.

### 3. Tender and change

```json
"tender": { "method": "CASH", "amount": 25.00 }
```

`method` is free text printed as is (CASH, DEBIT, CARD). If `amount` is above the total, the receipt shows CHANGE DUE,
computed. If it is below the total, it is shown as given and the remainder is not invented. Several tenders (split payment) are
out of scope for now.

### 4. New free-text slots on the template

`logo` (an image), `details` (store, till and operator numbers), `payment` (the card and approval block, now Markdown with
line breaks kept), `notes` (savings, loyalty, survey, slogan), and `barcodeNumber` (printed under the barcode).
Labels live in the template, so they can be changed in one place.

## Viewer

Three small additions to the existing parts, no new look: the items list gains the second quantity line, the product code
column and the tax letter column; a tax table block; a tender-and-change block. Order on the paper follows the real receipts:
logo, store, address, details, items, subtotal, tax table, total, tender, change, payment, notes, barcode.

## Authoring tool

- The item table gains optional columns: code, quantity, unit price, and a tax category picker per row.
- A small tax categories table above it (code, label, rate), with a mode switch (added or included).
- A tender box (method and amount). Subtotal, tax, total and change are shown live, from the same code as the viewer.
- The new free-text slots appear in collapsible sections ("Header details", "Payment", "Notes"), so the core stays short.

## Open points

1. **Stored amount vs. computed:** nothing computed is stored (unchanged), so a receipt cannot print a total that disagrees with
   its items. If a story needs a receipt that deliberately does not add up, that would be a separate, explicit override. Say
   if you want it.
2. **Multiple tenders** and **per-item discounts shown beneath the item** are not included. A negative-priced item still works.
3. **Wear** (crumple, stains) is the next step after this.

## Build order

1. Format, money and loader (categories, item fields, tender), with tests, including odd rounding cases.
2. Viewer parts and the upgraded receipt template and sample, with screenshots for the author to judge.
3. Authoring tool forms and end-to-end tests.

## Progress

| Step | Status |
| --- | --- |
| 1. Format, money and loader | **Built.** Tax categories, item fields, tender and change, exact maths, tolerant loader, 30 new tests. Nothing changes on screen yet. |
| 2. Viewer | **Built.** Quantity lines, product codes and tax letters on items; per-category tax lines; new `tax-table` and `tender` parts; logo, details, notes and barcode number slots; the upgraded `receipt` template and sample. |
| 3. Authoring tool | **Built.** Tax category table, per-item tax picker, optional code and quantity columns, tender, live totals and change, and collapsible form sections. |

Details settled while building step 1:

- Quantity x unit price wins over a price when both are given; a price alone still works. A quantity needs a unit price and the other way round, otherwise the pair is ignored with a reason.
- Quantities are held in thousandths (so 0.452 kg is exact) and must be above 0 and at most 10,000. A line larger than the largest allowed price is dropped.
- Each category is rounded on its own, so the printed tax table always adds up to the printed tax.
- A category is a row on the receipt only when a line uses it. An item naming a category that does not exist is kept, untaxed, with a warning.
- When a receipt lists `taxes`, the older single `tax` setting and `"taxable"` marks are ignored with a warning. Older receipts load and total exactly as before.
- Change is never negative; a payment below the total shows no change and invents nothing.

Details settled while building step 2:

- Two new parts: `tax-table` (rate, sales and tax per category used) and `tender` (what was paid, and change due). Both read the same item list as the items part, so nothing is typed twice and nothing can disagree.
- Tax added on top is part of the sum, so it is always listed before the total. Tax already included is only information, so the receipt template switches those lines off (`includedTaxLines: false`) and prints the tax table instead. Another template can choose differently.
- The `paragraph` part now also shows a plain one-line slot, so an older receipt whose payment line is a single value still renders. The `image` part takes an optional `width`, which is how the receipt's logo is kept small and centred.
- The barcode can print a number beneath it (`barcodeNumber`), and stays a decorative pattern, never a real code.
- Zero-rate categories do not add a line to the sums; the tax table still lists them.
- An older single-rate receipt now uses the new template, so its tax shows in the tax table rather than as a line above the total.
- The sample receipt is rebuilt from placeholder content (two categories with tax included, a quantity line, codes, cash tender).

Details settled while building step 3:

- The item table has a tax picker per row (the receipt's categories), one setting for how tax works, and a tick to show product codes and quantities (on by default when any item uses them). A row with a quantity and a unit price shows the worked-out price read-only.
- An older single-rate receipt opens with one category, "T", and its taxable items pointing at it. Saving it from the tool writes the new form with the same figures, so nothing visible changes.
- Renaming a category's code moves the items that used it. Removing a category leaves those items untaxed.
- Nothing is saved until every box is valid ("Not saved yet", with the reason), as before: a half-typed category, quantity, price or tender never drops anything.
- A template block may name a collapsible section of the form with `formSection`; blocks that share a title are gathered into one. The receipt uses it for header details, payment details, and notes and closing message. A section opens when it already has something written.
- An older receipt whose payment line is a one-line value is shown in the text box, and becomes text when edited.

---

# Round two: discounts, overrides, sections, barcode and QR

**Status: approved by the author on 2026-11-21. Steps 1 and 2 of 3 (format and money; viewer and template) are built; the tool is next.** One bug fix (a
form section closing itself while typed in) shipped separately.

## Decisions already made (author, 2026-11-21)

- **Discounts:** under an item, reducing it. The item's tax category applies to the amount after discount. A basket-wide coupon stays a negative item.
- **Overrides:** printed text that replaces a worked-out figure, with a warning in the tool when it differs from the real figure.
- **QR code:** real and scannable by a phone camera, holding a message the author writes.
- **Sections:** organise the form only. The paper looks the same.
- **Left to the next round:** a style picker and a few receipt looks (paper width, font, header style, thermal fade), so receipts do not all look alike. Logos already work as an image slot.

## Package format changes (additive; `formatVersion` stays 1)

### 1. Discounts on an item

```json
{ "name": "PLACEHOLDER ITEM", "price": 4.50, "tax": "A",
  "discounts": [{ "label": "MULTIBUY", "amount": 1.00 }] }
```

- `amount` is a positive number, printed as a negative line under the item. `label` is optional text.
- The item's line becomes its price (or quantity x unit price) minus its discounts, and tax is worked out on that net line.
- A discount that is not a positive price, or is larger than the line it sits on, is ignored with a reason.
- A new computed figure, **total savings**, is the sum of all discounts. A template can print it ("TOTAL SAVINGS 1.00"). Negative items do not count as savings.

### 2. Overrides of printed figures

```json
{ "kind": "items", "items": [ { "name": "TEA", "price": 4.5, "printed": "4.5O" } ],
  "overrides": { "subtotal": "18.50", "total": "VOID", "change": "--.--", "tax": { "A": "3.3O" } } }
```

- `printed` on an item replaces the amount shown for that line. `overrides` replaces the subtotal, total, change, total savings, or the tax of one category (by its code).
- An override is text, printed exactly as written (the currency symbol is not added, so a smudge or a missing symbol is possible).
- Everything else still works from the real figures. Change is worked out from the real total, not the printed one.
- The tool shows the real figure beside each override and warns "printed differs from worked out", so a discrepancy is always visible as deliberate.

### 3. Sections on a template

```json
"sections": [{ "id": "heading", "name": "Heading" }, { "id": "topline", "name": "Top line" }, { "id": "body", "name": "Main body" }, { "id": "footer", "name": "Footer" }]
```

A block in the template's layout may carry `"section": "footer"`. The tool groups the form into one collapsible section per name, in order, and a part
belongs to the section of the first block that uses it. A section opens by default when something in it is written. This replaces the one-off
`formSection` setting from the first round. Templates without `sections` behave as now. The witness form keeps its printed section bars.

### 4. Barcode and QR

- The barcode keeps its printed number (`barcodeNumber`), and its bars now follow that number, so changing the number changes the pattern.
  It stays a decorative pattern, never a real code.
- A new `qr-code` part draws a real QR code from a slot `qr` (a message of up to 300 characters). It takes an optional printed caption (`qrCaption`,
  for example "SCAN FOR SURVEY"). Making the QR reveal something inside the archive needs no new feature: a box hotspot over it can open a note or a
  registry entry, as for any document.
- The encoder is a small open-source library bundled into the viewer; I will check its licence and size when I build, and report them.

## Viewer

Discount lines under items (indented, with a minus), a total-savings line, override text wherever one is set, the QR code, and nothing different for
receipts that use none of this.

## Authoring tool

- Each item gets an "Add discount" row (label and amount), and a "Printed as" box next to the item price.
- Each computed figure in the totals gets a "Printed as" box and the "differs from worked out" warning.
- The form is grouped by the template's sections, in order, each collapsible and kept as the author left it.
- A "QR message" box and caption under the barcode number, with a note that a phone can scan it.

## Build order (each step shown before the next)

1. Format, money and loader: discounts, overrides, savings, with tests (including odd rounding and mismatches).
2. Viewer: discount lines, savings, overrides, QR, sections in the template data. Screenshots.
3. Authoring tool: the new boxes, warnings, sections, QR message.

## Open points

1. **Real barcodes.** Making the barcode real (scannable, for example Code 128 from your digits) is possible, but we decided earlier it should never be
   a real code, so one cannot accidentally match a real product. I propose to keep it decorative. Say if you want otherwise.
2. **A QR code is readable by anyone with a phone**, so what you put in it is public in the same way as the rest of the episode.
3. **Override of a tender or an item's quantity line** is not included; the printed line and the totals cover the cases that matter.

## Progress (round two)

| Step | Status |
| --- | --- |
| 1. Format, money and loader | **Built.** Discounts, printed text on items and overrides for the subtotal, total, change, savings and each category's tax, computed total savings, 19 more tests. Sections and the QR part come with step 2, since they are template and viewer work. |
| 2. Viewer | **Built.** Discount lines, total savings, printed overrides, a real QR code, bars that follow the barcode number, and template sections (`sections` and a block's `section`). |
| 3. Authoring tool | Next |

Details settled while building step 1:

- `lineMinor` is now the amount after discounts; the old meaning (before discounts) is `grossMinor`. The tool's price box shows the gross amount.
- Discounts count only if they fit: each must be a price above 0, together they may not take more than the line, a line that is not above zero takes none, and at most 5 per item. One that does not fit is ignored, with a reason, and the item stays.
- Subtotal, tax and total all use the discounted lines. Total savings is the sum of the discounts that count; negative items do not count.
- Printed text is limited to 30 characters. A printed tax for a category that does not exist is ignored with a reason.
- `printedDiffers(text, figure)` decides whether the tool should warn: it compares only the digits and sign, so "£18.50" and "18,50" match 18.50, while "VOID", "--.--" and "18.5O" (a letter O) do not.
- Until step 3, the tool keeps a receipt's discounts, printed text and overrides exactly as they are when it saves, so nothing is lost, but it cannot edit them yet. Edit those by hand until then.

Details settled while building step 2:

- **Discounts and overrides in the viewer:** an item prints its price before discounts, then each discount as an indented negative line. Printed text replaces the amount it is set on. The tax table and the change line take their overrides too. A template switches the total-savings line on with `savings: true` on the items part.
- **QR:** a real QR code (medium error correction, smallest size that fits, UTF-8), drawn as one crisp vector. I decoded the one on the sample receipt from a screenshot to confirm it scans back to the message. Messages are limited to 300 characters. The encoder is `qrcode-generator` 2.0.4 (MIT licence), pinned; it adds about 10 kB (gzipped) to the viewer.
- **Barcode:** the bars follow the printed number when there is one, otherwise the old seed. Still decorative.
- **Sections:** `sections` on a template (`id`, `name`, and an optional `open`), and `section` on a block, inherited by its children. The form shows one collapsible group per section, in the template's order, with anything outside a section first. A section opens if its template entry says `open` or something is already written in it, and then stays as the author leaves it. The theme build fails on a block in a section the template does not define. The receipt's sections are Heading, Top line, Main body and Footer; the witness form keeps its printed section bars. The earlier `formSection` setting is gone.
