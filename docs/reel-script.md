# PairedX reel — shooting script

The storyboard of the **first** reel — a 105s screen recording at 1920×1080 —
recovered by decomposing that file frame by frame, plus everything needed to
shoot one against the redesigned app.

`docs/screenshots/pairedx-reel.mp4` is now the V2 recording (150s, 60fps), shot
by hand rather than from this script, so the chapter list in §3 no longer
matches the shipped video beat for beat. It is kept because §4–§7 — the capture
geometry, the screencapture/ffmpeg recipe, and the eight ways the capture goes
wrong — apply to any future take.

---

## 1. Source material

The reel is shot against one paper and its notes sidecar. Both must be used —
the notes carry the highlights, the questions, and the AI answers that the
middle of the reel is entirely about. Nothing in chapters 2–5 is typed live.

| File | Role |
|---|---|
| `fe-25-1078.pdf` | Hansen, Yang & Abkar, *Wall-Modeled Large Eddy Simulation of Turbulent Smooth Body Separation Using the OpenFOAM Flow Solver* (ASME J. Fluids Eng., 19pp) |
| `fe-25-1078.notes.json` | 8 annotations: 6 text highlights, 2 screenshot notes, 5 AI answers with provider/model/tool traces |

Open them **together** — drag both onto the reader, or pick both in one
`Open PDF or bundle` gesture. `openFiles()` pairs a PDF with its `.notes.json`
sidecar in a single open; opening them separately makes the notes arrive as a
merge and the pin numbering can differ.

### What the 8 annotations contain

Pin numbers below are what the app renders on the cards, and they are what the
script refers to throughout.

| Pin | Page | Kind | Content |
|---|---|---|---|
| 1 | 1 | highlight (yellow) | *"two main factors largely determine OPENFOAM-based WMLES performance…"* — no thread |
| 2 | 1 | highlight + thread | you: **"summarize in a table"** → AI returns a 6-row Markdown table (Main finding / Reason / Specific inconsistency / Consequence / Broader implication / Suggested improvement) |
| 3 | 2 | highlight + comment | you: **"Plan"** — a plain comment, no AI |
| 4 | 3 | screenshot | a captured region of the TBLE equations block |
| 5 | 3 | highlight + thread | you: **"is this for wale?"** → AI: *"No — the selected passage is not describing the WALE SGS model…"* |
| 6 | 5 | highlight + thread | you: **"Summarize the posteriori results for the channel."** → AI: bulleted takeaways (BG outperforms BL, wall-model choice matters, near-wall TKE overshoot) |
| 7 | 7 | screenshot + thread | you: **"why are these starting from different y+?"** → AI explains first off-wall sampling points |
| 8 | 17 | highlight + thread | you: **"what did they study in this appendix and what was the results? explain briefly"** → AI summarises the WRLES periodic-hill validation |

The bundle contains **no generated visual**. Chapter 6 of the original reel
("Create Images from Text") was produced live, so reshooting it needs one real
`create_visual` call against a configured key. See §6.

---

## 2. One-time setup before rolling

1. **Serve the site locally.** `python3 -m http.server 8899` from the repo root;
   open `http://localhost:8899/app.html`.
2. **Clear the library** or accept that other documents show in the sidebar. The
   original reel has `fe-25-1078.pdf` as the only selected entry.
3. **Open both side panels.** If either is collapsed the top bar shows a reopen
   affordance (`#btnToggleLeft` / `#btnToggleRight`); click it. Collapse state
   persists across reloads, so check every time.
4. **Set the reader to 145%.** The app default is 115%, which is unreadable for
   a two-column journal page once the frame is scaled to 1080p. Two clicks of
   `#zoomIn` (0.15 each) gets there.
5. **Dismiss every banner.** The scanned-PDF prompt and the "Have notes for X?"
   sidecar offer are `position: fixed` at the viewport top and will float over
   the recording. Remove them before rolling, not during.
6. **Lay the app out at 16:9.** See §7 — the app's natural aspect isn't 16:9, so
   either letterbox in post or give `#app` an explicit 16:9 box and zoom it to
   fit the viewport.

---

## 3. The 13 chapters

Timings are from the original. Captions are lower-left, white, over a dark
bottom scrim: title on top, subtitle beneath.

### 1 · "Open a PDF" — 0:00–0:07

Open the file picker, choose the PDF, let it render. The original briefly shows
a different paper ("Attention Is All You Need") before switching — that is
incidental, not part of the story. Land on page 1 with the abstract visible,
both highlights already on it, pins 1 and 2 in the margin.

Then a slow scroll down through the introduction and back, to establish the
three-pane workspace.

### 2 · "Highlight" — 0:08–0:14

