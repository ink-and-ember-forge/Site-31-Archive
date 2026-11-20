# Archive Project: Design Document

Nov 20, 2026 · @Chris Ramshaw

## Vision and principles

This project is a digital, episodic anthology told through an archive: each episode is a case file the reader explores for themselves on a virtual work table. Each file is complete in itself, and a slow-burning larger story sits underneath for those who dig.

**Tone and touchstones.** The feel sits somewhere between Archive 27, The Bright Sessions and The Magnus Archives: self-contained moments of interest, with a potential ongoing story captured across them. SCP supplies the model for the connective tissue.

**Principles**

- **The container serves the content.** The folder wall, the table and the overlays exist to tell the story, not to show off technology.
- **Ergodic reading.** The reader assembles the story. Nothing is spelled out the way it would be in audio, and what a reader misses is part of the experience.
- **Visual-only storytelling.** The format can carry things audio cannot: ciphers, recurring symbols, handwriting, receipts, CCTV stills.
- **Each episode stands alone.** The individual piece is the main draw. The meta narrative is completely optional, as in early Welcome to Night Vale or The Magnus Archives.
- **The meta narrative is emergent.** It builds through repeated sites, investigators, names and symbols across episodes, as in SCP, rather than being directed up front.
- **Start simple.** Written documents first. Video and other media can come later.

**The central bet.** The registry overlay, the archive talking back with information the witness did not know or would not say, is the heart of the experience. If a build decision ever forces a cut, protect that layer first.

## The viewer experience

The reader moves from a wall of folders, to an open folder, to a work table, to a single document, and every step is a small physical ritual. This is one finished episode as the reader meets it, using the witness-statement example.

1. **The folder wall.** A wall of Manila folders, each labelled with a title and a date of submission. The reader picks one.
2. **The folder opens.** A couple of documents fall or slide out onto the tabletop below.
3. **The work table.** The central document is the main one for the episode, here a witness statement. Alongside it sit supporting items, such as a shopping receipt or a CCTV still. Everything can be moved around the table, zoomed in and zoomed out.
4. **The main document.** It looks like the real thing: pseudo-handwritten, sometimes typed, with the format changing by document type. It carries marginalia and interactive elements.
5. **The diegetic layer.** Clicking an interactive element opens something that belongs to the world, such as a search overlay or a database registry, and adds information beyond what the document itself says.

**Other behaviours described so far**

- Focusing one document can move the others out of the way, so the table never becomes a pile.
- Clicking a footnote or marginal note zooms out into a light-box showing the marginalia for that spot.
- A reference inside a document can have its own supplementary document, for example a witness mentions a parking ticket and the ticket appears as an extra item.
- An archivist voiceover documents the material. It is part of the layered design and sits alongside the written layers.

**Written first.** The first episodes use written documents only. Video comes later, once the written format is working.

## Three interaction layers

The viewer offers three kinds of interaction, and the diegetic lookup is the one that must not be cut. They differ in what they ask of the writer and of the builder, so they are listed separately.

| Layer | What it is | Examples | Priority |
| --- | --- | --- | --- |
| Diegetic lookups | The archive answering back from inside the fiction | Registry overlay, database search, cross-references to other files | Highest: the heart of the experience |
| Physical handling | Treating the documents as objects | Dragging, zooming, focusing one document so others move aside, folder opening animation | Core: it carries the tactile feel |
| Reader-authored notes | The reader writing their own notes into the case | A notes area the reader types into | Supporting: useful, but not the heart |

**Why the registry leads.** The chosen priority is a layer of information around the document that is related to it but is not the document itself. That layer is where the archive supplies context the witness lacked, so it is where the world is built.

**A question for later.** Reader notes raise a practical choice: do they persist between visits, and are they stored on the reader's device or with an account? That is worth settling before the viewer is built.

## The registry as a world

The registry is the archive talking back, and the current lean is that it is institutional. What that institution wants is deliberately undecided and will emerge as the writing happens.

**Decided**

- The registry is diegetic: search overlays, database entries and registers that exist inside the fiction.
- It provides supplementary information that the core document does not contain.
- Its point of view is institutional rather than neutral.

**Suggested, to confirm**

- Give the registry one consistent voice and format from the first episode: dry, bureaucratic, a little too thorough. A stable register is something to subvert later, because a single entry that breaks it will land hard.
- Keep the institution's agenda undefined, but keep its voice fixed. The agenda can emerge; the register should not drift.
- Let the registry cross-reference between episodes. That is where the meta narrative can live without anyone explaining it.

**Left open on purpose**

- What the institution wants, what it hides, and who the archivist is in relation to it.

## Emergent meta narrative and the continuity ledger

The larger story is meant to be found, not delivered: it assembles in the heads of long-term readers from repeated elements across otherwise self-contained case files. Recurring sites, investigators, doctors, names and symbols are the raw material, as in SCP.

**Why a ledger is needed.** SCP gets its density from thousands of authors by accident. This project has one author, or a small team, so the same density has to be produced on purpose, even if the story itself is discovered by gardening rather than planned by architecture. Emergent does not mean unrecorded: without a record, recurring details drift and the pattern is lost by accident.

