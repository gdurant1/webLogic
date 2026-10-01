# Project Outline: AI-Assisted Programming Study

**Purpose:** This project tests how AI can be used in programming. The goal is to help figure out what to teach students about using AI the right way when writing code.

**What we are measuring:**
- Time to build the program
- The steps and method used along the way
- Quality of the final work
- Possible benefits
- Possible problems
- Possible solutions to those problems

**Time:** We count both the AI's processing time and the programmer's time (writing prompts, testing, and using the output). This combined time is then compared to how long it would take to build a similar program without AI.

**Method:** We use a sliding scale from 10% AI ("minimal") to 90% AI ("maximum").
- *Minimal* means only asking the AI to write one function at a time.
- *Maximum* means asking the AI to build the whole program from one large prompt, with little checking.

This project sits somewhere in between: the AI was given detailed descriptions for each part of the program, and those parts were combined into one working application.

**Quality:** Quality is judged by the user (not the AI), and compared against other projects that used more or less AI help. The goal is to see how the amount of AI use relates to the quality of the result.

**Benefits:** Using AI well could mean building a good program faster, with fewer problems. Current (non-AI) methods are slower, but AI alone does not guarantee quality. If we can define a good method for using AI, it could become a standard — and a finished AI-assisted program could serve as a template for future projects.

**Problems:** AI can create problems if it isn't used correctly. The programmer still needs a solid understanding of programming — functions, how computers work, etc. Without that, the programmer can't properly guide the AI, check its work, or fix mistakes.

### Project Details
- **AI used:** Claude
- **Method:** Mixed — detailed prompts for each section, combined into one application
- **Language:** JavaScript, HTML, CSS
- **Standing rule given to the AI:** Never guess. Always ask questions about anything unknown, any conflicts, or any possible changes.

### Steps
1. **Create HTML** — AI was given detailed instructions on the page layout: where buttons go, what each button does (so it could use correct grouping and labels), and a rule to keep it plain HTML only (no CSS or JS). Output: `htmlPrompt.md`.
2. **Create CSS** — AI was given `htmlPrompt.md` plus detailed instructions: dark/light mode color themes, wire colors (high, error, off, etc.), and exact colors for headers and buttons. Output: `cssPrompt.md`.
3. **Test HTML and CSS** — Uploaded and tested. Notes were made on needed changes: buttons to remove, missing highlight colors, and button position changes.
4. **Testing cycle** — HTML/CSS were sent back to the AI with the list of fixes. After each round, the files were tested again for look and usability. This repeated until no more changes could be made without a working program behind it.
5. **Create JS** — AI was given the current HTML, CSS, and detailed instructions on how the program should work.
6. **Testing cycle** — Files were uploaded and tested for errors and needed fixes, then sent back to the AI with that list.
7. **Major change** — Decided to switch to an open-source library to handle the gate visuals, wire behavior, and canvas behavior. Done in two phases (Phase A and Phase B).
8. **Testing cycle** — Continued after Phase A and Phase B were finished.
9. **Requested conversation analytics from the AI.**

<----Conversationanalysis.md---->

# Conversation Analysis — Logic Gate Simulator (JointJS Rewrite + Phases A/B + Corrections)

> **Methodology note, read first.** I have no access to message timestamps —
> not when you sent a message, not when I started or finished a response.
> Everything below is reconstructed entirely from *incidental* evidence: the
> last-modified time of files I wrote (`ls -la --time-style=full-iso`), and
> timestamps inside local test-server access logs I happened to leave on
> disk. Two real limits on this evidence, found while compiling it:
> 1. A file's timestamp only reflects its **last** write. Several files
>    (`shapes.js`, `canvas.js`, `logic.js`, `selection.js`, `popups.js`,
>    `toolbar.js`, `tables.js`, `saveLoad.js`, `index.html`, `style.css`)
>    were edited in more than one phase, so their current timestamp only
>    marks the *final* edit — earlier edits from Phase A or B leave no trace.
> 2. I restarted the local test server with a truncating log redirect
>    (`> file.log`, not `>>`) at least once during Phase B, which erased
>    earlier testing bursts on that port. Phase B's testing time below is
>    therefore a **floor**, not the true total.
>
> Where the evidence genuinely can't distinguish "you were composing a
> reply" from "I was still working mid-turn," I've said so rather than
> guessing a split. A large prior chunk of this project (an initial JointJS
> rewrite session) was summarized for me by a conversation-compaction
> system rather than shown as live turns — it is **excluded entirely**
> below, since I have no turn-level visibility into it at all.

