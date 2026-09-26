/**
 * app.js — Shared Data Model
 * ---------------------------------------------------------------------------
 * Single source of truth for the whole simulator (per javascript.md §1).
 * Every other module reads/writes state through this API and reacts to
 * change notifications via App.events (a plain EventTarget) instead of
 * touching each other's internals directly.
 *
 * Data shapes:
 *   control: { id, type, el, x, y, inputCount, note?, groupId?, flipH?, flipV?,
 *              clockValue?, clockTimer? }
 *   wire:    { id, fromNodeId, toNodeId, pathEl, signal }
 *   node registry entry: { el, controlId, kind: 'in'|'out', index }
 *
 * Node IDs are deterministic strings: "<controlId>-out", "<controlId>-in-<i>".
 */
(function () {
    'use strict';

    let nextControlId = 1;
    let nextWireId = 1;

    const controls = new Map();  // controlId -> control
    const wires = new Map();     // wireId -> wire
    const nodeIndex = new Map(); // nodeId -> { el, controlId, kind, index }
    const selection = new Set(); // Set of "c:<id>" / "w:<id>" keys

    const events = new EventTarget();
    function emit(name, detail) {
        events.dispatchEvent(new CustomEvent(name, { detail }));
    }

    function genControlId() { return 'ctrl-' + (nextControlId++); }
    function genWireId() { return 'wire-' + (nextWireId++); }

    // ---------------- Controls ----------------
    function addControl(control) {
        controls.set(control.id, control);
        emit('control:add', control);
        return control;
    }

    function removeControl(id) {
        const control = controls.get(id);
        if (!control) return;
        // Remove any wires touching this control's nodes first so listeners
        // (wires.js) can clean up paths/unattached-state before the control
        // itself, and its nodes, disappear.
        getWiresForControl(id).forEach(w => removeWire(w.id));
        controls.delete(id);
        selection.delete('c:' + id);
        emit('control:remove', control);
    }

    function getControl(id) { return controls.get(id); }
    function allControls() { return Array.from(controls.values()); }

    function updateControlPosition(id, x, y) {
        const control = controls.get(id);
        if (!control) return;
        control.x = x;
        control.y = y;
        emit('control:move', control);
    }

    // ---------------- Node registry ----------------
    function registerNode(nodeId, info) { nodeIndex.set(nodeId, info); }
    function unregisterNode(nodeId) { nodeIndex.delete(nodeId); }
    function getNode(nodeId) { return nodeIndex.get(nodeId); }

    // ---------------- Wires ----------------
    function addWire(wire) {
        wires.set(wire.id, wire);
        emit('wire:add', wire);
        return wire;
    }

    function removeWire(id) {
        const wire = wires.get(id);
        if (!wire) return;
        wires.delete(id);
        selection.delete('w:' + id);
        emit('wire:remove', wire);
    }

    function getWire(id) { return wires.get(id); }
    function allWires() { return Array.from(wires.values()); }

    function getWiresForNode(nodeId) {
        return allWires().filter(w => w.fromNodeId === nodeId || w.toNodeId === nodeId);
    }

    function getWiresForControl(controlId) {
        return allWires().filter(w => {
            const from = nodeIndex.get(w.fromNodeId);
            const to = nodeIndex.get(w.toNodeId);
            return (from && from.controlId === controlId) || (to && to.controlId === controlId);
        });
    }

    function isNodeOccupied(nodeId) {
        return getWiresForNode(nodeId).length > 0;
    }

    // ---------------- Selection ----------------
    function setSelection(ids) {
        selection.clear();
        ids.forEach(id => selection.add(id));
        emit('selection:change', Array.from(selection));
    }
    function addToSelection(id) {
        selection.add(id);
        emit('selection:change', Array.from(selection));
    }
    function removeFromSelection(id) {
        selection.delete(id);
        emit('selection:change', Array.from(selection));
    }
    function clearSelection() {
        if (selection.size === 0) return;
        selection.clear();
        emit('selection:change', Array.from(selection));
    }
    function getSelection() { return Array.from(selection); }
    function isSelected(id) { return selection.has(id); }

    window.App = {
        events, emit,
        genControlId, genWireId,
        addControl, removeControl, getControl, allControls, updateControlPosition,
        registerNode, unregisterNode, getNode,
        addWire, removeWire, getWire, allWires, getWiresForNode, getWiresForControl, isNodeOccupied,
        setSelection, addToSelection, removeFromSelection, clearSelection, getSelection, isSelected,
    };
})();
