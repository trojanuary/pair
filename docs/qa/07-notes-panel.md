# 07 - Notes panel: cards, threads, composer, filters & actions

> Manual QA for everything inside the right-hand notes panel: how notes are ordered and grouped, how a note reads compact and expanded, the message thread and its hover actions, both composers and @-mentions, tags, search, the filter/sort popover, and every empty, loading and error state in the list.

| | |
|---|---|
| **ID prefix** | NOTE |
| **Scope** | `#notesList` rendering (order, day separators, empty states), compact and expanded note cards, the message thread and nested replies, the per-message action row (collapse / show-on-card / copy / edit / delete), inline edit + "Save & re-ask AI", double-click-to-edit, copy-to-clipboard, delete + confirm dialog, collapse, resolve rendering, auto and manual tags, the inline thread composer, the document-level composer, @-mention highlighting, notes search, the filter popover and its sort + auto-scroll rows, the `#notesCount` footer. |
| **Primary code** | `src/app.js:1601-1634` (mentions, composer submit), `src/app.js:1680-1937` (list helpers, cards, thread), `src/app.js:2084-2258` (`render`, edit/delete/collapse/tags, popovers), `src/app.js:3152-3173` (notes wiring), `src/app.js:3248-3280` (double-click to edit), `app.html:88-113`, `src/styles.css:160-355`, `src/styles.css:486-535` |
| **Checks** | 128 |