## Time

### What's solidly measurable (file/server timestamps, not estimates)

| Window | Duration | What it covers |
|---|---|---|
| Phase A: first file write → last Phase A browser test | **3h 52m 41s** | Writing all Phase A files (JointJS shapes, canvas, flip/port-mirroring, world bounds, Create Gate) and testing them — entirely inside one continuous reply, no user message in between |
| Phase B browser-testing window (log survives) | **2m 33s** | The *last* restart's worth of Phase B testing only — see the truncation caveat above. The real figure is higher; the SR-latch/self-loop debugging alone involved more test runs than this window could contain |
| Correction-batch browser-testing window | **13m 17s** | Rubber-band fix, size-scale check, tool-cursor tests, note-badge/clock-speed/wire-hit-area tests, and the wire z-ordering investigation (`toBack()` timing bug), all in one session |
| Writing the three updated `.md` files | **1m 46s** | `javascript.md` → `colorScheme.md` → `htmlPromptForCSS.md` |

### What is NOT separable with this evidence

| Gap | Duration | Why it can't be split |
|---|---|---|
| End of Phase A testing → start of Phase B testing | 9h 48m 23s | Contains: you reading the Phase A summary, sending "start Phase B," my Phase B implementation work, at least one mid-phase checkpoint, your "Continue," more implementation, a second "Continue." No intermediate file timestamps survive (overwritten by later edits) and no message timestamps exist at all. |
| End of Phase B testing → start of correction-batch testing | 3h 23m 23s | Contains: you reviewing Phase B, your bug-report-and-correction-request message (the multi-select/size/cursor/etc. list), and my initial implementation work on it before the first browser test. Same blind spot. |

**Bottom line on timing:** I can confidently say implementation+testing
consumed at least **~4h 10m** of clearly-bounded, assistant-side active
work (3:52:41 + 0:02:33 + 0:13:17, undercounting Phase B). I cannot produce
a defensible "your reply time" figure at all — every gap long enough to
possibly contain one also contains an unknown amount of my own unlogged
work, and your 1-hour exclusion rule can't be applied to a number I can't
first isolate. If you have your own client-side timestamps for when each
of your messages was sent, I could redo this section properly against
those instead of guessing from file evidence.

## Steps, in order