**Proposed: a lightweight ledger the authoring tool maintains.** It records every recurring element and where it has appeared.

| Element type | Examples of what to track |
| --- | --- |
| Names | Investigators, doctors, witnesses, institutions, sites |
| Symbols and ciphers | Recurring marks, any cipher system and its key |
| Registry entries | Entries that cross-reference other files |
| Details | Dates, places, objects that repeat across episodes |

For each element the ledger should hold which episodes mention it and in which layer (main document, marginalia, supplementary document, registry). The authoring tool can then warn when a name or detail is used inconsistently, and can show the writer which threads are accumulating.

**Recurring cast.** Who the recurring cast is has not been decided. The plan is to find out in practice as episodes are written.

## The authoring tool

The authoring tool is a mostly visual editor with room for light scripting, and it exists to build and package case files and everything attached to them. It comes first in the build order, because what it can produce defines what a case file is.

**What the writer needs to do**

- Create a case file: its title, submission date and folder appearance.
- Place documents on the table and set the central document apart from supporting ones.
- Write or import document content in different formats: pseudo-handwritten, typed, receipt, still image.
- Place marginalia and interactive hotspots on a document, and define what each one opens: a light-box, a supplementary document, a registry overlay.
- Author registry entries and link them across episodes.
- Attach the archivist voiceover.
- Preview the episode exactly as a reader will see it.
- Export the finished case file as a package the viewer can load.
- Maintain the continuity ledger described above.

**Visual first, scripting as an escape hatch.** The writer drags and places things visually. For the occasional behaviour the editor cannot express, light programmatic scripting is available underneath.

**Scope warning.** A visual editor is a product in its own right and could quietly consume the time meant for writing. The mitigation is to build the smallest editor that lets episode one ship, and to let the editor grow from the pain actually felt while writing. Claude Code does the building, which lowers the cost but does not remove the risk: the quality of the result depends on how clearly the design is specified.

## The case file package

A case file is a self-contained data package that the authoring tool writes and the viewer reads, and nothing else connects the two. If that contract is well defined, either side can be rebuilt later without breaking the other.

**What a package needs to describe**

| Part | Contents |
| --- | --- |
| Metadata | Title, submission date, folder label, episode order in the archive |
| Documents | Each document's type, format, content, and role (central or supporting) |
| Layout | Starting position and size of each document on the table |
| Hotspots and marginalia | Where they sit on a document, and what each one opens |
| Registry entries | Entries the episode contributes, with cross-references to other files |
| Media | Images, audio voiceover, later video |
| Ledger references | Names, symbols and details this episode adds to the continuity ledger |

**Rules for the contract**

- The package is plain data plus media files, readable without the authoring tool.
- The package carries a version number, so older episodes keep loading as the format evolves.
- Episodes are added to the archive by dropping in a package, so publishing an episode is just uploading one.
- The viewer must tolerate missing optional layers, because the episode has to work without any of them.

The exact file format and folder structure are technical choices for Claude Code, to be proposed and agreed during the first build step.

## Build approach and phasing

Claude Code builds both the authoring tool and the viewer, iteratively, and the author acts as product owner. That puts the weight on clear specification: the better the brief, the better the build.

**Suggested order, to be adjusted as it is tried**

1. **Agree the case file package.** Settle the contract first, since both tools depend on it.
2. **Build the smallest authoring tool that can produce one episode.** It could begin as hand-edited data files, with the visual editor growing out of the pain of editing them.
3. **Build a minimal viewer.** The folder wall, the opening animation, a table with draggable and zoomable documents, and a main document view.
4. **Add the registry overlay.** It is the priority layer, so it arrives early rather than last.
5. **Write and ship episode one.** Use the real writing to test the tools, then fix what hurts.
6. **Add notes, voiceover and hotspot variety.** Then add the continuity ledger tooling as the episode count grows.
7. **Consider video** and other richer document types once written episodes work well.

**Working method.** Each step is built against the design document and the instructions file for Claude Code, then reviewed by the author before the next begins. Decisions the writing reveals are added back to the documents rather than living only in conversation.

## Open questions

These are the points not yet decided, listed so they are settled deliberately rather than by accident. Some are meant to stay open until the writing answers them.

- [ ] Where does the viewer live: a website, a downloadable app, or both? This shapes how episodes are delivered "as it's uploaded".
- [ ] Do reader notes persist between visits, and where are they stored?
- [ ] How are the priorities beyond the registry overlay ranked? Physical handling is listed as core here, but only the registry has been explicitly prioritised.
- [ ] What is the release rhythm, and does the folder wall show every episode at once or reveal them over time?
- [ ] How is the archivist voiceover presented: always playing, triggered per document, or optional?
- [ ] Which document types are needed first beyond the witness statement?
- [ ] Who is the recurring cast, and what does the institution want? Left open on purpose, to be found in the writing.
- [ ] Does the project need a working title and a house style for the archive's look and feel?
