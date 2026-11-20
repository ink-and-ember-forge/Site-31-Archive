# Authoring tool v0

**Status: approved by the author on 2026-11-20. Build steps 1 and 2 of 5 are done (see the end).** It follows the choices made on 2026-11-20:
the tool comes first, editing is **forms beside the real viewer**, and a finished episode reaches the
repo by **saving to a folder that the author uploads on GitHub**.

## What it is

A desktop app (Electron, already the agreed stack) that lets the author build one episode without ever
editing a file by hand. It shows two things side by side:

```
+------------------------------+---------------------------------------+
|  Forms                       |  The real viewer, live                |
|  - Episode                   |  (folder wall -> table -> documents)  |
|  - Documents                 |                                       |
|  - Text + hotspots           |  Drag a document here to place it.    |
|  - Registry                  |  Click a document to edit it.         |
|  - Problems (plain English)  |                                       |
+------------------------------+---------------------------------------+
```

It is the smallest thing that can produce one real episode, and no more. The design document's warning
applies: a visual editor can quietly consume the time meant for writing.

## What v0 does

1. **Open or create an episode folder.** New episode: a title, then it makes the folder with a valid blank
   starting point. The episode id is made from the title and is fixed afterwards, because other episodes
   refer to it.
2. **Episode details.** Title, submission date, folder label, order.
3. **Documents.** Add one (choose typed, handwritten, receipt or photograph), remove it, mark which is
   central, mark one hidden. Each document's form is built from its template, so a short value is a box, text
   is a text area, an image is a "choose file" button (the image is copied into the episode). Any new
   template added to the theme gets a form automatically.
4. **Placing documents.** Drag them on the table in the preview. The new position is saved. Numbers are
   there too for fine adjustment.
5. **Hotspots.** Select words in the text and press **Make clickable**. The tool writes the marked span and
   the hotspot for you. Then choose what it opens: a marginal note (formal or handwritten, with its text),
   a hidden document, or a registry entry. For pictures and receipts, a box hotspot is added and positioned
   with numbers.
6. **Registry entries.** Add, edit, remove: kind, title, fields, body, and cross-references. References pick
   from this episode's entries; another episode's entry is typed as `episode-id/entry-id`.
7. **Problems panel.** The same plain-English messages and hints as `npm run validate`, live, with a click to
   jump to the thing that needs fixing.
8. **Autosave.** Every change is saved to the folder straight away, in the same plain files the guide
   describes, so a hand edit or a later tool still works.
9. **Publishing help.** A button reveals the episode folder, and a short note says what to do: drag the folder
   into `episodes/` on GitHub and merge. (See "How it gets live".)

## What v0 does not do (on purpose)

Each of these can come later, driven by what hurts while writing:

- Attach or play a voiceover, and the continuity ledger.
- Draw hotspot boxes by dragging (numbers only for now).
- Edit the shared theme, fonts, or add new templates (that stays in `theme/`).
- A library of many episodes, undo history beyond normal text undo, drag-reordering.
- A Publish button, GitHub sign-in, or any git inside the app.
- Code signing and auto-update.

## How the preview is "exactly what the reader sees"

The preview is **the actual viewer**, not a lookalike. The app bundles the viewer and loads it in a sandboxed
frame. On every change the tool packages the episode with the same archive build the website uses, so the
validation, packaging and rendering are identical. The viewer gets two small author-only hooks: it reports when
a document is dragged or clicked so the forms can follow.

**One thing to accept:** the preview uses the viewer and the theme **as they were when the app was released**.
If the website's viewer gets a newer feature, the app shows it after the next release. Releases are automatic
(merge the release PR, installers are built), so this gap is small and short.

## How it gets live

The episode lives in a folder on your computer. To publish: drag that folder into `episodes/` in the repo on
github.com (or with GitHub Desktop), open a pull request, and merge. The website rebuilds, checks the episode
and adds it to the wall. No code changes. CI checks the episode too, so a mistake shows up on the pull request.

## How it is built

- **Electron app** in `apps/author`. The window is a Svelte app (the same tools as the viewer). All file access
  is in the app's main process, behind a narrow, reviewed set of actions; the window itself cannot touch files
  or the network.
- **One shared brain.** It uses `packages/casefile` for the types, validation, hints and packaging, so the tool,
  the viewer and the website can never disagree about what a valid episode is.
- **Plain files in and out.** Saving writes the documented format with a stable layout, so edits show up as
  small readable changes on GitHub.
- **Tests.** The pieces that can go wrong silently are unit-tested: saving then reopening gives the same episode,
  Make clickable produces a matching span and hotspot, moving a document changes only its position, and an
  invalid or half-finished episode opens with a clear message instead of crashing.

## Build order (each step shown to the author before the next)

1. **Shell and live preview.** Open or create an episode folder, the episode form, and the real viewer
   beside it, updating as you type.
2. **Documents.** Add, remove, template forms, image import, drag to place.
3. **Hotspots.** Make clickable, notes, hidden documents, registry targets.
4. **Registry and problems.** The registry editor, references, and the live problems panel.
5. **Hardening.** Error handling, packaging, publishing note, a full first-episode walk-through.

Each step ships as a release, so the author can install it and try it.

## Open questions

1. **Bundled viewer and theme** (above): acceptable that the preview matches the app's release, not the live site?
2. **Where is the starter content?** A new episode begins from a blank, valid folder with one central typed
   document, clearly marked placeholder. Anything else you want in the blank episode?
3. **Which computer?** The Mac installer is Apple Silicon only. If you use an Intel Mac I'll add a build for it.

## Progress

| Step | Status |
| --- | --- |
| 1. Shell and live preview | **Built.** Create or open an episode folder, edit the episode details with autosave, and see the real viewer update beside the forms. Problems are listed in plain English. |
| 2. Documents | **Built.** Add a document by type and name, fill it in through a form generated from its template (values, text, images), drag it into place on the preview or type exact positions, choose the main document, hide or remove one. |
| 3. Hotspots | Next |
| 4. Registry and problems | |
| 5. Hardening | |

Decisions made while building step 1:

- The preview skips the viewer's opening animation (`?instant`), otherwise it would replay on every edit.
- The folder you save into is named after the episode id, and the id is made from the title once and then never changes.
- An episode that cannot open at all is refused with the reasons; one that opens with warnings is opened and the warnings are listed.
- The viewer and theme ship beside the app as real files (not inside its archive) so the app can serve them.
- Document text is edited in a plain text box beside the preview (the author's choice), not typed onto the page.
- Dragging a document on the preview saves its position without rebuilding the preview, since the viewer already shows the move.
- Clicking a document on the preview selects it in the forms. The viewer reports both through two small author-only messages (`select`, `layout`) and does nothing of the kind on the website.
- Editing a document only ever changes the part being edited. Hotspots and any other fields in the same file are kept exactly as they were.
- Removing a document deletes its own text files after a confirmation, and keeps its images, since other documents may use them.
- A hidden document is not shown in the preview (a reader would not see it until a hotspot opens it), so its position is set with the number boxes.
- A document's look (its style) is not chosen in the tool yet; each template uses its default style.
