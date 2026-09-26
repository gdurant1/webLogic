/**
 * wires.js — Wire Management
 * ---------------------------------------------------------------------------
 * Per javascript.md §3 / htmlPromptForCSS.md §4b2:
 *   - A wire drag starts on mousedown over a .node-out (output nodes accept
 *     unlimited outgoing wires).
 *   - Input nodes accept at most one wire; drops on an occupied input node
 *     are rejected without touching the existing connection (and the
 *     rejected node gets a brief red .reject-flash).
 *   - While the drag is in progress, every not-yet-occupied .node-in gets
 *     a .drop-target highlight (see style.css); it's cleared the moment
 *     the drag ends, whether or not the drop succeeded.
 *   - On a valid drop: remove .pending from the wire, remove .unattached
 *     from the input node.
 *   - Each wire is drawn as a pair of stacked <path>s (a dark outline plus
 *     the actual colored wire on top) into the #wire-layer SVG that sits
 *     over #canvas in index.html.
 *
 * Also owns the eraser tool (#btn-eraser in #canvas-controls), since
 * erasing a wire or control both end in the same "detach + clean up
 * .unattached" bookkeeping this module already needs for normal deletion.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('canvas');
    const svg = document.getElementById('wire-layer');

    // ---------------- Coordinate helpers (zoom + scroll aware) ----------------
    function getScale() {
        const t = getComputedStyle(canvas).transform;
        if (!t || t === 'none') return 1;
        const match = t.match(/matrix\(([^,]+),/);
        return match ? (parseFloat(match[1]) || 1) : 1;
    }

    function nodeCenter(nodeEl) {
        const nodeRect = nodeEl.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const scale = getScale();
        return {
            x: (nodeRect.left + nodeRect.width / 2 - canvasRect.left) / scale + canvas.scrollLeft,
            y: (nodeRect.top + nodeRect.height / 2 - canvasRect.top) / scale + canvas.scrollTop,
        };
    }

    function pathD(p1, p2) {
        const dx = Math.max(40, Math.abs(p2.x - p1.x) / 2);
        return 'M ' + p1.x + ' ' + p1.y +
            ' C ' + (p1.x + dx) + ' ' + p1.y + ', ' + (p2.x - dx) + ' ' + p2.y + ', ' + p2.x + ' ' + p2.y;
    }

    // ---------------- Creating a permanent wire ----------------
    function createWire(fromNodeId, toNodeId) {
        const wireId = App.genWireId();
        // Two stacked paths: a thicker dark outline underneath (keeps the
        // wire visible against the canvas even when its signal color is
        // white/low) and the actual colored wire on top — see the
        // reference screenshot and style.css's "Wires" section.
        const outlineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        outlineEl.setAttribute('class', 'wire-outline');
        svg.appendChild(outlineEl);

        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('class', 'wire');
        svg.appendChild(pathEl);

        pathEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = 'w:' + wireId;
            if (e.ctrlKey || e.metaKey) {
                if (App.isSelected(key)) App.removeFromSelection(key);
                else App.addToSelection(key);
            } else {
                App.setSelection([key]);
            }
        });

        const wire = { id: wireId, fromNodeId, toNodeId, pathEl, outlineEl, signal: undefined };
        App.addWire(wire);
        updateWirePath(wire);

        const toInfo = App.getNode(toNodeId);
        if (toInfo) toInfo.el.classList.remove('unattached');
        return wire;
    }

    function updateWirePath(wire) {
        const from = App.getNode(wire.fromNodeId);
        const to = App.getNode(wire.toNodeId);
        if (!from || !to) return;
        const d = pathD(nodeCenter(from.el), nodeCenter(to.el));
        wire.pathEl.setAttribute('d', d);
        if (wire.outlineEl) wire.outlineEl.setAttribute('d', d);
    }

    function updateAllWirePaths() {
        App.allWires().forEach(updateWirePath);
    }

    // Keep wires glued to their nodes across moves, zoom, pan/scroll, resize.
    App.events.addEventListener('control:move', updateAllWirePaths);
    App.events.addEventListener('control:placed', updateAllWirePaths);
    App.events.addEventListener('control:inputcount', updateAllWirePaths);
    canvas.addEventListener('scroll', updateAllWirePaths);
    window.addEventListener('resize', updateAllWirePaths);

    App.events.addEventListener('wire:remove', (e) => {
        const wire = e.detail;
        wire.pathEl.remove();
        if (wire.outlineEl) wire.outlineEl.remove();
        const to = App.getNode(wire.toNodeId);
        // An input node with no wire left on it goes back to its idle,
        // "needs a connection" look.
        if (to && App.getWiresForNode(wire.toNodeId).length === 0) {
            to.el.classList.add('unattached');
        }
    });

    // ---------------- Dragging a new wire out of an output node ----------------
    let eraserActive = false;

    // While a wire is being dragged out, every input node that doesn't
    // already have a wire attached gets a live "drop here" highlight —
    // and only for the duration of that one drag.
    function markDropTargets(on) {
        document.querySelectorAll('.node-in').forEach(n => {
            const nodeId = n.dataset.nodeId;
            if (on && nodeId && !App.isNodeOccupied(nodeId)) {
                n.classList.add('drop-target');
            } else {
                n.classList.remove('drop-target');
            }
        });
    }

    function flashReject(nodeEl) {
        if (!nodeEl) return;
        nodeEl.classList.add('reject-flash');
        setTimeout(() => nodeEl.classList.remove('reject-flash'), 300);
    }

    canvas.addEventListener('mousedown', (e) => {
        if (eraserActive) return;
        const node = e.target.closest('.node-out');
        if (!node) return;
        e.stopPropagation();
        const fromNodeId = node.dataset.nodeId;
        if (!fromNodeId) return;

        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('class', 'wire pending');
        svg.appendChild(pathEl);
        markDropTargets(true);

        function onMove(ev) {
            const rect = canvas.getBoundingClientRect();
            const scale = getScale();
            const p1 = nodeCenter(node);
            const p2 = {
                x: (ev.clientX - rect.left) / scale + canvas.scrollLeft,
                y: (ev.clientY - rect.top) / scale + canvas.scrollTop,
            };
            pathEl.setAttribute('d', pathD(p1, p2));
        }

        function onUp(ev) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const target = document.elementFromPoint(ev.clientX, ev.clientY);
            const targetNode = target && target.closest ? target.closest('.node-in') : null;
            pathEl.remove();
            markDropTargets(false);
            if (targetNode) {
                const toNodeId = targetNode.dataset.nodeId;
                if (toNodeId && toNodeId !== fromNodeId && !App.isNodeOccupied(toNodeId)) {
                    createWire(fromNodeId, toNodeId);
                } else if (toNodeId) {
                    flashReject(targetNode); // e.g. that input already has a wire
                }
            }
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // ---------------- Eraser tool ----------------
    const eraserBtn = document.getElementById('btn-eraser');
    if (eraserBtn) {
        eraserBtn.addEventListener('click', () => {
            eraserActive = !eraserActive;
            eraserBtn.classList.toggle('selected', eraserActive);
        });
    }

    canvas.addEventListener('click', (e) => {
        if (!eraserActive) return;
        const wireEl = e.target.closest('.wire');
        if (wireEl) {
            const wire = App.allWires().find(w => w.pathEl === wireEl);
            if (wire) App.removeWire(wire.id);
            return;
        }
        const controlEl = e.target.closest('.control');
        if (controlEl) App.removeControl(controlEl.dataset.id);
    });

    window.WiresModule = {
        createWire, updateAllWirePaths, getScale, nodeCenter,
        isEraserActive: () => eraserActive,
    };
})();