## Contents
- [1. List rendering, ordering & day separators](#1-list-rendering-ordering--day-separators) - 9 checks
- [2. Compact note cards](#2-compact-note-cards) - 12 checks
- [3. Expanded card, thread & replies](#3-expanded-card-thread--replies) - 12 checks
- [4. The per-message action row](#4-the-per-message-action-row) - 9 checks
- [5. "Show on card"](#5-show-on-card) - 6 checks
- [6. Inline edit, re-ask & double-click to edit](#6-inline-edit-re-ask--double-click-to-edit) - 13 checks
- [7. Copy note & copy response](#7-copy-note--copy-response) - 6 checks
- [8. Delete, collapse & resolved state](#8-delete-collapse--resolved-state) - 8 checks
- [9. Tags: auto, manual & removal](#9-tags-auto-manual--removal) - 9 checks
- [10. Inline thread composer & @-mentions](#10-inline-thread-composer---mentions) - 12 checks
- [11. Document-level composer](#11-document-level-composer) - 8 checks
- [12. Notes search](#12-notes-search) - 9 checks
- [13. Filter popover, sort & auto-scroll](#13-filter-popover-sort--auto-scroll) - 11 checks
- [14. Counter, empty states, persistence & stress](#14-counter-empty-states-persistence--stress) - 4 checks

---

**Standing pre-conditions** (assume for every check unless it says otherwise): desktop Chromium, window wider than 820 px, the app served from the site root (`/app.html`), both side panels expanded, the bundled sample **"BERT — Devlin et al. 2019 (NAACL).pdf"** open with its **12 seeded notes**, `state.ui.filter` = `all`, `state.ui.sort` = `time`, search bar closed. "Fresh profile" = `localStorage` key `srw_state_v1` cleared + reload. Saves are debounced 250 ms (`src/app.js:151 save()`) — never reload within a quarter second of an action you want persisted.

**Seeded fixtures used below** (`assets/sample-notes.js`, in list order under *Sorted by time*):

| # | Note | Why it is useful |
|---|---|---|
| 1, 7, 8, 9 | Linked-text notes with **zero messages** | Message-less card and head |
| 2 | Question + AI answer, tags `Question`, `Definition` | Plain Q&A thread |
| 3 | Q&A where the **AI answer is checked "Show on card"** | Full preview on the compact card |
| 4 | Long 2135-char quote + a **generated visual** ("Pretraining Timeline", image, 4 takeaways) checked on card | "Show more", visual rendering |
| 5, 10 | Comment-only notes | Fallback preview |
| 6 | **Screenshot** note, 4 messages, one AI answer checked | Thumbnail, `k-ai` over `k-shot` |
| 11 | Q&A on page 5 | Long-quote note |
| 12 | **Question about document** note, 6 messages (3 Q&A pairs) | Multi-turn thread, re-ask ordering |

**Console fixtures** (DevTools, only where a check calls for them — setup only, not a test):
- *Resolved note*: `s=JSON.parse(localStorage.srw_state_v1); s.annotations[1].resolved=true; localStorage.srw_state_v1=JSON.stringify(s); location.reload()`
- *Yesterday's note*: same shape, setting `s.annotations[0].created_at` to an ISO timestamp 24 h ago.

---

## 1. List rendering, ordering & day separators

### NOTE-001 - Fresh profile lists all 12 seeded notes, all compact
**P0** * Functional * `src/app.js:2084 render()`, `src/app.js:1901 annCard()`

- **Pre:** Fresh profile, sample open, page fully loaded.
- **Steps:**
  1. Look at `#notesList`.
- **Expect:** Exactly 12 note cards. Every one is a **compact** card (single row: number badge, preview, time top-right, "Page N · …" line) — none is expanded, because `state.ui.activeId` is `null` on boot. Footer reads "12 notes".
- **Watch:** A card rendering expanded on boot (a stale `activeId` restored from an older profile) pushes the rest of the list off-screen.

### NOTE-002 - "Sorted by time" orders by creation, oldest first
**P0** * Functional * `src/app.js:2094 render()`

- **Pre:** Sort control reads "Sorted by time ▾".
- **Steps:**
  1. Read the badge numbers top to bottom.
  2. Create a new note (select any text → "Note") and look at the list again.
- **Expect:** Seeded notes appear in creation order (badges 1,2,3,4,5,6,7,8,9,10,11,12 for the sample, since it was seeded in reading order). The new note lands at the **bottom** of the list, under the "TODAY" separator.
- **Watch:** Newest-first ordering — the app sorts ascending; a flipped comparator puts new notes at the top and breaks stick-to-bottom while an answer streams.

### NOTE-003 - "Sorted by page order" orders by page then anchor
**P1** * Functional * `src/app.js:2094 render()`, `src/app.js:3173 wire()`

- **Pre:** Default state.
- **Steps:**
  1. Click the footer button "Sorted by time ▾".
- **Expect:** Label becomes "Sorted by page ▾". Cards re-order by page number ascending, and within a page by badge number ascending (page 1 notes first, then page 2, 3, 4, 5, 8). No day separators are shown at all in this mode.
- **Watch:** Notes with the same page appearing in random order — the tie-break is `x.anchor - y.anchor` and depends on `renumber()` having run.

### NOTE-004 - Day separators appear only in time sort
**P1** * Visual * `src/app.js:2103 render()`, `src/app.js:1680 dayLabel()`

- **Pre:** Sorted by time.
- **Steps:**
  1. Note the separator above the seeded block.
  2. Switch to "Sorted by page ▾" and back.
- **Expect:** In time sort a small uppercase grey label sits above each day group; all 12 seeded notes sit under one label reading the seed date in the form "JUL 10" (uppercased `Mon D`). In page sort every separator disappears. Switching back restores exactly one separator per distinct day.
- **Watch:** A separator repeating between every card (the `lastDay` guard broken), or lingering separators after switching to page sort.

### NOTE-005 - "TODAY" and "YESTERDAY" labels
**P1** * Copy * `src/app.js:1680 dayLabel()`

- **Pre:** Sorted by time. Apply the *Yesterday's note* console fixture for step 2.
- **Steps:**
  1. Create a new note now; read its separator.
  2. Reload with the fixture applied and read the separator above that note.
- **Expect:** Step 1 → "TODAY" (uppercase, exactly that word). Step 2 → "YESTERDAY". Neither is a date.
- **Watch:** Off-by-one at midnight/DST — the diff is computed on local midnight boundaries, so a note made at 23:59 must flip to "YESTERDAY" (not "TODAY") after midnight.

### NOTE-006 - Only the active document's notes are listed
**P0** * Functional * `src/app.js:2093 render()`, `src/app.js:1690 passesFilter()`

- **Pre:** A second PDF open in the library, with at least one note of its own.
- **Steps:**
  1. Create a note on the second document.
  2. Switch back to the sample from the sidebar.
- **Expect:** The second document's note is **not** in the list and is not counted in the footer; the sample shows its own 12. Switching back shows the other document's note again.
- **Watch:** Notes bleeding across documents after an import, which also corrupts the badge numbering.

### NOTE-007 - Card tint matches the note kind
**P2** * Visual * `src/app.js:1833 cardKind()`, `src/styles.css:188-191`

- **Pre:** Default state.
- **Steps:**
  1. Compare the background of seeded notes 1 (plain highlight), 5 (comment-only), 2 (has an AI answer) and 6 (screenshot + AI).
- **Expect:** Four distinct faint tints: highlight-only cards warm sand (`k-hl`), free comments pale green (`k-comment`), any note containing an AI answer or generated visual pale violet (`k-ai`), screenshot notes without AI pale blue (`k-shot`).
- **Watch:** All cards rendering white — the `k-` class is built from `cardKind(a)` in the class string and silently drops if the template changes.

### NOTE-008 - AI presence wins over screenshot for the card kind
**P2** * Regression * `src/app.js:1835 cardKind()`

- **Pre:** Seeded note 6 (screenshot with AI answers) visible.
- **Steps:**
  1. Inspect its card classes.
- **Expect:** `k-ai` (violet), **not** `k-shot` — a note the AI has answered in always reads as an AI card. A screenshot note with no AI reply (capture a region and don't ask) renders `k-shot`.
- **Watch:** Rule order inverted so every screenshot note looks blue even after an answer arrives.

### NOTE-009 - Re-render preserves the list scroll position
**P1** * State * `src/app.js:2087-2152 render()`

- **Pre:** Sorted by time; scroll the notes list so note 8 or 9 sits mid-panel; do **not** select anything.
- **Steps:**
  1. Expand a note near the bottom, then collapse it with the chevron.
  2. Remove a tag from a note lower in the list.
- **Expect:** The list stays where you left it; it does not jump to the top after either re-render (`scrollTop` is captured before `innerHTML` is cleared and restored after).
- **Watch:** A jump to the top on every keystroke or every tag edit — the classic symptom of losing the saved `scrollTop`.

---

## 2. Compact note cards

### NOTE-010 - Badge number and colour
**P1** * Visual * `src/app.js:1871,1891 compactCard()`

- **Pre:** Default state.
- **Steps:**
  1. Compare the round badge on a text note against seeded note 6 (screenshot).
- **Expect:** Every compact card shows a round badge with the note's number, matching the numbered pin on the page. Text/comment/doc notes use the blue badge; the screenshot note's badge is green.
- **Watch:** Badge numbers drifting out of sync with the pins after a delete — `renumber()` runs at the top of `render()`, so both must change together.

### NOTE-011 - Time top-right comes from the first message
**P2** * Visual * `src/app.js:1870 compactCard()`, `src/app.js:1688 timeLabel()`

- **Pre:** Default state.
- **Steps:**
  1. Read the time in the top-right of note 2 (has messages) and note 1 (no messages).
- **Expect:** Local short time ("5:27 PM" style, locale-formatted, no seconds). Note 2 shows its **first message's** time; message-less note 1 falls back to the note's own `created_at`.
- **Watch:** "Invalid Date" on a note whose first message lost its `created_at` during an import.

### NOTE-012 - Location line shows page and section
**P1** * Copy * `src/app.js:1895 compactCard()`

- **Pre:** Default state.
- **Steps:**
  1. Read the bottom line of several compact cards.
- **Expect:** Format "Page N" for a note without a section, "Page N · <section>" when a section was captured (e.g. seeded note 1 reads "Page 1 · 4171 BERT"). Seeded note 5 has no section and shows just "Page 2".
- **Watch:** A dangling " · " when `section` is an empty string.

### NOTE-013 - Default preview is the first question or answer, clamped to 2 lines
**P0** * Visual * `src/app.js:1878-1885 compactCard()`, `src/styles.css:510`

- **Pre:** Seeded note 2 (nothing checked "Show on card").
- **Steps:**
  1. Look at its preview text.
- **Expect:** The first `comment`/`ai_answer` with text — here your question — rendered as plain text clamped to exactly **2 lines** with an ellipsis, no "You"/"AI" chip, right padding clear of the time stamp.
- **Watch:** A three-line or unclamped preview making every card tall; or the preview picking the AI answer instead of the question when nothing is checked.

### NOTE-014 - Message-less notes preview their linked quote
**P1** * Functional * `src/app.js:1886 compactCard()`

- **Pre:** Seeded notes 1, 7, 8, 9 (zero messages).
- **Steps:**
  1. Read their previews.
- **Expect:** Each shows its `selected_text`, clamped to 2 lines. The card is never blank.
- **Watch:** An empty white card body for a highlight-only note, which makes it look broken/undeletable.

### NOTE-015 - Markdown is flattened in the clamped preview
**P2** * Visual * `src/app.js:1847 plainPreview()`

- **Pre:** A note whose AI answer contains headings, bullets and code spans (seeded note 12's answers, or ask any question).
- **Steps:**
  1. Collapse the note so it renders compact with nothing checked on card.
- **Expect:** The preview is one flowing line: no `#`, `*`, `_`, `>` or backticks visible; bullets become "• " and newlines become double spaces.
- **Watch:** Raw markdown asterisks leaking into the preview, or the preview rendering as HTML (it must be escaped text).

### NOTE-016 - Screenshot thumbnail on the compact card
**P1** * Visual * `src/app.js:1894 compactCard()`, `src/app.js:20 safeImgSrc()`

- **Pre:** Seeded note 6.
- **Steps:**
  1. Look at the compact card.
- **Expect:** The captured region renders as a full-width bordered thumbnail under the preview text, above the "Page 3 · …" line.
- **Watch:** A broken-image icon after a reload — screenshots are offloaded to IndexedDB as `@idb` and rehydrated at boot (`rehydrateAssets()`); if rehydration fails the thumbnail must be absent, never a broken `<img>`.

### NOTE-017 - Unread dot on unresolved notes
**P2** * Visual * `src/app.js:1888 compactCard()`, `src/styles.css:535`

- **Pre:** Default state; then apply the *Resolved note* console fixture.
- **Steps:**
  1. Look at the bottom-right corner of any compact card.
  2. Reload with the fixture and look at that note.
- **Expect:** A small blue dot in the bottom-right of every **unresolved** compact card; the resolved note has **no** dot.
- **Watch:** The dot overlapping the "Page N" line at narrow panel widths.

### NOTE-018 - Resolved compact card is dimmed and flagged
**P1** * Visual * `src/app.js:1887,1895 compactCard()`, `src/styles.css:338-339`

- **Pre:** *Resolved note* fixture applied.
- **Steps:**
  1. Compare the resolved card with its neighbours.
- **Expect:** Whole card at reduced opacity (~0.72) and the location line ends with a green "✓ Resolved".
- **Watch:** The flag rendering as escaped text `&lt;span…` — it is injected as HTML while the section next to it is escaped, so a refactor can easily break one or the other.

### NOTE-019 - Clicking a compact card expands it and moves the reader
**P0** * Functional * `src/app.js:1898 compactCard()`, `src/app.js:1208 selectAnnotation()`

- **Pre:** No note selected.
- **Steps:**
  1. Click the body of seeded note 11 (page 5).
- **Expect:** The card expands in place (blue border + blue ring), any previously expanded note collapses, the reader scrolls to page 5 and the linked source, its pin turns selected, the connector line is drawn from pin to card, and the inline composer inside the card takes focus.
- **Watch:** Clicking a **collapsed-by-user** note not re-expanding — the handler deletes `state.ui.collapsed[a.id]` first; if that is dropped the card can never be reopened.

### NOTE-020 - Selecting text inside a compact card does not re-render it
**P1** * Edge * `src/app.js:1898 compactCard()`

- **Pre:** No note selected.
- **Steps:**
  1. Drag across the preview text of a compact card to select a few words, releasing inside the card.
- **Expect:** The selection survives, the card does **not** expand, and the reader does not jump. (A plain click with no selection still expands it.)
- **Watch:** The selection being wiped by the re-render, making it impossible to copy a snippet out of the list.

### NOTE-021 - Compact cards carry no tags, chips or provenance
**P2** * Visual * `src/app.js:1865-1899 compactCard()`

- **Pre:** Seeded note 2 (has tags "Question", "Definition") collapsed.
- **Steps:**
  1. Inspect the compact card.
- **Expect:** No tag pills, no "+ tag", no provenance chips, no "ⓘ AI-generated" disclosure — those exist only on the expanded card. The compact card is number, preview, optional thumbnail, location line, time, dot.
- **Watch:** Tag rows leaking into compact cards and doubling every card's height.

---

## 3. Expanded card, thread & replies

### NOTE-022 - Exactly one note is expanded at a time
**P0** * State * `src/app.js:1903 annCard()`

- **Pre:** Note A expanded.
- **Steps:**
  1. Click note B.
- **Expect:** B expands, A collapses back to compact in the same render. Never two expanded cards.
- **Watch:** Two expanded cards after a rapid click on two cards in succession.

### NOTE-023 - Expanded head: avatar, name, time, actions
**P1** * Visual * `src/app.js:1795 msgCard()`, `src/app.js:1713 actorAvatar()`, `src/app.js:1721 actorName()`

- **Pre:** Expand seeded note 2.
- **Steps:**
  1. Read the head row of the first message and of the AI reply below it.
- **Expect:** Your message: round blue avatar with your initials ("YO" by default) and the name "You". The AI reply: a round indigo brand avatar carrying the OpenRouter arrow glyph, `title="OpenRouter"`, and the name "OpenRouter". Both rows end with a right-aligned time.
- **Watch:** The name showing "AI" instead of "OpenRouter" (the `PROVIDER_LABEL` lookup lost the provider), or your custom name from Settings not being picked up.

### NOTE-024 - Source line: badge, kind, page, section
**P0** * Copy * `src/app.js:1799 msgCard()`, `src/app.js:1728 srcLabel()`

- **Pre:** Expand one note of each kind (a text note, seeded note 6, seeded note 12, and a fresh comment made with the Comment tool).
- **Steps:**
  1. Read the small grey line directly under each head.
- **Expect:** Blue circular anchor number, then exactly: "Linked text · Page 1 · 4171 BERT" for text notes, "Screenshot · Page 3 · …" for note 6, "Question about document · Page 8 · …" for note 12, "Comment · Page N" for a point comment. An "Equation" note reads "Equation".
- **Watch:** A wrong label after adding a new `source_type` — `srcLabel()` falls through to "Linked text" for anything unknown.

### NOTE-025 - Short quotes render without a toggle
**P2** * Visual * `src/app.js:1731 quoteBlock()`

- **Pre:** Expand seeded note 5 (92-char quote) or note 8 (18 chars).
- **Steps:**
  1. Look at the quote block.
- **Expect:** A serif quote with a left rule, fully visible, **no** "Show more" button (threshold is 150 characters).
- **Watch:** The button appearing on every quote, or a 151-character quote clamping to 3 lines when it already fits.

### NOTE-026 - Long quotes clamp with "Show more" / "Show less"
**P1** * Functional * `src/app.js:1731 quoteBlock()`, `src/app.js:2126 render()`

- **Pre:** Expand seeded note 4 (2135-char quote).
- **Steps:**
  1. Read the quote and the button label.
  2. Click it, then click it again.
- **Expect:** Quote clamped to 3 lines with a blue button labelled exactly "Show more". First click expands the full quote and the label becomes "Show less". Second click re-clamps and the label returns to "Show more". The card must not scroll to the top on either click.
- **Watch:** The label and the clamp getting out of sync after any other re-render (the state lives only in the DOM class, so a `render()` resets it to "Show more" — verify the quote is re-clamped too, not left open with the wrong label).

### NOTE-027 - Screenshot notes show the capture instead of a quote
**P1** * Visual * `src/app.js:1800 msgCard()`

- **Pre:** Expand seeded note 6.
- **Steps:**
  1. Inspect the card body.
- **Expect:** The captured image at full card width in a rounded border, and **no** linked-quote block.
- **Watch:** Both rendering, or a huge unconstrained image pushing the thread off screen.

### NOTE-028 - Replies nest inside the note card
**P0** * Visual * `src/app.js:1917-1921 annCard()`, `src/styles.css:194-201`

- **Pre:** Expand seeded note 12 (6 messages).
- **Steps:**
  1. Scroll through the whole card.
- **Expect:** ONE card holds the whole thread: the first message in the card body, then each later message as an indented `.reply` block with its own head row, separated by hairlines, each with a vertical rail on the left. AI replies have a faintly violet background and a violet rail; your replies keep the card background and a grey rail. Messages stay in chronological order.
- **Watch:** Replies rendering as separate sibling cards (the pre-thread layout) — a visible regression that also breaks the connector anchor.

### NOTE-029 - AI answers render markdown, math and code
**P1** * Visual * `src/app.js:1810 msgCard()`, `src/app.js:2039 mdRich()`

- **Pre:** Expand seeded note 12 and note 6.
- **Steps:**
  1. Read the AI answers.
  2. Ask a question whose answer contains a table and a formula (e.g. "summarise the GLUE results as a table with the formula for the loss").
- **Expect:** Bold/italic, bullet and numbered lists, headings, blockquotes, horizontal rules, inline code, fenced code blocks, and tables all render as HTML — never as raw markup. LaTeX typesets via MathJax shortly after the answer lands.
- **Watch:** Raw `**bold**` or a literal `|---|` table row; or MathJax never loading offline (the answer text must still be readable, just untypeset).

### NOTE-030 - Provenance disclosure under an AI answer
**P1** * Copy * `src/app.js:1811 msgCard()`, `src/app.js:1727 chipRow()`

- **Pre:** Expand seeded note 2.
- **Steps:**
  1. Read the collapsed summary line under the answer, then click it.
- **Expect:** Collapsed line reads "ⓘ AI-generated · openai/gpt-5.4 · sources" with " · sources" in blue. Expanding reveals the label "What this answer used" and the chip row — for note 2: "Page 1", "Section 4171 BERT", "Used highlighted text", "No external sources" (the last chip dimmed).
- **Watch:** A missing model name (the " · " separator must not be orphaned) and chips overflowing the panel instead of ellipsing.

### NOTE-031 - Disclosure open/closed state persists
**P2** * State * `src/app.js:2117 render()`, `src/app.js:1954 traceHTML()`

- **Pre:** Expand seeded note 12.
- **Steps:**
  1. Open the "sources" disclosure and the "Show the agent's work" disclosure on one answer.
  2. Click another note, then come back. Reload the page and expand the note again.
- **Expect:** Both disclosures are still open after the round trip and after reload (`state.ui.openDisc` keyed by message id). Closing one removes it from that map, so it stays closed afterwards.
- **Watch:** Every disclosure on the page opening at once (a shared key instead of a per-message key).

### NOTE-032 - Agent trace summary and tool count
**P2** * Copy * `src/app.js:1939-1956 traceHTML()`

- **Pre:** Expand seeded note 12 (its answers carry traces with tool calls) and note 2 (2-step trace, no tools).
- **Steps:**
  1. Read the disclosure labels.
  2. Open one.
- **Expect:** Label "Show the agent's work" alone when no tool was called, or "Show the agent's work · N tool calls" ("· 1 tool call" singular). Inside: either "Tools called: `search_document`, …" or "No tools were needed — answered directly from the context.", then numbered steps with "Input"/"Result" panes for tool steps.
- **Watch:** "1 tool calls" — the singular/plural switch is a one-character regression.

### NOTE-033 - Message-less note: expanded head and body
**P1** * Functional * `src/app.js:1910-1915 annCard()`

- **Pre:** Expand seeded note 1 (zero messages).
- **Steps:**
  1. Inspect the head row and hover it.
- **Expect:** Head shows your avatar, your name and the note's creation time. Hovering reveals only two actions — copy (`title="Copy note"`, note the different wording from a thread's "Copy whole thread") and delete (`title="Delete note"`) — plus the always-visible collapse chevron. There is **no** edit button and **no** show-on-card checkbox. The body shows the source line, the quote, the tag row and the inline composer.
- **Watch:** A JS error from `a.messages[0]` being undefined — this branch exists precisely to avoid that.

---

## 4. The per-message action row

### NOTE-034 - Actions stay hidden until the head row is hovered
**P1** * Visual * `src/app.js:1757 msgActions()`, `src/styles.css:285-286`

- **Pre:** Expand seeded note 2.
- **Steps:**
  1. Move the pointer away from the card, then onto the first message's head row.
- **Expect:** Copy / edit / delete fade in over ~0.12 s only while the pointer is over **that** head row; hovering a reply reveals only that reply's actions. The collapse chevron and the show-on-card checkbox remain visible at all times (chevron ~60 % opacity, checkbox ~50 % rising to ~80 % on hover).
- **Watch:** Actions permanently visible (noisy) or never appearing on a touch device — on touch there is no hover, so tapping the head must still expose them or the note cannot be edited.

### NOTE-035 - Collapse chevron
**P0** * Functional * `src/app.js:1747 msgActions()`, `src/app.js:2209 collapseNote()`

- **Pre:** A note expanded.
- **Steps:**
  1. Hover the first message's head and read the chevron's tooltip.
  2. Click it.
- **Expect:** Tooltip exactly "Collapse thread". Clicking collapses the note to a compact card **even though it is still the active note** (blue border gone, connector redrawn). Clicking the compact card expands it again.
- **Watch:** The chevron appearing on replies too — it must render only on the first message.

### NOTE-036 - Copy button tooltips differ by position
**P1** * Copy * `src/app.js:1754-1756 msgActions()`

- **Pre:** Expand seeded note 12.
- **Steps:**
  1. Hover the copy icon on the first message, then on any reply.
- **Expect:** First message → "Copy whole thread". Reply → "Copy this response". A message-less note's head → "Copy note".
- **Watch:** One tooltip applied everywhere, which hides the fact that the two buttons copy very different things.

### NOTE-037 - Edit button appears only on comments and AI answers
**P1** * Functional * `src/app.js:1745,1759 msgActions()`

- **Pre:** Expand seeded note 4 (comment + generated visual) and note 2.
- **Steps:**
  1. Hover each message head and count the icons.
- **Expect:** Comments and AI answers show a pencil with `title="Edit"`. The **generated visual** message shows no pencil (only checkbox, copy, delete). Ordering within `.macts` is always copy → edit → delete.
- **Watch:** A pencil on a generated visual — clicking it would open an editor bound to a message with no `text`.

### NOTE-038 - Delete tooltips and hover colour
**P1** * Visual * `src/app.js:1760-1761 msgActions()`, `src/styles.css:290`

- **Pre:** Expand seeded note 12.
- **Steps:**
  1. Hover the trash on the first message, then on a reply.
- **Expect:** "Delete note" on the first message, "Delete reply" on replies. Both icons turn red on hover; the other actions turn neutral dark.
- **Watch:** "Delete reply" shown on the first message — that button removes the whole note and its thread, so the wording is a safety feature.

### NOTE-039 - Action clicks never collapse or re-select the card
**P1** * Regression * `src/app.js:1931-1935 annCard()`, `src/app.js:2111-2126 render()`

- **Pre:** A note expanded, scrolled mid-thread.
- **Steps:**
  1. Click copy, then the show-on-card checkbox, then "+ tag" and cancel the prompt.
- **Expect:** The card stays expanded and roughly in place each time; the reader does not jump to the note's page; no double action fires (every handler calls `stopPropagation()`).
- **Watch:** Clicking a tag "×" also re-selecting the note and scrolling the PDF — the card's click handler must ignore `[data-rmtag]`, `[data-addtag]`, `[data-edit]`, `[data-delnote]`, `[data-delmsg]`, `[data-quotemore]`, `.thread-compose`, buttons, links, textareas, `summary` and `details`.

### NOTE-040 - No action row on compact cards
**P2** * Visual * `src/app.js:1865 compactCard()`

- **Pre:** Any collapsed note.
- **Steps:**
  1. Hover it.
- **Expect:** No copy/edit/delete/chevron icons appear anywhere on a compact card. Only the pointer cursor changes.
- **Watch:** Ghost icons rendering under the time stamp after a template change.

### NOTE-041 - Actions on a pending AI answer
**P1** * Edge * `src/app.js:1805 msgCard()`, `src/app.js:2193 deleteMsg()`

- **Pre:** Ask a question so an answer is pending ("Thinking…" with the three animated dots).
- **Steps:**
  1. Hover the pending reply's head.
  2. Click its trash.
- **Expect:** The pending reply carries copy/edit/delete like any other. Deleting it removes the bubble immediately with no confirmation; when the request finally resolves the answer must **not** reappear, and no JS error is thrown.
- **Watch:** The resolved answer being re-inserted (the in-flight closure still holds the message object) — a real risk worth confirming after every AI refactor.

### NOTE-042 - There is no per-note kebab menu (known gap)
**P1** * Regression * `src/app.js:2220 annMenu()`, `src/app.js:2113 render()`

- **Pre:** Default state.
- **Steps:**
  1. Expand a note and look for a "⋮" / "…" menu on the card or its head.
  2. Look for any way to mark a note resolved from the UI.
- **Expect:** **No** kebab exists on any card, and there is no "Resolve" / "Mark unresolved" control anywhere in the panel. `annMenu()` and its rows ("Resolve", "Mark unresolved", "Delete note") are wired in `render()` via `[data-menu]`, but no card template emits that attribute — the menu is currently unreachable.
- **Watch:** If a kebab is re-introduced, this check must flip: the popover must then show "Resolve" (or "Mark unresolved" when already resolved), a separator, and "Delete note" with the same confirm dialog as NOTE-072.

---

## 5. "Show on card"

### NOTE-043 - Checkbox default state and tooltip
**P1** * Copy * `src/app.js:1750-1753 msgActions()`

- **Pre:** Expand seeded note 2 (nothing checked).
- **Steps:**
  1. Hover the checkbox next to the collapse chevron on each message.
- **Expect:** An empty rounded-square checkbox, faint, `title="Show this on the collapsed card"`. It renders on comments, AI answers and generated visuals.
- **Watch:** The checkbox hidden inside `.macts` — it is deliberately outside, so it must be visible without hovering.

### NOTE-044 - Toggling it on
**P0** * Functional * `src/app.js:2198 toggleShowOnCard()`

- **Pre:** Seeded note 2 expanded.
- **Steps:**
  1. Click the checkbox on the AI answer.
  2. Hover it again to read the tooltip.
  3. Collapse the note.
- **Expect:** The box fills blue immediately; tooltip becomes "Showing on the collapsed card — click to hide". The compact card now shows that AI answer **in full** (no 2-line clamp), prefixed by a small green "AI" chip.
- **Watch:** The compact card still showing the old clamped question — `render()` must run after the toggle.

### NOTE-045 - Full preview formatting and the You/AI chips
**P1** * Visual * `src/app.js:1876-1884 compactCard()`, `src/app.js:1853 fullMsgHTML()`

- **Pre:** Seeded note 3 (AI answer already checked); also check your own question on note 2.
- **Steps:**
  1. Collapse both and compare.
- **Expect:** Checked AI messages render with full markdown (bullets, bold, line breaks preserved) behind a green "AI" chip; checked user comments render behind a blue "You" chip with line breaks preserved. No 2-line clamp and no right padding reserved for the time stamp on full previews.
- **Watch:** The chip rendering inside the first paragraph and breaking the bullet list layout.

### NOTE-046 - Multiple checked messages stack in order
**P1** * Functional * `src/app.js:1872-1885 compactCard()`

- **Pre:** Seeded note 12 expanded.
- **Steps:**
  1. Check your first question and the third AI answer.
  2. Collapse the note.
- **Expect:** Both appear on the compact card, in thread order (question first), separated vertically, each with its own chip. The fallback single preview disappears entirely.
- **Watch:** A card that grows unbounded when many messages are checked — confirm the panel still scrolls and other cards remain reachable.

### NOTE-047 - Checked generated visual renders on the compact card
**P1** * Visual * `src/app.js:1856-1861 fullMsgHTML()`, `src/styles.css:526-528`

- **Pre:** Seeded note 4 (its generated visual is checked).
- **Steps:**
  1. Look at the compact card.
- **Expect:** A bordered mini visual card with the centred title "Pretraining Timeline", the generated image constrained to ~220 px tall and centred, and the 4 takeaway bullets beneath. An ASCII diagram instead of an image renders as a dark monospace block that scrolls horizontally rather than widening the card.
- **Watch:** A full-size image blowing the card height out, or the image disappearing after reload (IndexedDB rehydration, as in NOTE-016).

### NOTE-048 - Unchecking restores the clamped fallback, and the state persists
**P1** * State * `src/app.js:2198 toggleShowOnCard()`

- **Pre:** Seeded note 3.
- **Steps:**
  1. Uncheck its AI answer, collapse, and observe.
  2. Re-check it, wait a second, reload the page.
- **Expect:** After unchecking, the compact card falls back to the clamped first question with no chip. After re-checking and reloading, the checkbox is still on and the compact card still shows the full answer (`showOnCard` is persisted per message).
- **Watch:** The flag lost on reload, or lost when the note is exported and re-imported.

---

## 6. Inline edit, re-ask & double-click to edit

### NOTE-049 - Edit opens a prefilled box with the caret at the end
**P0** * Functional * `src/app.js:2115 render()`, `src/app.js:1789 editBox()`

- **Pre:** Expand seeded note 2.
- **Steps:**
  1. Hover your question and click the pencil.
- **Expect:** The message body is replaced by a blue-bordered textarea containing the exact current text, focused, caret at the very end (type immediately and the characters append). Below it: "Save", "Save & re-ask AI", "Cancel". The list scrolls so the edit box sits vertically centred in the panel.
- **Watch:** The caret landing at position 0 so typed text prepends, or the panel scrolling to the top instead of centring the box.

### NOTE-050 - Cancel discards the edit
**P0** * Functional * `src/app.js:2116 render()`

- **Pre:** Edit box open on a comment.
- **Steps:**
  1. Type extra text.
  2. Click "Cancel".
- **Expect:** Box closes, the original text is unchanged, no toast, nothing saved.
- **Watch:** "Cancel" saving anyway because the change was already written into the model on input.

### NOTE-051 - Save writes the new text in place
**P0** * Functional * `src/app.js:2158 saveMsgEdit()`

- **Pre:** Edit box open on your question in seeded note 2.
- **Steps:**
  1. Replace the text with "Edited question about masked LM".
  2. Click "Save". Reload the page and re-open the note.
- **Expect:** The message shows the new text, in the **same position** in the thread; the AI answer below is untouched; the change survives reload. Leading/trailing whitespace is trimmed.
- **Watch:** The edited message jumping to the bottom of the thread, or the note's compact preview not refreshing.

### NOTE-052 - Cmd/Ctrl+Enter saves, Escape cancels
**P1** * Functional * `src/app.js:2127 render()`

- **Pre:** Edit box open.
- **Steps:**
  1. Type a change and press Cmd+Enter (macOS) / Ctrl+Enter (Windows/Linux).
  2. Re-open the editor, type again and press Escape.
- **Expect:** Step 1 saves and closes the box. Step 2 closes without saving. A plain Enter inserts a newline (it must **not** save).
- **Watch:** Plain Enter saving — the edit box is multi-line by design, unlike the composer.

### NOTE-053 - Saving an empty edit leaves an empty message
**P2** * Edge * `src/app.js:2161 saveMsgEdit()`

- **Pre:** Edit box open on a comment in a throwaway note you created.
- **Steps:**
  1. Select all, delete, click "Save".
- **Expect:** The message is saved as empty: the bubble renders with no text but the head row, actions and the rest of the thread survive; no crash. The compact preview falls back to the next message with text, or to the quote.
- **Watch:** A blank white gap that cannot be removed except by deleting the message — acceptable today, but flag it if an empty save starts deleting the message silently.

### NOTE-054 - "Save & re-ask AI" appears only on your own messages
**P1** * Functional * `src/app.js:1790 editBox()`

- **Pre:** Seeded note 2 expanded.
- **Steps:**
  1. Open the editor on your question, then cancel and open it on the AI answer.
- **Expect:** Your message shows three buttons ("Save", "Save & re-ask AI", "Cancel"); the AI answer shows only "Save" and "Cancel".
- **Watch:** The re-ask button on an AI message, which would re-ask the model its own answer.

### NOTE-055 - Re-ask drops the stale answer and asks again
**P0** * Functional * `src/app.js:2165 saveAndReask()`

- **Pre:** Seeded note 2 (one question + one AI answer). Network available.
- **Steps:**
  1. Edit the question to "In one sentence, what is a masked language model?" and click "Save & re-ask AI".
- **Expect:** The old AI answer is removed immediately, the edited question stays in place, a new pending bubble appears ("Thinking…" with animated dots) and is replaced by a fresh answer. The note gains no duplicate question.
- **Watch:** The old answer surviving next to the new one, or the question being duplicated because the edit was also submitted through the composer path.

### NOTE-056 - Re-ask only removes the AI messages directly after the edited one
**P1** * Functional * `src/app.js:2171-2174 saveAndReask()`

- **Pre:** Seeded note 12 (3 question/answer pairs).
- **Steps:**
  1. Edit the **first** question and click "Save & re-ask AI".
- **Expect:** Only the first AI answer disappears. Your second and third questions and their answers remain, unchanged and in order. The new answer is appended at the **end of the thread**, not directly under the edited question.
- **Watch:** The whole thread being wiped, or the new answer inserted mid-thread — both are behaviour changes a tester must notice and report even if they look "better".

### NOTE-057 - Re-ask with an empty box does nothing
**P2** * Edge * `src/app.js:2169 saveAndReask()`

- **Pre:** Edit box open on your comment.
- **Steps:**
  1. Clear the textarea entirely and click "Save & re-ask AI".
- **Expect:** Nothing happens: no save, no AI call, the box stays open with the buttons still active.
- **Watch:** An AI request being fired with an empty question (visible as a pending bubble that answers nonsense).

### NOTE-058 - @ai is stripped from the re-asked question
**P2** * Functional * `src/app.js:2174 saveAndReask()`

- **Pre:** Edit box open on your comment.
- **Steps:**
  1. Set the text to "@ai explain the NSP objective" and click "Save & re-ask AI".
- **Expect:** The saved message still displays "@ai" (highlighted blue), while the question sent to the model has it removed. The answer must not talk about the token "@ai".
- **Watch:** A message that was only "@ai" — the fallback keeps the original text so the request is never empty.

### NOTE-059 - Double-click a message to edit it
**P1** * Functional * `src/app.js:3257 wireNoteEditDblclick()`, `src/app.js:3248 editableIdsFromMsg()`

- **Pre:** Expand seeded note 12.
- **Steps:**
  1. Double-click the text of your first question.
  2. Cancel, then double-click the text of an AI reply.
  3. Double-click again, but slowly (over ~0.5 s between clicks).
- **Expect:** Steps 1 and 2 open the edit box for exactly that message, focused with the caret at the end. Step 3 does nothing (the window is 400 ms).
- **Watch:** The first click's re-render breaking the pair — detection is by message id, not element identity, so it must survive the re-render.

### NOTE-060 - Double-click ignores links, buttons, quotes and images
**P1** * Edge * `src/app.js:3266 wireNoteEditDblclick()`

- **Pre:** Expand seeded note 6 (screenshot + answers with citations) and note 4 (long quote).
- **Steps:**
  1. Double-click a citation link inside an answer, the "Show more" button, the linked quote, the screenshot thumbnail, a blue "@ai" span, and inside the composer.
- **Expect:** None of these opens an editor. A link opens in a new tab, "Show more" toggles the quote, text selection works normally in the quote.
- **Watch:** Double-clicking a word inside an answer to select it accidentally opening the editor — that is expected on `.msg` body text, but must never happen on the elements above.

### NOTE-061 - Double-click on a compact card's preview does not edit
**P1** * Edge * `src/app.js:3268 wireNoteEditDblclick()`

- **Pre:** Seeded note 3 collapsed (its AI answer is checked "Show on card", so the preview is a full `.msg`, not clamped).
- **Steps:**
  1. Double-click the preview text.
- **Expect:** The card expands (from the first click) and **no** edit box opens — a compact card has no `[data-edit]` button for the resolver to find. Double-clicking a clamped preview is ignored outright.
- **Watch:** A JS error in the console from `card.querySelector(':scope > .card-h …')` on a card with no head row.

---

## 7. Copy note & copy response

### NOTE-062 - "Copy whole thread" content and toast
**P1** * Functional * `src/app.js:1787 copyNote()`, `src/app.js:1771 noteToText()`

- **Pre:** Expand seeded note 2. Grant clipboard access if prompted.
- **Steps:**
  1. Click the copy icon on the first message.
  2. Paste into a plain-text editor.
- **Expect:** Toast reads exactly "Note to clipboard." The text is blank-line separated: header "Linked text — Page 1 · 4171 BERT", then the quote in double quotes, then "You: <question>", then "OpenRouter: <answer>", then "Tags: Question, Definition".
- **Watch:** The tags line appearing on a note with no tags (it must be omitted), and the header using a hyphen where an em dash is expected.

### NOTE-063 - "Copy this response" strips the speaker prefix
**P1** * Functional * `src/app.js:1788 copyMsg()`, `src/app.js:1764 msgToText()`

- **Pre:** Seeded note 2 expanded.
- **Steps:**
  1. Click the copy icon on the AI reply and paste.
- **Expect:** Toast "Response to clipboard." The pasted text is the answer **without** a leading "OpenRouter: ". If the answer had provenance chips they follow on a new line in parentheses, e.g. "(Page 1 · Section 4171 BERT · Used highlighted text · No external sources)".
- **Watch:** Over-eager prefix stripping removing real content from an answer that legitimately starts with a short "Label:" line.

### NOTE-064 - Copying a generated visual message
**P2** * Functional * `src/app.js:1768 msgToText()`

- **Pre:** Seeded note 4 expanded.
- **Steps:**
  1. Copy the generated-visual reply and paste.
- **Expect:** "Pretraining Timeline [image]" followed by a blank line and the 4 takeaways as "- " bullets. An ASCII diagram is pasted verbatim instead of "[image]".
- **Watch:** A megabyte of base64 pasted into the clipboard — the image must be referenced as "[image]", never inlined.

### NOTE-065 - Copying a message-less note
**P2** * Edge * `src/app.js:1771 noteToText()`

- **Pre:** Seeded note 1 expanded.
- **Steps:**
  1. Click "Copy note" and paste.
- **Expect:** Just the header line and the quoted `selected_text` — no empty "You:" line, no "Tags:" line.
- **Watch:** A trailing pile of blank lines from messages that produced empty strings.

### NOTE-066 - Clipboard fallback path
**P1** * Edge * `src/app.js:1778 fallbackCopy()`, `src/app.js:1782 copyTextToClipboard()`

- **Pre:** Load the app over plain `http://` on a LAN address (or any non-secure context) so `navigator.clipboard` is unavailable.
- **Steps:**
  1. Click a copy button and paste.
- **Expect:** The copy still works through the hidden-textarea fallback and the same toast appears. No visible textarea flashes on screen.
- **Watch:** Silent failure with a success toast — worse than an error. If both paths fail the toast must read "Copy failed — select the text and copy manually."

### NOTE-067 - Copy while the clipboard permission is denied
**P2** * Edge * Chromium only * `src/app.js:1784 copyTextToClipboard()`

- **Pre:** Chromium: site settings → Clipboard → Block for this origin. Reload.
- **Steps:**
  1. Click "Copy whole thread".
- **Expect:** The rejected promise routes into the fallback and the copy still lands; if that also fails you get the red error toast "Copy failed — select the text and copy manually." and no success toast.
- **Watch:** An unhandled promise rejection in the console with no user-visible feedback at all.

---

## 8. Delete, collapse & resolved state

### NOTE-068 - Delete-note confirmation dialog
**P0** * Copy * `src/app.js:2203 deleteNote()`, `src/app.js:2176 confirmDialog()`

- **Pre:** Expand any note.
- **Steps:**
  1. Click the trash on the first message.
- **Expect:** A modal over a dimmed backdrop asking exactly "Delete this note and its thread?" with two buttons: "Cancel" (ghost, left) and "Delete" (red/danger, right). "Delete" has focus after ~30 ms, so pressing Enter immediately confirms.
- **Watch:** A native `window.confirm()` appearing instead — the app uses its own dialog everywhere.

### NOTE-069 - Every cancel route out of the dialog
**P0** * Functional * `src/app.js:2184-2189 confirmDialog()`

- **Pre:** Delete dialog open.
- **Steps:**
  1. Press Escape.
  2. Re-open and click the dimmed area outside the box.
  3. Re-open and click "Cancel".
- **Expect:** All three close the dialog and keep the note. No note is deleted, the list is unchanged, and the key listener is removed (pressing Escape again does nothing odd).
- **Watch:** A leaked document-level Escape handler that later swallows Escape in the find bar or an edit box.

### NOTE-070 - Confirmed delete removes the note everywhere
**P0** * Functional * `src/app.js:2205-2207 deleteNote()`

- **Pre:** Note 11 (page 5) expanded, its pin visible on the page.
- **Steps:**
  1. Delete it and confirm.
- **Expect:** The card disappears; its highlight rectangles and numbered pin disappear from the page; the connector line is gone; remaining notes renumber contiguously (both badges and pins); the footer count drops by one; the change survives a reload.
- **Watch:** A stale pin left on the canvas until the next page render — `drawHighlights()` and `drawPins()` are called explicitly after the delete.

### NOTE-071 - Deleting a reply has NO confirmation
**P0** * Functional * `src/app.js:2193 deleteMsg()`

- **Pre:** Expand seeded note 12.
- **Steps:**
  1. Click the trash on the second reply.
- **Expect:** The reply is removed **instantly**, with no dialog, no toast and no undo. The rest of the thread and the note itself remain. The removal persists across reload.
- **Watch:** This is a data-loss footgun sitting one pixel from the copy button — verify the icons are visually distinct and the delete icon reddens on hover (NOTE-038). Report any regression that makes the trash easier to hit.

### NOTE-072 - Deleting the last note shows the empty state
**P1** * Edge * `src/app.js:2095-2099 render()`

- **Pre:** A document whose only note you are about to delete (create a second document with one note, or delete all 12 sample notes).
- **Steps:**
  1. Delete the final note.
- **Expect:** The list shows the centred grey empty state "No notes yet." on the first line and "Select text or capture a figure in the document to create a source-linked note." on the second. Footer reads "0 notes".
- **Watch:** The filter-specific copy ("No notes match this filter.") appearing while the filter is "All notes".

### NOTE-073 - Collapse persists across reload
**P1** * State * `src/app.js:2209 collapseNote()`

- **Pre:** Expand a note, then collapse it with the chevron (it stays the active note).
- **Steps:**
  1. Wait a second, reload the page.
  2. Click the card.
- **Expect:** After reload the note is still compact even though it is still `activeId`. Clicking it clears the collapsed flag and expands it again.
- **Watch:** A note that can never be re-expanded because the flag is not cleared on click — check specifically after a reload, not just in the same session.

### NOTE-074 - Rapid double-click on collapse / delete
**P2** * Edge * `src/app.js:2120,2124 render()`

- **Pre:** A note expanded.
- **Steps:**
  1. Double-click the collapse chevron fast.
  2. Double-click the trash fast.
- **Expect:** Collapse is idempotent — the card collapses once, no error. The trash opens exactly **one** confirm dialog (not two stacked); confirming deletes once.
- **Watch:** Two stacked dialogs where dismissing the first leaves an orphaned backdrop blocking the whole UI.

### NOTE-075 - Resolved notes and the "Unresolved" filter
**P1** * Functional * `src/app.js:1701 passesFilter()`, `src/app.js:1799 msgCard()`

- **Pre:** *Resolved note* console fixture applied (there is no UI to set it — see NOTE-042).
- **Steps:**
  1. Expand the resolved note and read its source line.
  2. Open the funnel and choose "Unresolved".
- **Expect:** Expanded source line ends with a green "✓ Resolved"; the card is dimmed. Under "Unresolved" that note disappears from the list while the other 11 remain, and the footer reads "12 notes · Unresolved" (the count still counts all notes).
- **Watch:** The resolved flag rendering on the compact card but not the expanded one, or vice versa.

---

## 9. Tags: auto, manual & removal

### NOTE-076 - Tag row renders only on the expanded card
**P1** * Visual * `src/app.js:1723 tagPills()`, `src/app.js:1928 annCard()`

- **Pre:** Expand seeded note 2.
- **Steps:**
  1. Look under the quote block.
- **Expect:** A wrapping row of small coloured pills — "Question", "Definition" — each with a faint "×" on its right, followed by a dashed outlined chip labelled exactly "+ tag".
- **Watch:** Duplicated pills when the same tag exists in both `auto_tags` and `manual_tags` (the row de-duplicates via a Set).

### NOTE-077 - Auto tag on a question-shaped message
**P1** * Functional * `src/app.js:1222 autoTag()`, `src/app.js:1629 submitToNote()`

- **Pre:** Create a fresh note from a text selection.
- **Steps:**
  1. Send "What does this table measure?" in the note's composer.
  2. Then send "noting this for later" in the same note.
- **Expect:** After the first message a blue "Question" pill appears. The second message adds no new tag (no question mark, no question-word opener).
- **Watch:** A tag added for every message, flooding the row.

### NOTE-078 - Screenshot and generated-visual auto tags
**P1** * Functional * `src/app.js:1225-1226 autoTag()`, `src/app.js:1587 generateVisual()`

- **Pre:** Sample open, network available, "Generate visuals" enabled in Settings.
- **Steps:**
  1. Capture a region with the screenshot tool and read the note's tag row.
  2. In that note's composer send "draw a diagram of this" and wait for the visual to finish.
- **Expect:** The note carries a cyan "Screenshot" tag from creation, and once the visual finishes a magenta "Generated visual" tag is added (seeded note 4 already shows this).
- **Watch:** "Generated visual" added even when generation failed with "Visual unavailable".

### NOTE-079 - Known tags are colour-coded; unknown tags fall back to grey
**P2** * Visual * `src/app.js:1725 tagPills()`, `src/app.js:1230 TAG_CLASS`

- **Pre:** Seeded notes 4 ("Timeline", "Request"), 6 ("Explanation", "Model version"), 12 ("Ablation").
- **Steps:**
  1. Compare those pills against "Question", "Screenshot", "Summary", "Action item".
- **Expect:** Mapped tags use their own palette (Question blue, Definition green, Equation orange, Figure violet, Screenshot cyan, Generated visual magenta, Confusion/Critique red, Summary green, Action item amber); any tag not in the map renders in the neutral grey "claim" style. Never unstyled black-on-white text.
- **Watch:** An unknown tag inheriting no class at all and breaking the row's alignment.

### NOTE-080 - "+ tag" prompt copy
**P1** * Copy * `src/app.js:2215 addTagFlow()`

- **Pre:** Expand any note.
- **Steps:**
  1. Click "+ tag".
- **Expect:** The browser's prompt appears with exactly: "Add tag (Question, Claim, Definition, Equation, Figure, Screenshot, Generated visual, Confusion, Critique, Summary, Action item):"
- **Watch:** In some Safari/Firefox configurations prompts can be suppressed after repeated use ("Prevent this page from creating additional dialogs") — if the checkbox was ticked, tags become unaddable with no feedback at all.

### NOTE-081 - Adding, duplicating and cancelling a tag
**P1** * Functional * `src/app.js:2218 addTagFlow()`

- **Pre:** Expand seeded note 2 (already has "Question").
- **Steps:**
  1. "+ tag" → type "Critique" → OK.
  2. "+ tag" → type "Critique" again → OK.
  3. "+ tag" → Cancel.
- **Expect:** Step 1 adds a red "Critique" pill. Step 2 adds nothing (Set de-duplication) and does not error. Step 3 changes nothing. The added tag survives reload.
- **Watch:** Case-sensitivity — "critique" is a different tag and renders grey; that is current behaviour, flag it only if the spec changes.

### NOTE-082 - Whitespace-only tag creates a blank pill
**P2** * Edge * `src/app.js:2218 addTagFlow()`

- **Pre:** Expand a throwaway note.
- **Steps:**
  1. "+ tag" → type a single space → OK.
- **Expect:** Today this adds an **empty** grey pill (the value is truthy before `.trim()`), which can still be removed with its "×". Record it as a defect if the pill is unremovable or if it breaks the "+ tag" chip's position.
- **Watch:** The empty tag being written into every export and search haystack.

### NOTE-083 - Very long tag text
**P2** * Edge * `src/app.js:1725 tagPills()`, `src/styles.css:274-275`

- **Pre:** Expand a throwaway note.
- **Steps:**
  1. Add a tag of ~120 characters.
- **Expect:** The row wraps; the pill may span the card width but must not push the card wider than the panel or cause a horizontal scrollbar in the notes list.
- **Watch:** The "+ tag" chip pushed off the right edge and becoming unclickable.

### NOTE-084 - "×" removes the tag from both auto and manual lists
**P1** * Functional * `src/app.js:2111 render()`

- **Pre:** Seeded note 2 with auto tag "Question" and a manual tag you added.
- **Steps:**
  1. Click "×" on "Question" and on your manual tag.
  2. Then send a new question ("Why does that matter?") into the same note.
- **Expect:** Both pills vanish immediately and stay gone after reload. The new question **re-adds** the auto "Question" tag — auto tags are re-derived per message, so a removed auto tag can legitimately come back.
- **Watch:** Clicking "×" also selecting the note and scrolling the reader (see NOTE-039), or removing only one of the two lists so the pill reappears on reload.

---

## 10. Inline thread composer & @-mentions

### NOTE-085 - Composer exists only inside the expanded card
**P0** * Visual * `src/app.js:1923-1926 annCard()`

- **Pre:** Default state.
- **Steps:**
  1. Expand a note and look at the bottom of the card.
  2. Collapse it.
- **Expect:** A grey strip at the bottom of the expanded card with a rounded textarea placeholder **"Reply or ask a follow-up…"** and a blue round-cornered send button (`title="Send"`). No compact card shows it; the panel's bottom composer is separate and always present.
- **Watch:** Two composers on screen looking identical — verify the placeholders differ ("Reply or ask a follow-up…" vs "Ask about this document…").

### NOTE-086 - Enter sends, Shift+Enter inserts a newline
**P0** * Functional * `src/app.js:2134 render()`

- **Pre:** A note expanded, composer focused.
- **Steps:**
  1. Type "first line", press Shift+Enter, type "second line", press Enter.
- **Expect:** Shift+Enter adds a line break and grows the box; Enter submits the whole two-line text as one message and clears the box. The posted comment preserves the line break.
- **Watch:** Enter inserting a newline instead of sending (mobile keyboards and IME composition are the usual culprits).

### NOTE-087 - Auto-grow up to 120 px, then scroll
**P2** * Visual * `src/app.js:2135 render()`, `src/styles.css:302`

- **Pre:** Composer focused.
- **Steps:**
  1. Paste ~15 lines of text without sending.
- **Expect:** The textarea grows line by line, stops growing at 120 px tall, and scrolls internally after that. The card and the send button stay aligned; the panel does not jump.
- **Watch:** Unbounded growth pushing the send button below the fold.

### NOTE-088 - Empty and whitespace-only sends are ignored
**P1** * Edge * `src/app.js:2132 render()`, `src/app.js:1623 submitToNote()`

- **Pre:** Composer focused and empty.
- **Steps:**
  1. Press Enter.
  2. Type three spaces and click the send button.
- **Expect:** Nothing at all: no message, no AI call, no toast, focus stays in the box.
- **Watch:** An empty bubble appended to the thread, which then triggers the intent router.

### NOTE-089 - A sent message appears immediately, before any AI reply
**P0** * Functional * `src/app.js:1628-1630 submitToNote()`

- **Pre:** Expand seeded note 5.
- **Steps:**
  1. Send "Does this hold for longer sequences?".
- **Expect:** Your message appears at the bottom of the thread instantly with your avatar/initials and the current time; the box clears and keeps focus; only then does a pending AI bubble (or nothing, for a personal note) follow.
- **Watch:** A visible delay before your own text appears — it is saved and rendered locally before the network call.

### NOTE-090 - @ai highlights live while typing
**P1** * Visual * `src/app.js:1601 attachMentions()`, `src/styles.css:305-310`

- **Pre:** Composer focused.
- **Steps:**
  1. Type "hey @ai can you check this @AI too".
  2. Scroll the textarea after pasting a long block containing "@ai".
- **Expect:** Both "@ai" and "@AI" render blue and bold; the rest is normal ink; the caret is visible and correctly positioned; text and highlight stay pixel-aligned (same font, padding and border). When the textarea scrolls, the highlight layer scrolls with it.
- **Watch:** Doubled or ghosted text (the mirror out of sync with the textarea), or invisible text if the mirror fails to render — the textarea itself is transparent by design, so a broken mirror means typing into a blank box.

### NOTE-091 - @ai forces an AI reply and is kept in the stored text
**P1** * Functional * `src/app.js:1627-1633 submitToNote()`

- **Pre:** A note expanded, network available.
- **Steps:**
  1. Send "@ai this is not a question".
- **Expect:** The posted message still shows "@ai" highlighted in blue. Despite having no question mark, an AI answer follows (`forceEngage`), and the answer does not refer to the literal "@ai" token.
- **Watch:** The same sentence **without** "@ai" also triggering the AI — a plain statement should normally stay a personal note.

### NOTE-092 - Duplicate submission inside 5 seconds is ignored
**P1** * Edge * `src/app.js:1626 submitToNote()`

- **Pre:** A note expanded.
- **Steps:**
  1. Send "double check".
  2. Immediately send exactly "double check" again.
  3. Wait 6 s and send it a third time.
- **Expect:** Steps 1 and 3 post; step 2 is silently dropped (no second bubble, no second AI call). No error appears.
- **Watch:** A user legitimately repeating a short message ("yes") within 5 s finding it swallowed — record it, it is the trade-off of this guard.

### NOTE-093 - Draft text and focus survive a re-render while the AI answers
**P0** * State * `src/app.js:2090-2091,2154 render()`

- **Pre:** Expand a note and ask a question so an answer is streaming (status text cycling "Thinking…" → "Gathering context…" → tool labels).
- **Steps:**
  1. While it works, type a long follow-up in the same composer and place the caret in the middle.
  2. Wait for several status changes and for the answer to land.
- **Expect:** Your draft text is never cleared, focus stays in the textarea, the caret stays where you put it, and the box keeps its grown height — through every re-render.
- **Watch:** Losing a sentence mid-typing each time the agent status changes; this fires several times per answer.

### NOTE-094 - Draft leaks when you switch notes mid-draft
**P1** * Edge * `src/app.js:2090,2154 render()`

- **Pre:** Expand note A, type "unsent draft" in its composer, do not send.
- **Steps:**
  1. Click compact note B in the list.
  2. Inspect B's inline composer.
- **Expect:** Record what happens. Current behaviour copies the draft into **B's** composer (the draft is captured from the old active card and restored into whatever card is active after the render). Note A's composer is empty when you return.
- **Watch:** The worse variant — sending that leaked draft to the wrong note. Verify the text is at least visible before it can be sent.

### NOTE-095 - Clicking inside the composer never collapses the card
**P1** * Regression * `src/app.js:2136 render()`, `src/app.js:1932 annCard()`

- **Pre:** A note expanded.
- **Steps:**
  1. Click the textarea, then drag-select text inside it, then click the send button with an empty box.
- **Expect:** The card stays expanded and does not re-select or scroll the reader on any of those interactions.
- **Watch:** Each click re-rendering the card and stealing the caret back to the end of the text.

### NOTE-096 - Stick-to-bottom only when you were already at the bottom
**P1** * State * `src/app.js:2088,2143-2149 render()`, `src/app.js:1201 followNoteBottom()`

- **Pre:** Expand seeded note 12 (a long thread) and ask a new question so an answer streams.
- **Steps:**
  1. While it streams, stay scrolled at the bottom and watch.
  2. Ask again, and this time scroll up to read an older reply while the answer arrives.
- **Expect:** Case 1: the list follows the newest content down as the answer grows and as a late-loading generated image resizes. Case 2: your scroll position is **not** yanked — the threshold is 40 px from the bottom.
- **Watch:** Being pulled to the bottom while reading (the classic chat-scroll bug), or the view never following so the answer appears to never arrive.

---

## 11. Document-level composer

### NOTE-097 - Placeholder is overridden at boot
**P0** * Copy * `src/app.js:3165 wire()`, `app.html:109`

- **Pre:** Fresh load of `/app.html`.
- **Steps:**
  1. Read the bottom composer's placeholder.
- **Expect:** Exactly "Ask about this document…". The markup default "Select text or a figure to start a note…" must never be visible.
- **Watch:** Seeing the markup default means `wire()` threw before line 3165 — check the console; several later bindings (sort button, search input) will also be dead.

### NOTE-098 - The context row above the composer never appears
**P2** * Regression * `app.html:107`, `src/styles.css:345-346`

- **Pre:** Default state, then select text, then select a note.
- **Steps:**
  1. Watch the area directly above the composer box in each state.
- **Expect:** `#composerCtx` stays hidden in every state — no JS references it. There must be no empty gap or stray number badge above the input.
- **Watch:** A visible empty grey strip if the `hidden` class is dropped from the markup.

### NOTE-099 - Sending creates a document-level note and asks the AI
**P0** * Functional * `src/app.js:3167 wire()`, `src/app.js:1669 askAboutDocument()`

- **Pre:** Sample open on page 3, network available.
- **Steps:**
  1. Type "summarise the fine-tuning procedure" (no question mark) and press Enter.
- **Expect:** A new note appears at the bottom of the list, expanded and selected, with the source line "Question about document · Page 3 · …". Your message is posted and an AI answer is requested **even without a question mark** (`askNextId` forces it). The composer clears, its mention highlight resets, and focus moves to the new note's inline composer.
- **Watch:** The message being kept as a "personal note" with no answer — the forced-ask flag is easy to lose in the router path.

### NOTE-100 - A document note has no pin, no highlight and no connector
**P1** * Functional * `src/app.js:1672 askAboutDocument()`, `src/app.js:1119 drawPins()`

- **Pre:** The note created in NOTE-099 is selected.
- **Steps:**
  1. Look at the PDF page and at the gap between reader and panel.
- **Expect:** No numbered pin, no highlight rectangle, no connector line — the note carries an empty `rects` array. The card still shows its anchor number in the source line.
- **Watch:** A pin drawn at the page origin (0,0) because an empty rect array was treated as `[{x:0,y:0}]`.

### NOTE-101 - Enter / Shift+Enter / auto-grow in the bottom composer
**P1** * Functional * `src/app.js:3169-3170 wire()`

- **Pre:** Bottom composer focused.
- **Steps:**
  1. Shift+Enter twice, type text, press Enter.
- **Expect:** Same rules as the inline composer: Shift+Enter newlines, Enter sends, the box grows to a 120 px maximum then scrolls, and it shrinks back to one row after sending.
- **Watch:** The box staying tall after sending (height reset to `auto` is part of the send path).

### NOTE-102 - Empty send does nothing
**P1** * Edge * `src/app.js:3167 wire()`

- **Pre:** Bottom composer empty.
- **Steps:**
  1. Press Enter, then click the send button.
- **Expect:** No note is created, no toast, no request. The list is unchanged.
- **Watch:** An empty "Question about document" note appearing in the list, which then cannot be distinguished from a real one.

### NOTE-103 - Asking with no document open
**P1** * Edge * `src/app.js:1670 askAboutDocument()`

- **Pre:** Empty library — trash every document including the sample, so the reader shows "Your library is empty".
- **Steps:**
  1. Type "hello" in the bottom composer and press Enter.
- **Expect:** Red toast reading exactly "Open a document first." No note is created and the composer keeps its text.
- **Watch:** A JS error from `pageTextCache[state.ui.page]` when no PDF is loaded — the guard runs first.

### NOTE-104 - @-mention highlighting in the bottom composer
**P2** * Visual * `src/app.js:3171 wire()`, `src/app.js:1601 attachMentions()`

- **Pre:** Bottom composer focused.
- **Steps:**
  1. Type "@ai compare the two models" and send it.
- **Expect:** "@ai" highlights blue+bold exactly as in the inline composer, and the highlight layer is cleared to empty on send (no ghost text left behind the placeholder).
- **Watch:** Leftover highlighted text visible behind the placeholder after sending — the send path explicitly resets the mirror.

---

## 12. Notes search

### NOTE-105 - Search bar toggle and placeholder
**P1** * Copy * `src/app.js:3154-3158 wire()`, `app.html:98-101`

- **Pre:** Search bar closed.
- **Steps:**
  1. Click the "Search notes" icon in the notes header.
  2. Click it again.
- **Expect:** A bar slides in under the header with a magnifier and an input whose placeholder is exactly "Search notes, answers, tags…"; the input receives focus immediately. Clicking the icon again hides the bar, clears the input **and** clears the active query so the full list returns.
- **Watch:** Closing the bar leaving the list filtered — the clear happens in the same handler.

### NOTE-106 - Live filtering while typing, count unchanged
**P0** * Functional * `src/app.js:3159 wire()`, `src/app.js:1691-1699 passesFilter()`

- **Pre:** Search open, 12 seeded notes.
- **Steps:**
  1. Type "bert", then extend to "bert embeddings".
- **Expect:** The list narrows on each keystroke with no lag. The footer counter keeps reading "12 notes" throughout — search never changes the count, only the visible cards.
- **Watch:** The counter tracking the filtered set instead (a change of contract worth reporting either way), or the list resetting its scroll to the top on every keystroke.

### NOTE-107 - All terms must match, in any order
**P1** * Functional * `src/app.js:1697-1698 passesFilter()`

- **Pre:** Search open.
- **Steps:**
  1. Search "masked language" and note the matches.
  2. Search "language masked".
  3. Search "masked zzzz".
- **Expect:** Steps 1 and 2 return the identical set (each whitespace-separated term must appear somewhere in the note, not necessarily adjacent). Step 3 returns nothing.
- **Watch:** Substring-of-the-whole-phrase matching, which would make step 2 return nothing.

### NOTE-108 - The haystack covers quote, section, page, tags, answers and provider
**P1** * Functional * `src/app.js:1692-1695 passesFilter()`

- **Pre:** Search open.
- **Steps:**
  1. Search a phrase from a quote; then a section string like "4171"; then "page 3"; then a tag like "Definition"; then "openrouter"; then "screenshot".
- **Expect:** Each returns the expected notes: "page 3" matches every note on page 3 (the literal "page N" string is in the haystack), "openrouter" matches every note containing an AI answer, "screenshot" matches the screenshot note via its source label and tag. Matching is case-insensitive.
- **Watch:** Tag matching failing on compact cards — tags are not rendered there, but they must still be searchable.

### NOTE-109 - Query is trimmed
**P2** * Edge * `src/app.js:3159 wire()`

- **Pre:** Search open.
- **Steps:**
  1. Type "  bert  " with leading and trailing spaces.
- **Expect:** Same results as "bert"; no empty-result state caused by the padding.
- **Watch:** The stored query keeping the spaces so the echoed empty-state copy shows them in the quotes.

### NOTE-110 - No-match empty state echoes the query safely
**P0** * Copy * `src/app.js:2096-2097 render()`

- **Pre:** Search open.
- **Steps:**
  1. Search "qqqzzz".
  2. Search `<b>boom</b>` and then `"><img src=x onerror=alert(1)>`.
- **Expect:** Step 1 shows the centred grey message exactly: No notes match “qqqzzz”. — with **curly** quotes around the term. Step 2 shows the markup as literal visible text; nothing renders bold, no image element, no alert, no console error.
- **Watch:** Straight quotes replacing the curly ones (a copy regression) and, far more serious, any HTML in the query being interpreted.

### NOTE-111 - Search and filter combine
**P1** * Functional * `src/app.js:1689-1706 passesFilter()`

- **Pre:** Search open.
- **Steps:**
  1. Set the funnel to "Screenshots" and search "bert".
  2. Then search a term that only appears in a non-screenshot note.
- **Expect:** Both conditions apply (AND). Step 2 yields the empty state, and its copy is the **query** variant ("No notes match “…”."), not the filter variant, because the query takes priority in the message.
- **Watch:** The filter silently resetting when a search starts.

### NOTE-112 - A stale query survives a reload while the bar is hidden
**P1** * State * `src/app.js:3157-3159 wire()`, `src/app.js:1691 passesFilter()`

- **Pre:** Search open.
- **Steps:**
  1. Type "qqqzzz" (no matches).
  2. Click a note or make any change that triggers a save, wait a second, then reload the page.
- **Expect:** Record the result. `state.ui.query` is not reset at boot and is not re-populated into the input, so the list can come back **filtered/empty with the search bar closed and the input empty** — a state the user cannot escape except by opening and closing the search bar.
- **Watch:** This reads as "all my notes are gone". Confirm the escape hatch (open the search icon, then close it) restores everything.

### NOTE-113 - Search over a large note set
**P2** * Perf * `src/app.js:2084 render()`

- **Pre:** A document with 100+ notes (import a large `.notes.json`, or duplicate notes via import).
- **Steps:**
  1. Type a 6-character query quickly, character by character.
- **Expect:** Typing stays responsive (no visible per-character freeze); the full list re-renders on each keystroke but stays under ~100 ms.
- **Watch:** Multi-second stalls once notes contain long AI answers — the haystack is rebuilt per note per keystroke.

---

## 13. Filter popover, sort & auto-scroll

### NOTE-114 - Funnel opens the popover with the exact rows
**P0** * Copy * `src/app.js:3152 wire()`, `src/app.js:2248 openFilterPopover()`

- **Pre:** Default state.
- **Steps:**
  1. Click the funnel icon (`title="Filter & options"`).
- **Expect:** A popover anchored just below the button showing, in order: the uppercase label "Show"; rows "All notes", "Unresolved", "Screenshots", "AI replies", "Questions"; a divider; the label "Sort"; rows "By time", "By page order"; a divider; the row "Auto-scroll to active note" with a toggle switch on the right. The current filter and sort rows are blue and bold.
- **Watch:** A missing divider or label after a row is added — the popover is built from a plain array where `{sep:true}` and `{lab:…}` are easy to drop.

### NOTE-115 - Popover stays open while you change filters
**P1** * Functional * `src/app.js:2251 openFilterPopover()`

- **Pre:** Popover open.
- **Steps:**
  1. Click "Unresolved", then "Screenshots", then "All notes" without closing.
- **Expect:** The popover remains open after every click (`keepOpen`), the blue "selected" styling moves to the clicked row (there is no checkmark — selection is colour + weight only), and the list behind it re-filters each time. Exactly one popover is on screen at any moment.
- **Watch:** Stacked popovers drifting a few pixels each time (each re-open must call `closePopovers()` first).

### NOTE-116 - Each filter's semantics
**P0** * Functional * `src/app.js:1700-1706 passesFilter()`

- **Pre:** Seeded sample.
- **Steps:**
  1. Apply each filter in turn and count the cards.
- **Expect:** "All notes" → 12. "Unresolved" → every note with `resolved` false (all 12 by default; 11 with the resolved fixture). "Screenshots" → only note 6. "AI replies" → every note containing at least one AI message (2, 3, 4, 6, 11, 12). "Questions" → notes tagged "Question" (2, 3, 6, 11, 12) — note 4 is excluded because it has no "Question" tag.
- **Watch:** "AI replies" matching a note whose only AI message is a **generated visual** — it should (any `actor === 'ai'` message counts); confirm note 4 appears.

### NOTE-117 - Filter label is appended to the counter and persists
**P1** * Copy * `src/app.js:2107-2109 render()`

- **Pre:** Default state.
- **Steps:**
  1. Choose "AI replies", read the footer, wait a second, reload.
- **Expect:** Footer reads "12 notes · AI replies" — full document count, then " · " and the filter's label. After reload the filter is still "AI replies", the list is still filtered and the footer still shows the suffix. Under "All notes" no suffix is shown.
- **Watch:** The count switching to the filtered number, or the suffix surviving after switching back to "All notes".

### NOTE-118 - Filter with no matches
**P1** * Copy * `src/app.js:2098 render()`

- **Pre:** A document with notes but no screenshots (a second PDF with one text note).
- **Steps:**
  1. Choose "Screenshots".
- **Expect:** The empty state reads exactly "No notes match this filter." (single line), and the footer still shows the true count plus " · Screenshots".
- **Watch:** The "No notes yet." copy appearing instead, which wrongly suggests the notes were lost.

### NOTE-119 - Sort rows change order and the footer label
**P1** * Functional * `src/app.js:2253-2254 openFilterPopover()`

- **Pre:** Popover open, sorted by time.
- **Steps:**
  1. Click "By page order", then "By time".
- **Expect:** Each click re-sorts the list, marks the chosen row blue, and updates the footer button text to "Sorted by page ▾" / "Sorted by time ▾" respectively (including the "▾"). Day separators disappear under page order and return under time.
- **Watch:** The footer button and the popover disagreeing about the current sort.

### NOTE-120 - Sort label is stale after a reload
**P1** * Regression * `src/app.js:2253 openFilterPopover()`, `app.html:104`

- **Pre:** Set sort to page order; wait a second; reload.
- **Steps:**
  1. Read the footer button, then open the funnel.
- **Expect:** Record the mismatch: the list is sorted by page and the popover marks "By page order" as selected, but the footer button still reads the markup default "Sorted by time ▾" because the label is only written on click. Clicking the button then toggles to time sort while showing "Sorted by time ▾" — one click "does nothing" visible.
- **Watch:** Any fix must set the label at boot from `state.ui.sort`.

### NOTE-121 - Auto-scroll toggle
**P1** * Functional * `src/app.js:2256 openFilterPopover()`, `src/app.js:2139-2151 render()`

- **Pre:** Popover open. The switch defaults to on (blue, knob right).
- **Steps:**
  1. Click "Auto-scroll to active note" and watch the switch.
  2. Close the popover, scroll the notes list away from the active note, then click a pin on the page.
  3. Re-enable it and repeat step 2.
- **Expect:** The switch animates off (grey, knob left) and the popover stays open. With auto-scroll off, selecting a note from the page no longer scrolls the notes list to it (the list keeps its position); with it on, the card is scrolled into view. The setting persists across reload.
- **Watch:** The toggle also being applied to the "stick to bottom while streaming" behaviour — that path lives under the same flag, so with auto-scroll off a streaming answer must not drag the list either.

### NOTE-122 - Clicking outside closes the popover
**P1** * Functional * `src/app.js:2245 openPopover()`, `src/app.js:2230 closePopovers()`

- **Pre:** Popover open.
- **Steps:**
  1. Click on a note card, then re-open and click on the PDF page, then re-open and press Escape.
- **Expect:** A mousedown anywhere outside the popover closes it (and the click still reaches the target — clicking a card selects it). Escape does **not** close it — record that as current behaviour.
- **Watch:** The outside-click listener never being removed, so later clicks close popovers that were just opened (a popover that "won't open").

### NOTE-123 - Popover stays inside the viewport
**P2** * Visual * `src/app.js:2242-2244 openPopover()`

- **Pre:** Narrow the window to ~900 px, then drag the notes panel splitter to its minimum width.
- **Steps:**
  1. Open the funnel popover.
- **Expect:** The popover is clamped at least 8 px from both window edges and sits 6 px below the button; it never renders half off-screen or triggers a horizontal page scrollbar.
- **Watch:** At mobile drawer widths (<820 px) the popover must still be fully reachable over the drawer.

### NOTE-124 - An unknown persisted filter degrades visibly
**P2** * Edge * `src/app.js:2107-2109 render()`, `src/app.js:1705 passesFilter()`

- **Pre:** Console: `s=JSON.parse(localStorage.srw_state_v1); s.ui.filter='page'; localStorage.srw_state_v1=JSON.stringify(s); location.reload()` (`'page'` is handled by `passesFilter` but has no row in `FILTERS`).
- **Steps:**
  1. Read the footer and open the funnel.
- **Expect:** The list shows only notes on the current page, but the footer reads "12 notes · undefined" and **no** row in the "Show" group is marked selected. Choosing any row recovers.
- **Watch:** Same class of failure for any filter value left behind by an older build — the footer must never print "undefined" to a user.

---

## 14. Counter, empty states, persistence & stress

### NOTE-125 - Counter singular / plural and live updates
**P1** * Copy * `src/app.js:2108-2109 render()`

- **Pre:** A document with exactly one note.
- **Steps:**
  1. Read the footer, add a note, then delete both.
- **Expect:** "1 note" (no "s"), then "2 notes", then "0 notes". The counter updates in the same frame as the list, and counts only the active document's notes.
- **Watch:** "1 notes", and a stale count after an import or a document switch.

### NOTE-126 - Empty state on a document with no notes
**P0** * Copy * `src/app.js:2098-2099 render()`

- **Pre:** Open a second PDF that has no notes.
- **Steps:**
  1. Read the notes list.
- **Expect:** Two lines, centred and grey: "No notes yet." then "Select text or capture a figure in the document to create a source-linked note." Footer "0 notes". The bottom composer is still present and usable.
- **Watch:** The two lines running together (the `<br>` dropped), or the sentence contradicting the current tool names.

### NOTE-127 - A very long single message renders without breaking the card
**P2** * Edge * `src/app.js:1803 msgCard()`, `src/styles.css:307`

- **Pre:** A note expanded.
- **Steps:**
  1. Send a message of ~5 000 characters including one 300-character unbroken "word" (e.g. a long URL-like string).
- **Expect:** The message wraps inside the card; the long token breaks rather than widening the card; the notes list never scrolls horizontally; the composer, tags and replies stay aligned.
- **Watch:** A horizontal scrollbar on `#notesList`, or the compact preview of the same note stretching every other card.

### NOTE-128 - Panel resize and reload during an open edit
**P1** * Edge * `src/app.js:2141-2142 render()`, `src/app.js:2115 render()`

- **Pre:** Open the edit box on a comment and type unsaved changes.
- **Steps:**
  1. Drag the notes panel's left splitter wider and narrower.
  2. Without saving, reload the page and re-open the note.
- **Expect:** Resizing keeps the edit box open with your text and the caret intact. After the reload the box is **still open** (`state.ui.editing` persists) but shows the **original** text — the unsaved changes are gone, which is the documented behaviour.
- **Watch:** The reloaded page opening an edit box on a message you can no longer see (if that note is not the active one) — verify no orphan editor appears elsewhere in the list.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `render()` src/app.js:2084 | NOTE-001, 002, 009, 044, 106, 113, 117, 125 |
| `render()` scroll/draft preservation src/app.js:2087-2091,2139-2154 | NOTE-009, 093, 094, 096, 128 |
| `render()` empty-state branch src/app.js:2095-2099 | NOTE-072, 110, 118, 126 |
| `render()` counter src/app.js:2107-2109 | NOTE-075, 106, 117, 124, 125 |
| `render()` dynamic wiring src/app.js:2111-2138 | NOTE-026, 039, 049, 050, 052, 074, 084 |
| `annCard()` src/app.js:1901 | NOTE-001, 022, 028, 033, 085, 095 |
| `compactCard()` src/app.js:1865 | NOTE-010, 011, 012, 013, 014, 016, 017, 018, 019, 020, 021, 040, 045, 046 |
| `msgCard()` src/app.js:1794 | NOTE-023, 024, 025, 027, 029, 030, 041, 127 |
| `msgActions()` src/app.js:1744 | NOTE-033, 034, 035, 036, 037, 038, 043 |
| `cardKind()` src/app.js:1833 | NOTE-007, 008 |
| `msgPreviewText()` src/app.js:1840 | NOTE-013, 014, 045 |
| `plainPreview()` src/app.js:1847 | NOTE-015 |
| `fullMsgHTML()` src/app.js:1853 | NOTE-045, 046, 047 |
| `passesFilter()` src/app.js:1689 | NOTE-006, 075, 106, 107, 108, 111, 112, 116, 124 |
| `openFilterPopover()` + `FILTERS` src/app.js:2247-2258 | NOTE-114, 115, 116, 117, 119, 120, 121 |
| `openPopover()` src/app.js:2231 | NOTE-114, 115, 122, 123 |
| `closePopovers()` src/app.js:2230 | NOTE-115, 122 |
| `annMenu()` src/app.js:2220 (no UI trigger) | NOTE-042 |
| `promptText()` src/app.js:2214 (dead code — no caller) | NOTE-042 (documented as unreachable) |
| `tagPills()` src/app.js:1723 | NOTE-021, 076, 079, 083, 084 |
| `addTagFlow()` src/app.js:2215 | NOTE-080, 081, 082 |
| `autoTag()` / `TAG_CLASS` src/app.js:1222-1232 | NOTE-077, 078, 079 |
| `deleteNote()` src/app.js:2203 | NOTE-068, 069, 070, 072, 074 |
| `deleteMsg()` src/app.js:2193 | NOTE-041, 071 |
| `collapseNote()` src/app.js:2209 | NOTE-035, 073, 074 |
| `toggleShowOnCard()` src/app.js:2198 | NOTE-043, 044, 045, 046, 047, 048 |
| `saveMsgEdit()` src/app.js:2158 | NOTE-051, 052, 053 |
| `saveAndReask()` src/app.js:2165 | NOTE-055, 056, 057, 058 |
| `editBox()` src/app.js:1789 | NOTE-049, 050, 054 |
| `copyNote()` src/app.js:1787 / `noteToText()` src/app.js:1771 | NOTE-062, 065 |
| `copyMsg()` src/app.js:1788 / `msgToText()` src/app.js:1764 | NOTE-063, 064 |
| `copyTextToClipboard()` src/app.js:1782 | NOTE-062, 063, 066, 067 |
| `fallbackCopy()` src/app.js:1778 | NOTE-066, 067 |
| `submitToNote()` src/app.js:1622 | NOTE-077, 088, 089, 091, 092 |
| `focusThreadCompose()` src/app.js:1616 | NOTE-019, 089, 099 |
| `attachMentions()` src/app.js:1601 | NOTE-090, 104 |
| `dayLabel()` / `timeLabel()` src/app.js:1680-1688 | NOTE-004, 005, 011 |
| `quoteBlock()` src/app.js:1731 | NOTE-025, 026 |
| `chipRow()` src/app.js:1727 | NOTE-030 |
| `srcLabel()` src/app.js:1728 | NOTE-024 |
| `actorAvatar()` / `actorName()` / `providerGlyph()` src/app.js:1708-1721 | NOTE-023, 089 |
| `traceHTML()` src/app.js:1939 | NOTE-031, 032 |
| `confirmDialog()` src/app.js:2176 | NOTE-068, 069, 074 |
| `wireNoteEditDblclick()` / `editableIdsFromMsg()` src/app.js:3248-3280 | NOTE-059, 060, 061 |
| `askAboutDocument()` src/app.js:1669 | NOTE-099, 100, 103 |
| `wire()` filter + search src/app.js:3152-3159 | NOTE-105, 106, 109, 112, 114 |
| `wire()` composer src/app.js:3162-3172 | NOTE-097, 099, 101, 102, 104 |
| `wire()` sort button src/app.js:3173 | NOTE-003, 119, 120 |
| `#btnFilter` "Filter & options" `app.html:92` | NOTE-114 |
| `#btnNotesSearch` "Search notes" `app.html:93` | NOTE-105 |
| `#notesSearchInput` "Search notes, answers, tags…" `app.html:100` | NOTE-105, 106, 109 |
| `#notesList` `app.html:102` | NOTE-001, 009, 113, 127 |
| `#notesCount` `app.html:104` | NOTE-117, 125 |
| `#sortSel` "Sorted by time ▾" / "Sorted by page ▾" `app.html:104` | NOTE-003, 119, 120 |
| `#composer` / `#composerCtx` / `#composerHL` / `#composerSend` `app.html:106-112` | NOTE-097, 098, 101, 102, 104 |
| `#composerInput` "Ask about this document…" | NOTE-097, 099, 101, 102, 103 |
| Inline composer placeholder "Reply or ask a follow-up…" | NOTE-085 |
| Tooltips "Collapse thread" / "Copy whole thread" / "Copy this response" / "Copy note" / "Edit" / "Delete note" / "Delete reply" / "Send" | NOTE-033, 035, 036, 037, 038, 085 |
| Show-on-card tooltips "Show this on the collapsed card" / "Showing on the collapsed card — click to hide" | NOTE-043, 044 |
| Buttons "Save" / "Save & re-ask AI" / "Cancel" | NOTE-049, 050, 051, 054, 055, 057 |
| "Show more" / "Show less" | NOTE-026 |
| "+ tag" chip and its prompt copy | NOTE-080, 081, 082, 083 |
| Confirm copy "Delete this note and its thread?" / "Delete" / "Cancel" | NOTE-068, 069 |
| Toasts "Note to clipboard." / "Response to clipboard." / "Copy failed — select the text and copy manually." / "Open a document first." | NOTE-062, 063, 066, 067, 103 |
| Empty states "No notes yet.…" / "No notes match this filter." / "No notes match “…”." | NOTE-072, 110, 111, 118, 126 |
| "✓ Resolved" flag + `.isres` dimming | NOTE-018, 075 |
| "AI" / "You" preview chips `src/styles.css:518-520` | NOTE-045, 046 |
| Provenance "ⓘ AI-generated · <model> · sources" + "What this answer used" | NOTE-030, 031 |
| Trace "Show the agent's work · N tool calls" / "No tools were needed — answered directly from the context." | NOTE-032 |
| Day labels "TODAY" / "YESTERDAY" / "JUL 10" | NOTE-004, 005 |
| `.macts` hover reveal `src/styles.css:285-290` | NOTE-034, 040 |
| `.men` / `.men-hl` mention mirror `src/styles.css:305-310` | NOTE-090, 104 |
| `.typing` pending bubble `src/styles.css:361-363` | NOTE-041, 055, 093 |
| `.popover` rows / `.sw` switch `src/styles.css:486-493`, `168-172` | NOTE-114, 121 |

## Deliberately not covered here

- **Notes-panel chrome and the injected header buttons** (Save notes, Import notes, Export to PDF, Delete all notes, the panel title, collapse "»", the splitter) - covered in `03-app-shell-and-library.md` §8.
- **Creating annotations** (selection popover, Highlight / Note / ✦ Ask AI, the comment and screenshot tools, rect anchoring, pins, the connector line, renumbering) - covered in `06-annotation-tools.md`.
- **What the AI actually answers**: the intent router, the agentic ReAct loop and its tool calls, visual/image generation, provider selection, quota and key errors, MathJax loading - covered in `08-ai-and-agent.md`. This document covers only how those results *render* in a card (pending bubble, error bubble, chips, trace disclosure, stick-to-bottom).
- **Notes persistence and transport**: `.notes.json` save/import, folder sync (`showDirectoryPicker`), the "Open notes file…" banner, cross-document re-attachment - covered in `04-document-lifecycle.md` and the notes-storage document.
- **Share-as-HTML export and the read-only bundle viewer** (where the composer and every editing affordance are hidden by `applyReadOnly()`) - covered in the share/export document.
- **Import sanitisation of malicious notes** (`sanitizeImportedAnnotation`, `safeImgSrc`) beyond the search-query escaping in NOTE-110 - covered in `13-security-and-privacy.md`.
- **Touch, drawer and on-screen-keyboard behaviour of the panel** (`.replying`, `--kb`, tap targets, focus rules on phones) - covered in `14-responsive-mobile-touch.md`.
- **Keyboard-only operation, focus order and screen-reader semantics of cards and popovers** - covered in `15-accessibility.md`.
- **Large-library and long-thread performance budgets** beyond NOTE-113 and NOTE-127 - covered in `17-performance-and-limits.md`.
