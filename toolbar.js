/**
 * toolbar.js — Toolbar Controls & Zoom
 * ---------------------------------------------------------------------------
 * Per javascript.md §8:
 *   - Binds #btn-save, #btn-print, #btn-undo, #btn-redo, #btn-grid, #btn-pan.
 *   - #btn-clear-all triggers #clear-all-confirm via popups.js.
 *   - #zoom-slider / #btn-zoom-in / #btn-zoom-out (50%-200%, 10% steps, per
 *     the min/max/step already set on the element in index.html) apply a
 *     CSS scale() transform to #canvas — wires.js reads that same transform
 *     back out via getComputedStyle to keep wires aligned at any zoom level.
 *   - Play/Stop/step-forward/step-back are also bound here since they live
 *     in #canvas-controls / #toolbar, delegating the actual simulation work
 *     to logic.js.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('canvas');
    canvas.style.transformOrigin = '0 0';

    // ---------------- Zoom ----------------
    const slider = document.getElementById('zoom-slider');

    function applyZoom(pct) {
        canvas.style.transform = 'scale(' + (pct / 100) + ')';
        if (window.WiresModule) window.WiresModule.updateAllWirePaths();
    }

    slider.addEventListener('input', () => applyZoom(parseInt(slider.value, 10)));
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        slider.value = String(Math.min(200, parseInt(slider.value, 10) + 10));
        applyZoom(parseInt(slider.value, 10));
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        slider.value = String(Math.max(50, parseInt(slider.value, 10) - 10));
        applyZoom(parseInt(slider.value, 10));
    });

    // ---------------- Save / Print ----------------
    document.getElementById('btn-save').addEventListener('click', () => {
        const data = {
            controls: App.allControls().map(c => ({
                id: c.id, type: c.type, x: c.x, y: c.y, inputCount: c.inputCount, note: c.note || null,
            })),
            wires: App.allWires().map(w => ({ from: w.fromNodeId, to: w.toNodeId })),
        };
        try {
            localStorage.setItem('logic-sim-save', JSON.stringify(data));
        } catch (err) {
            console.warn('Save failed (localStorage unavailable):', err);
        }
    });
    document.getElementById('btn-print').addEventListener('click', () => window.print());

    // ---------------- Undo / Redo ----------------
    // A full history stack isn't implemented in this pass — app.js has no
    // command log to replay, so these are stubbed rather than silently
    // doing something misleading.
    document.getElementById('btn-undo').addEventListener('click', () => {
        console.info('Undo: history stack not implemented in this pass.');
    });
    document.getElementById('btn-redo').addEventListener('click', () => {
        console.info('Redo: history stack not implemented in this pass.');
    });

    // ---------------- Select / Pan tool ----------------
    let activeTool = 'select';
    const btnSelect = document.getElementById('btn-select');
    const btnPan = document.getElementById('btn-pan');

    function setTool(tool) {
        activeTool = tool;
        btnSelect.classList.toggle('selected', tool === 'select');
        btnPan.classList.toggle('selected', tool === 'pan');
        canvas.style.cursor = tool === 'pan' ? 'grab' : '';
    }
    btnSelect.addEventListener('click', () => setTool('select'));
    btnPan.addEventListener('click', () => setTool('pan'));

    canvas.addEventListener('mousedown', (e) => {
        if (activeTool !== 'pan') return;
        if (e.target.closest('.control') || e.target.closest('.node')) return;

        const start = { x: e.clientX, y: e.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
        canvas.style.cursor = 'grabbing';

        function onMove(ev) {
            canvas.scrollLeft = start.left - (ev.clientX - start.x);
            canvas.scrollTop = start.top - (ev.clientY - start.y);
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            canvas.style.cursor = 'grab';
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // ---------------- Grid toggle ----------------
    const btnGrid = document.getElementById('btn-grid');
    let gridOn = true;
    btnGrid.addEventListener('click', () => {
        gridOn = !gridOn;
        canvas.style.backgroundImage = gridOn ? '' : 'none';
        btnGrid.classList.toggle('selected', !gridOn);
    });

    // ---------------- Clear All ----------------
    document.getElementById('btn-clear-all').addEventListener('click', () => {
        if (window.PopupsModule) window.PopupsModule.openClearAllConfirm();
    });

    // ---------------- Play / Stop / Step ----------------
    document.getElementById('btn-play').addEventListener('click', () => window.LogicModule.play());
    document.getElementById('btn-stop').addEventListener('click', () => window.LogicModule.stop());
    document.getElementById('btn-step-forward').addEventListener('click', () => window.LogicModule.stepForward());
    document.getElementById('btn-step-back').addEventListener('click', () => window.LogicModule.stepBack());

    // ---------------- Help ----------------
    document.getElementById('btn-help').addEventListener('click', () => {
        alert('Drag controls and gates from the left panel onto the canvas, wire them together from output to input nodes, and use the toolbar to select, edit, and simulate your circuit.');
    });

    window.ToolbarModule = { applyZoom, getActiveTool: () => activeTool };
})();
