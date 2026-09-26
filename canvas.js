/**
 * canvas.js — Palette & Canvas Interaction
 * ---------------------------------------------------------------------------
 * Per javascript.md §2:
 *   - Palette drag-and-drop: reads data-type, clones the matching <template>
 *     (#tpl-<type>, or the shared #tpl-logic-gate for the 9 gate types) onto
 *     #canvas, and — for logic gates — reads data-min-inputs/data-default-
 *     inputs off the source .palette-item to build the right number of
 *     .node.node-in.unattached rows (htmlPromptForCSS.md §3, §4b1).
 *   - Control positioning: dragging a placed .control (or a selected group
 *     of them) around #canvas, updating x/y in app.js.
 *
 * Also owns cleanup of a control's DOM element + node registrations when
 * app.js reports it removed, since app.js only manages state, not the DOM.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('canvas');
    const paletteItems = document.querySelectorAll('.palette-item');

    const GATE_TYPES = new Set(['buffer', 'not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor', 'tri-state']);

    // ---------------- Palette drag source ----------------
    paletteItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.dataset.type);
            e.dataTransfer.effectAllowed = 'copy';
        });
    });

    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/plain');
        if (!type) return;
        const rect = canvas.getBoundingClientRect();
        const scale = window.WiresModule ? window.WiresModule.getScale() : 1;
        // Land the control's top-left corner roughly under the cursor.
        const left = (e.clientX - rect.left) / scale + canvas.scrollLeft - 30;
        const top = (e.clientY - rect.top) / scale + canvas.scrollTop - 20;
        placeControl(type, left, top);
    });

    /**
     * Clone the right <template> onto the canvas, register its nodes, and
     * add it to the shared data model. (left, top) is the control's
     * top-left corner, in unscaled canvas-local coordinates.
     */
    function placeControl(type, left, top, defaultInputs) {
        const isGate = GATE_TYPES.has(type);
        const tplId = isGate ? 'tpl-logic-gate' : 'tpl-' + type;
        const tpl = document.getElementById(tplId);
        if (!tpl) return null;

        const frag = tpl.content.cloneNode(true);
        const el = frag.querySelector('.control');
        const controlId = App.genControlId();
        el.dataset.id = controlId;
        el.style.position = 'absolute';
        el.style.left = Math.max(0, Math.round(left)) + 'px';
        el.style.top = Math.max(0, Math.round(top)) + 'px';

        let inputCount = 0;

        if (isGate) {
            el.dataset.type = type;
            const paletteSource = document.querySelector('.palette-item[data-type="' + type + '"]');
            const min = paletteSource ? parseInt(paletteSource.dataset.minInputs, 10) : 1;
            const dflt = defaultInputs || (paletteSource ? parseInt(paletteSource.dataset.defaultInputs, 10) : 2);
            inputCount = Math.max(min, dflt);
            const inputsWrap = el.querySelector('.gate-inputs');
            for (let i = 0; i < inputCount; i++) {
                addGateInputNode(inputsWrap, controlId, i);
            }
            registerOutNode(el, controlId);
        } else if (type === 'four-bit-digit') {
            el.querySelectorAll('.node-in').forEach((node, i) => {
                const nodeId = controlId + '-in-' + i;
                node.dataset.nodeId = nodeId;
                App.registerNode(nodeId, { el: node, controlId, kind: 'in', index: i });
            });
            inputCount = 4;
        } else if (type === 'light-bulb') {
            const node = el.querySelector('.node-in');
            const nodeId = controlId + '-in-0';
            node.dataset.nodeId = nodeId;
            App.registerNode(nodeId, { el: node, controlId, kind: 'in', index: 0 });
            inputCount = 1;
        } else {
            // toggle-switch, push-button, clock, high-constant, low-constant —
            // source controls with only a single .node-out.
            registerOutNode(el, controlId);
        }

        canvas.appendChild(el);

        const control = {
            id: controlId,
            type,
            el,
            x: parseFloat(el.style.left),
            y: parseFloat(el.style.top),
            inputCount,
        };
        App.addControl(control);
        // Fired in addition to control:add so logic.js can wire up
        // interactive behavior (switch/button/clock listeners) once the
        // element actually exists in the DOM.
        App.emit('control:placed', control);
        return control;
    }

    function registerOutNode(el, controlId) {
        const node = el.querySelector('.node-out');
        if (!node) return;
        const nodeId = controlId + '-out';
        node.dataset.nodeId = nodeId;
        App.registerNode(nodeId, { el: node, controlId, kind: 'out', index: 0 });
    }

    /** Exposed publicly so popups.js can grow a gate's input count later. */
    function addGateInputNode(inputsWrap, controlId, index) {
        const node = document.createElement('span');
        node.className = 'node node-in unattached';
        const nodeId = controlId + '-in-' + index;
        node.dataset.nodeId = nodeId;
        inputsWrap.appendChild(node);
        App.registerNode(nodeId, { el: node, controlId, kind: 'in', index });
        return node;
    }

    // ---------------- DOM cleanup when app.js removes a control ----------------
    App.events.addEventListener('control:remove', (e) => {
        const control = e.detail;
        control.el.querySelectorAll('[data-node-id]').forEach(n => App.unregisterNode(n.dataset.nodeId));
        control.el.remove();
    });

    // ---------------- Repositioning placed controls ----------------
    canvas.addEventListener('mousedown', (e) => {
        if (window.WiresModule && window.WiresModule.isEraserActive()) return;
        if (window.ToolbarModule && window.ToolbarModule.getActiveTool() === 'pan') return;

        const controlEl = e.target.closest('.control');
        if (!controlEl) return;
        if (e.target.closest('.node')) return; // node drags belong to wires.js
        if (e.target.closest('input, textarea, button, .switch-body')) return; // don't hijack interactive children

        const id = controlEl.dataset.id;
        const startX = e.clientX;
        const startY = e.clientY;
        const scale = window.WiresModule ? window.WiresModule.getScale() : 1;

        // Move the whole selection together if this control is part of one.
        let movingIds;
        const selectedControlIds = App.getSelection().filter(s => s.startsWith('c:')).map(s => s.slice(2));
        if (selectedControlIds.includes(id)) {
            movingIds = selectedControlIds;
        } else {
            movingIds = [id];
        }

        const startPositions = movingIds.map(cid => {
            const c = App.getControl(cid);
            return { id: cid, x: c.x, y: c.y };
        });
        let moved = false;

        function onMove(ev) {
            const dx = (ev.clientX - startX) / scale;
            const dy = (ev.clientY - startY) / scale;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
            startPositions.forEach(p => {
                const c = App.getControl(p.id);
                if (!c) return;
                const nx = Math.max(0, Math.round(p.x + dx));
                const ny = Math.max(0, Math.round(p.y + dy));
                c.el.style.left = nx + 'px';
                c.el.style.top = ny + 'px';
                c.x = nx;
                c.y = ny;
                App.emit('control:move', c);
            });
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    window.CanvasModule = { placeControl, addGateInputNode, GATE_TYPES };
})();
