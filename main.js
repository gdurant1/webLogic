/**
 * main.js — Application Entry Point
 * ---------------------------------------------------------------------------
 * The only <script> index.html loads (after the JointJS UMD build itself,
 * loaded as a plain classic <script> so its `joint`/`g`/`V` globals exist
 * before this module evaluates — see index.html).
 *
 * Import order matters here in one specific way: canvas.js creates the
 * `joint.dia.Paper` (and, folded into the same file, the code that turns a
 * completed drag into a registered wire — see canvas.js's header) at
 * module-evaluation time, and selection.js / popups.js / toolbar.js each
 * read that paper via `getPaperInstance()` at THEIR module-evaluation time
 * too. Because each of those files itself `import`s canvas.js, ES modules
 * guarantee canvas.js's body has already run before theirs does, regardless
 * of the order main.js imports them in below — but canvas.js still has to
 * be imported by SOMETHING before this file's own top-level code (the
 * mousedown-adjacent work is now mostly paper events set up inside those
 * files themselves, so main.js's only remaining job is the first render
 * pass).
 *
 * customGates.js (Phase A "Create Gate") imports both canvas.js and
 * logic.js itself (for their late-bound resolvers — see that file's
 * header for why a two-way static import back here would be circular), so
 * by the time ITS body runs, both are already fully evaluated regardless of
 * where its import line sits below.
 */
import * as Canvas from './canvas.js';
import './selection.js';
import * as Logic from './logic.js';
import * as Tables from './tables.js';
import * as Toolbar from './toolbar.js'; // also wires up dark mode — see its header
import './popups.js';
import * as CustomGates from './customGates.js';

const start = () => {
    Toolbar.initViewport();
    CustomGates.loadFromStorage(); // populate the Custom Gates palette before the first render
    Logic.evaluate();
    Tables.rebuild();
};

// Module scripts run after the DOM is parsed, but stay safe if that ever changes.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
