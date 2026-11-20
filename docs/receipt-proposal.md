# Richer receipts

**Status: proposal, waiting for the author's approval.** Nothing here is built. It answers the author's request (2026-11-20)
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