Click card **1** in the notes panel. The connector — a dashed clay hairline —
draws from the card to the highlighted passage on the page. Click card **3**
(the "Plan" comment on page 2); the reader jumps and the connector redraws.

The point of the chapter is the connector, so hold long enough for it to be
seen. It redraws on scroll and on panel toggle.

### 3 · "Ask @ai" / *Summarize, Explain, or Search the Web* — 0:15–0:29

Click card **2**. It expands to show the question *"summarize in a table"* and
the AI's table answer. Scroll the notes panel slowly through the whole table
(6 rows), then far enough to reveal the provenance row beneath it — the
`AI response · AI` label and the collapsed sources disclosure.

This is the longest chapter in the original (14s) and it should be: the rendered
Markdown table is the single most convincing thing in the reel.

### 4 · "Ask @ai from the Screenshots" — 0:30–0:42

Click card **4** — a screenshot note of the TBLE equation block on page 3, no
thread. Then card **7** — the screenshot of the four velocity-profile plots on
page 7, with *"why are these starting from different y+?"* and its answer.
Scroll through that answer; it contains inline LaTeX (\(y^+\)) which renders
through MathJax, so give it a beat to typeset.

### 5 · "Edit Everything" / *Even the AI responses* — 0:43–0:52

Open a card with an AI answer (card **6** is the clearest — a bulleted summary).
Click the edit control on the AI message, edit the text in place, save. The
claim is that nothing in the workspace is read-only, including model output.

### 6 · "Create Images from Text" / *Doodle with AI* — 0:53–1:08

**Requires a live API call.** In the composer on a note about wall modeling,
ask *"create an image to show this clearly"*. The agent calls `create_visual`
and returns a diagram — in the original, a "Wall Stress Modeling" panel with
equilibrium/nonequilibrium branches and takeaway bullets beneath it.

The result is not reproducible byte-for-byte. Either accept a different diagram,
or shoot this chapter once and reuse the footage.

### 7 · "Save your Notes in PDF" — 1:09–1:22

Click the export control in the notes header (`#btnExportPdf`). The full-page
**Export annotations** screen opens: a left rail of include/exclude checkboxes
(Comments, Linked text, AI responses, Screenshots, Visuals) and a layout choice
(Detailed / Compact), with a live preview on the right. Scroll the preview to
show highlights, the table answer, and a screenshot note all laid out.

Then `Export PDF` → the macOS print sheet → Save.

### 8 · "Save the PDF and Note Bundle in HTML" — 1:23–1:29

Back in the app, click **Share as HTML**. A toast reports the bundle being
built, then that it was exported — one self-contained file, PDF plus notes,
that opens in any browser and re-opens in PairedX for editing.

⚠ This really does write an ~8 MB file to `~/Downloads`. Expected during a
shoot; delete it afterwards.

### 9 · "Open the Notes PDF" — 1:30–1:32

Finder → the exported PDF → Preview. Brief.

### 10 · "Open the HTML Bundle (PDF and Notes)" — 1:33–1:37

Open the exported `.annotated.html` in a browser. It renders read-only with the
notes attached; the original then shows it re-opened in PairedX.

### 11 · "Settings" / *Bring Your Own API Key and change the Models!* — 1:38–1:41

Open Settings (gear, `#btnSettings`). The **AI & Tools** tab: the shared-key
explainer, the OpenRouter provider card (marked Default) with API key and three
model fields, then the OpenAI-compatible card with base URL and its own models.
Scroll to the identity row and the two tool switches.

### 12 · "Settings" / *Change the Default Prompts (Save and Load Them in JSON)* — 1:42–1:43

**Templates** tab. Export / Import / Reset all, then the system prompts (Text
answers, Images & diagrams, Diagram fallback, Web search, Intent router) and
below them the agent tool descriptions. Expand one to show it is real editable
text.

### 13 · "Storage" / *Automatic Folders for Saving Notes* — 1:44–1:45

**Storage** tab. Choose folder…, Export notes (JSON), Import notes (JSON), and
the explanation that notes always live in the browser with an optional folder
sync. Close.

---

## 4. Recording

macOS `screencapture` records video of a screen region, at native retina
resolution, and reuses the screen-recording permission stills already have:

```bash
# x,y,w,h in points; -V limits the take; -k highlights clicks
screencapture -v -V 78 -R 144,187,1224,688 take1.mov
```

That produced 2448×1376 at 120 fps here. `-R` takes **logical points**, and the
origin is the display's top-left — so the y you want is
`(viewport_top_in_physical_px / 2) + your_top_margin`.

