/**
 * main.js — Application Entry Point
 * ---------------------------------------------------------------------------
 * The only <script> index.html loads. Importing the feature modules is what
 * starts them: each one attaches its own listeners when it is first imported
 * (module scripts are deferred, so the DOM is fully parsed by then).
 *
 * This file owns two things that need to see every module:
 *
 * 1. THE MOUSEDOWN ROUTER — one listener on the canvas that decides what a
 *    press means, replacing the four separate mousedown handlers that used
 *    to live in canvas.js / wires.js / selection.js / toolbar.js:
 *       press on an output node        -> Wires.beginWireDrag
 *       press on a control's body      -> Canvas.beginControlDrag
 *                                         (ignored by the pan tool)
 *       press on empty space, multiselect armed -> Selection.beginRubberBand
 *       press on empty space otherwise -> Toolbar.beginPan
 *    Input nodes and a control's own inputs/buttons/switch are left alone so
 *    they keep working normally. Only the left button is handled.
 *
 * 2. THE FIRST PASS — size and center the world, then run one evaluation and
 *    one truth-table build so everything is correct on the first frame.
 */
import './theme.js';
import * as Canvas from './canvas.js';
import * as Wires from './wires.js';
import * as Selection from './selection.js';
import * as Logic from './logic.js';
import * as Tables from './tables.js';
import * as Toolbar from './toolbar.js';
import './popups.js';

const viewport = document.getElementById('canvas');

viewport.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const target = event.target;

    const outNode = target.closest('.node-out');
    if (outNode) {
        Wires.beginWireDrag(event, outNode);
        return;
    }

    const controlEl = target.closest('.control');
    if (controlEl) {
        if (target.closest('.node')) return; // input nodes are wire targets, not handles
        if (target.closest('input, textarea, button, .switch-body')) return; // let the control's own UI work
        if (Toolbar.getActiveTool() === 'pan') return;
        Canvas.beginControlDrag(event, controlEl);
        return;
    }

    if (Selection.isMultiSelectMode()) {
        Selection.beginRubberBand(event);
        return;
    }
    Toolbar.beginPan(event);
});

const start = () => {
    Toolbar.initViewport();
    Logic.evaluate();
    Tables.rebuild();
};

// Module scripts run before DOMContentLoaded, but stay safe if that ever changes.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
