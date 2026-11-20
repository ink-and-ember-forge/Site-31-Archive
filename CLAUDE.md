# CLAUDE.md: Archive Project

Instructions for Claude Code. Read this fully before writing any code, and re-read it at the start of each session. The companion file is the **Archive Project: Design Document**, which holds the vision and reasoning. If the two ever disagree, stop and ask.

## What we are building

An episodic, digital anthology told through an archive. Each episode is a **case file**: a folder the reader opens onto a virtual work table covered in documents they can move, zoom into and interrogate. Each case file is complete on its own. A larger story emerges, optionally, from repeated names, symbols and registry entries across files.

Two products, joined by one contract:

1. **Authoring tool.** The author uses it to create, preview and package case files.
2. **Viewer.** The reader uses it to browse the archive and explore case files.
3. **Case file package.** The data format the authoring tool writes and the viewer reads. It is the only thing the two share.

The author is the product owner and is not writing the code. Your job is to turn clear intent into working software, flag ambiguity early, and avoid building more than has been asked for.

## Principles that govern every decision

- **The container serves the content.** Interface and animation exist to support the story. Do not add features for their own sake.
- **Each episode must work with every optional layer ignored.** The main document is enough; marginalia, overlays and extras add depth only.
- **Reading is ergodic.** The reader chooses what to look at. Never force a linear walkthrough or hand out every secret.
- **The diegetic registry overlay is the highest priority.** If something must be cut, protect it first. It is the archive answering back with information the document does not contain.
- **Written documents first.** Support video and richer media later, but do not build for them now.
- **You build tooling, not story.** Do not invent plot, characters, lore, registry contents or document text beyond obviously labelled placeholder content. If you need sample content to test with, mark it clearly as placeholder.

## The viewer: what it must do

Describe behaviour, not implementation. Propose the technology (see "Working agreements").

1. **Folder wall.** A wall of Manila folders, each showing a title and a date of submission. The reader selects one.
2. **Opening animation.** The folder opens and a couple of documents slide or fall onto a tabletop.
3. **Work table.** One central document (the main document for the episode) plus supporting documents, for example a receipt or a CCTV still. Documents can be dragged around the table and zoomed in and out. Focusing one document can move the others out of the way.
4. **Document rendering.** Documents look like the real thing and vary by type: pseudo-handwritten, typed, receipt, photograph. The look should come from data (document type and style fields), not from hard-coded one-offs.
5. **Hotspots and marginalia.** Marginal notes and interactive areas sit on documents. Activating one opens a light-box overlay or brings up a supplementary document.
6. **Registry overlay.** Activating certain hotspots opens a diegetic overlay such as a search panel or database register, showing supplementary information about the thing referenced. Registry entries are data and may cross-reference entries from other case files.
7. **Reader notes.** A place for the reader to type their own notes into a case. Storage is an open question; ask before choosing.
8. **Tolerance.** If a package has no hotspots, no registry entries or no voiceover, it still opens and reads fine.

## The authoring tool: what it must do

The author works visually, with a light scripting escape hatch for behaviour the editor cannot express. The first version should be the smallest thing that lets the author produce one real episode.

- Create a case file: title, submission date, folder label.
- Add documents, choose a document type, and set one as the central document.
- Edit document content in each supported format.
- Place documents on the table and set their starting positions and sizes.
- Add marginalia and hotspots to a document and define what each opens.
- Author registry entries and cross-reference them to other files.
- Attach an archivist voiceover audio file.
- **Preview exactly as the reader will see it,** using the real viewer, not a lookalike.
- Export a finished case file package.
- Maintain a **continuity ledger**: a record of recurring names, symbols, ciphers and details, with the episodes and layers where each appears. Warn the author when a recurring element is used inconsistently.

Do not build a general-purpose design tool. If a feature is not on this list, ask first.

## The case file package (the contract)

Treat this as the most important design artefact in the project.

- Plain data plus media files, readable without the authoring tool.
- Carries an explicit **format version** so older episodes keep loading as the format evolves.
- Describes: metadata (title, date, folder label, order), documents (type, content, role, style), layout (starting position and size), hotspots and marginalia (position, target), registry entries (with cross-references), media (images, audio), and ledger references.
- Adding an episode to the archive must be as simple as adding one package. No code change.
- Changes to the package format are breaking changes: propose them, version them, and update both tools together.

**First task:** propose the package format and folder structure and wait for approval before building either tool against it.

## Suggested build order

Adjust only with the author's agreement.

1. Agree the case file package format.
2. Smallest authoring tool that can produce one episode. Hand-edited data files are acceptable at first, with the visual editor growing from real friction.
3. Minimal viewer: folder wall, opening animation, table with draggable and zoomable documents, document view.
4. Registry overlay.
5. Author writes episode one using the tools. Fix what hurts.
6. Reader notes, voiceover, more hotspot variety, ledger tooling.
7. Richer media such as video, only once written episodes work well.

## Working agreements

- **Propose before you build.** At the start, propose the technology stack for each product with reasons and trade-offs, and wait for approval. A sensible default to put forward: a local desktop app for authoring and a static, easily hosted website for the viewer, but justify it rather than assuming it.
- **Ask when in doubt.** If a requirement is ambiguous or a choice affects the story's feel, ask a short question instead of guessing. List the options and give a recommendation.
- **Small steps.** Build one step from the order above at a time. Show what works, then wait for feedback.
- **Keep scope tight.** No extra features, plugin systems or settings screens that were not asked for.
- **Share code between preview and viewer.** The authoring tool's preview must use the same rendering as the real viewer, so what the author sees is what the reader gets.
- **Look and feel is data.** Textures, fonts, handwriting styles and colours should be configurable assets, so the author can change them without touching code.
- **Keep it maintainable.** Clear structure, readable names, short comments where the reason is not obvious, and a README that explains how to run, build and add an episode.
- **Test the contract.** Include a sample case file built from clearly labelled placeholder content, and automated checks that the viewer loads it and that malformed or partial packages fail gracefully.
- **Record decisions.** When a decision is made in conversation, add it to a `DECISIONS.md` file with the date and reason, so it survives between sessions.

## Definition of done for a step

- It runs, and the author has seen it work.
- It matches the behaviour described above, or the differences are listed.
- Placeholder content is labelled as such.
- Any new decision is in `DECISIONS.md`.
- Open questions that surfaced are listed for the author.

## Open questions to raise with the author

- Where the viewer is hosted and how new episodes are published.
- Whether reader notes persist, and where they are stored.
- How the archivist voiceover is presented: always playing, per document, or optional.
- Release rhythm, and whether all episodes show on the folder wall at once.
- Which document types are needed after the witness statement.