To find the viewport's top edge on screen, put a full-viewport solid-colour
overlay up and locate it in a full-screen capture. Do the colour match with a
tolerance: macOS captures in Display P3, so `#ff00ff` comes back around
`(234, 51, 247)`, not `(255, 0, 255)`.

Then scale and burn captions:

```bash
ffmpeg -i take1.mov -i scrim.png \
  -filter_complex "[0:v]scale=1920:1080:flags=lanczos,setsar=1[v];[v][1:v]overlay[bg];\
[bg]drawtext=fontfile=PublicSans-Bold.ttf:text='Ask @ai':fontsize=52:fontcolor=white:\
x=96:y=H-152:enable='between(t,14.7,27.7)'[out]" \
  -map "[out]" -r 30 -c:v libx264 -crf 20 -pix_fmt yuv420p out.mp4
```

`PublicSans.ttf` is a variable font; instance it to a static weight with
`fontTools.varLib.instancer` before handing it to `drawtext`, which ignores
variation axes and would otherwise render Regular where you asked for Bold.

---

## 5. Driving the app from a script

If the walkthrough is scripted rather than performed by hand, Chrome will run
JavaScript sent over Apple Events — but only with
**View ▸ Developer ▸ Allow JavaScript from Apple Events** enabled (verified in
Chrome 150; it is the last item in that submenu). Turn it back off afterwards:
it lets *any* AppleScript execute JS in the browser.

```bash
osascript -e 'tell application "Google Chrome" to execute front window'"'"'s active tab javascript "…"'
```

Two things matter for the result to read as video rather than as slides:

- **Ease every scroll through `requestAnimationFrame`.** Setting `scrollTop`
  directly teleports and the recorder catches one frame of motion. A cubic ease
  over 2–3s is what makes it look like a person scrolling.
- **Run the whole timeline from one call.** Fire a single function that schedules
  all beats with `setTimeout` on its own clock. Stepping it from outside, one
  Apple Event per beat, reintroduces the stutter you were trying to avoid.

---

## 6. Gotchas, all of them hit at least once

1. **The automation glow.** While the Claude-in-Chrome extension is attached it
   paints a soft border around the viewport. It is drawn outside the page, so
   the DOM cannot see it and `elementsFromPoint` finds nothing — but
   `screencapture` bakes it in. It reaches about 14 points inward. Either detach
   the extension, or inset the app and crop to the app's box rather than the
   viewport's.
2. **Fixed-position furniture escapes the crop.** Banners, toasts, the selection
   popover, modals and `#exportRoot` are body-level and `position: fixed`, so
   they neither inherit a zoom applied to `#app` nor move when it is panned.
   Re-parent them, or size them separately.
3. **`#exportRoot` is a full-viewport layer.** Giving it the same box as `#app`
   is not enough — its inner layout is viewport-relative, so a crop to the app
   box slices its left rail. Shoot the export chapters against the full viewport.
4. **Panels re-collapse.** Collapse state is persisted, and a re-render after
   leaving the export screen brings it back. Re-assert it before each take.
5. **Share as HTML is not a dry run.** It builds and downloads the real bundle.
6. **`[data-reveal]` holds `transform: scale(.97)`** until its transition ends,
   so any `getBoundingClientRect` sampled too early reads 3% small — and the
   parent's transform affects the child's rect even when the child's own
   `transform` computes to `none`.
7. **Do not write the raw capture to a dotfile.** `screencapture` refuses
   `.raw.png` with "cannot write file to intended destination".
8. **Keep Chrome frontmost for the whole take.** Any shell command raises the
   terminal; re-activate Chrome immediately before rolling, and do not touch the
   machine while it records.

---

## 7. Frame geometry that worked

The app's natural proportions are not 16:9, so it must be shaped deliberately.

```js
// 1700×956 layout is a roomy 16:9; zoom 0.72 renders it at 1224×688, which
// fits a 1512×758 viewport with 144/33pt of clearance on every edge — more
// than the extension glow reaches.
app.style.cssText = 'width:1700px;height:956px;zoom:0.72;margin:46px 200px;';
```

`margin` is in the element's own pre-zoom units, so `46/200` lands as `33/144`
on screen. Capture region: `-R 144,187,1224,688`. Recorded at 2448×1376, which
downscales to 1920×1080 with a little supersampling left over.

At that size the panes are 238 / 1070 / 392 — the same proportions the original
reel has at 1920 wide.

---

## 8. Still open

- Chapters 7–10 need a second take against the full viewport (§6.3).
- Chapter 6 needs one live `create_visual` call (§3.6).
- `reel-poster.jpg` should be re-cut from a frame of the final video — the
  workspace at the end of chapter 3, with the table answer open, is the
  strongest single frame.