1. **fixPrompt.md analysis** — read the original bug/task list, cross-checked its claims against your actual `joint.js` rather than trusting it at face value (several claims didn't match reality — see Difficult Questions).
2. **Extensive clarifying Q&A before any code** — tabs vs. single canvas, Save/Load design, Back/Forward semantics, Custom Gates replacing tabs entirely, latch persistence scope. Many short exchanges, no file activity, so no timing evidence exists for this phase at all.
3. **Phase A build**: rewrote `shapes.js`/`canvas.js`/`app.js` for JointJS; fixed the paper-sizing bug, a CSS class-name typo, flip/port-mirroring, world bounds; built the whole Create Gate feature (`customGates.js`, new).
4. **Phase A testing** — real Playwright browser tests against your actual `joint.js`, not just code review.
5. **Phase B build**: id-preservation for Save/Load, latch/feedback evaluation with oscillation detection, per-clock groundwork, `saveLoad.js` (new).
6. **Phase B testing** — SR latch built from real NOR gates, oscillation detection, Save/Load round-trips, Back/Forward state machine, gate-limit-bypass-on-restore.
7. **Full project zip delivered** on request.
8. **Correction batch**: 9 separate user-reported issues/requests fixed in one pass (rubber-band visibility, 50% size increase, tool cursors, default cursor, truth-table titles, note badges, wider wire hit-area, adjustable clock speed) — plus two regressions this batch itself introduced and had to chase down (see below).
9. **Doc rewrite**: `javascript.md`, `colorScheme.md`, and `htmlPromptForCSS.md` (the last one had been stale since Phase A and was never previously touched) brought up to date with everything above — which surfaced one more real bug (custom gates had zero CSS styling, found while documenting them, not by a prior test).
10. **This document.**

## Significant changes

- **Architecture**: full migration from hand-rolled DOM/SVG to JointJS (`@joint/core`), then onto it: Create Gate (reusable custom gates with precomputed truth tables), Save/Load, Back/Forward (a single-save-point revert, explicitly *not* a conventional undo stack — your own simplified design superseded the original spec's tabs-based version), latch/feedback simulation.
- **Scope changes made explicitly by you mid-conversation**: dropped the originally-specified multi-tab system entirely in favor of Custom Gates; replaced a planned 100-step undo/redo with a much simpler single-save-point Back/Forward.
- **Nine corrections in the last batch**, two of which required real debugging rather than straightforward fixes (see below).

## Requests, answers, and the questions that actually needed deep technical knowledge

Most of this conversation was ordinary build-and-test work. A smaller number of points required real, specific knowledge of JointJS/Backbone internals or careful cross-referencing against your actual library file rather than general web-dev knowledge — these are the ones worth flagging:

1. **"Why won't the simulator place anything?"** — required tracing JointJS's Paper sizing model to find that `width`/`height` were set to the *world* size (20000px) instead of the viewport, rather than trusting the original bug report's own (incorrect) theory about a missing file path.
2. **`interactive` option: boolean vs. per-feature object** — your `joint.js` has a documented but easy-to-miss behavior where returning a plain `false` from the `interactive` callback disables *every* feature on a cell (including dragging a wire out of it), not just element movement. Diagnosing this needed reading `can(feature)`'s actual implementation, not just its name.
3. **The flip/classList bug** — flipping a control silently wiped `.checked`/`.pushed`/`.on` state because JointJS reapplies a cell's *declared* class on certain re-renders, discarding anything added via raw `classList`. This is a non-obvious Backbone/JointJS rendering-model fact, not a typical JS bug.
4. **Why a self-loop wire couldn't be dragged at all** — needed tracing `elementFromPoint` hit-testing against an SVG stacking order with three overlapping invisible/visible paths per wire, and confirming the fix empirically rather than from documentation.
5. **The Save/Load wire-registration bug** — a link constructed with its `source`/`target` already set in the constructor never fires a `change:target` event, because Backbone models don't fire `change:` events for a value's very first assignment, only for a later change. This is a real, easy-to-miss gotcha in event-driven model libraries generally, not specific to this app.
6. **The wire z-ordering regression** — the hardest single issue in the conversation. A fix (`toBack()`) was confirmed, via a prototype-level monkey-patch, to actually execute on the correct object — and still had no effect, because JointJS's own arrowhead-connection-completion logic bumps the link's z-order back up later in the *same synchronous tick*. The real fix (deferring with `setTimeout(..., 0)`) only came from forming and testing that specific hypothesis, not from documentation.
7. **Distinguishing `paper.el` from `#paper-host`** — a plausible-looking one-line fix (adding a cursor class to `paper.el`) silently failed because `paper.el` is an inner wrapper div JointJS creates for itself, distinct from the container element passed in — confirmed only by direct inspection, not assumption.

## Other notes relevant to efficiency

- **Every fix in this conversation was verified with real Playwright browser tests against your actual `joint.js`**, not just code review — this caught several bugs (items 2–7 above, plus a missing CSS rule for custom gates) that static reading would not have found, at the cost of real wall-clock time per fix (each of items 2–7 took multiple test-debug-retest cycles, visible in the correction-batch's 13m17s window alone covering several such cycles).
- **Two corrections in the batch directly regressed each other**: widening the wire's click target (your request) broke the ability to start a second wire from an already-connected port, which only surfaced because the SR latch regression test happens to need exactly that (one output feeding two gates). Without that specific pre-existing test, this regression could easily have shipped unnoticed.
- **Documentation had drifted significantly behind the code** before this pass — `htmlPromptForCSS.md` still described a pre-JointJS DOM structure that had been obsolete since very early in the project, and was flagged as stale once but not actually corrected until this request.
