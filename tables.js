/**
 * tables.js — Truth Table Generator
 * ---------------------------------------------------------------------------
 * Per javascript.md §7:
 *   - Every logic gate placed on the canvas gets its own reference truth
 *     table in #truth-tables-list (built from GATE_FUNCS — this table is
 *     the gate's abstract behavior, independent of what's actually wired to
 *     it).
 *   - Gates that are wired together into a multi-part circuit are grouped
 *     (via a union-find over the wire graph) under one cloned
 *     #logic-circuit-template: a master table showing every combination of
 *     the group's toggle-switch inputs against its sink outputs (light
 *     bulbs / 4-bit digits / any dangling gate output), plus each member
 *     gate's own table nested inside.
 *   - Clicking a master-table row jumps the real canvas switches to that
 *     row's combination and re-evaluates (per javascript.md's "bind click
 *     handlers ... to manually jump simulation playback").
 */
(function () {
    'use strict';

    const listEl = document.getElementById('truth-tables-list');
    const circuitTpl = document.getElementById('logic-circuit-template');
    const GATE_TYPES = ['buffer', 'not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor', 'tri-state'];

    // ---------------- Individual gate tables ----------------
    function truthTableRows(type, inputCount) {
        const fn = window.LogicModule.GATE_FUNCS[type];
        const rows = [];
        const total = Math.pow(2, inputCount);
        for (let i = 0; i < total; i++) {
            const ins = [];
            for (let b = inputCount - 1; b >= 0; b--) ins.push((i >> b) & 1);
            rows.push({ ins, out: fn(ins) });
        }
        return rows;
    }

    function buildGateTable(control) {
        const table = document.createElement('table');
        const caption = document.createElement('caption');
        caption.textContent = control.type.toUpperCase();
        table.appendChild(caption);

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        for (let i = 0; i < control.inputCount; i++) {
            const th = document.createElement('th');
            th.textContent = 'In' + (i + 1);
            headRow.appendChild(th);
        }
        const outTh = document.createElement('th');
        outTh.textContent = 'Out';
        headRow.appendChild(outTh);
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        truthTableRows(control.type, control.inputCount).forEach(row => {
            const tr = document.createElement('tr');
            row.ins.forEach(v => {
                const td = document.createElement('td');
                td.textContent = String(v);
                tr.appendChild(td);
            });
            const outTd = document.createElement('td');
            outTd.textContent = row.out === undefined ? '\u2014' : String(row.out);
            tr.appendChild(outTd);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        return table;
    }

    // ---------------- Connected-circuit grouping (union-find over wires) ----------------
    function findComponents() {
        const controls = App.allControls();
        const parent = new Map();
        controls.forEach(c => parent.set(c.id, c.id));
        function find(x) { while (parent.get(x) !== x) x = parent.get(x); return x; }
        function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }

        App.allWires().forEach(w => {
            const from = App.getNode(w.fromNodeId);
            const to = App.getNode(w.toNodeId);
            if (from && to) union(from.controlId, to.controlId);
        });

        const groups = new Map();
        controls.forEach(c => {
            const root = find(c.id);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(c);
        });
        return Array.from(groups.values()).filter(g => g.length > 1);
    }

    function hasOutgoingWire(control) {
        return App.allWires().some(w => w.fromNodeId === control.id + '-out');
    }

    /** Pure (non-mutating) evaluation of one connected group for a
     * hypothetical assignment of its toggle switches — used to fill in the
     * master table without disturbing the actual canvas state. */
    function evaluateComponent(components, switchValues) {
        const values = new Map();
        components.forEach(c => {
            if (c.type === 'toggle-switch') values.set(c.id + '-out', switchValues.get(c.id));
            else if (c.type === 'high-constant') values.set(c.id + '-out', 1);
            else if (c.type === 'low-constant') values.set(c.id + '-out', 0);
            else if (c.type === 'push-button') values.set(c.id + '-out', 0);
        });
        for (let pass = 0; pass < components.length + 2; pass++) {
            components.forEach(c => {
                const fn = window.LogicModule.GATE_FUNCS[c.type];
                if (!fn) return;
                const ins = [];
                for (let i = 0; i < c.inputCount; i++) {
                    const nodeId = c.id + '-in-' + i;
                    const wire = App.allWires().find(w => w.toNodeId === nodeId);
                    ins.push(wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined);
                }
                values.set(c.id + '-out', fn(ins));
            });
        }
        return values;
    }

    function buildCircuitTable(components) {
        const switches = components.filter(c => c.type === 'toggle-switch');
        const sinks = components.filter(c =>
            c.type === 'light-bulb' || c.type === 'four-bit-digit' ||
            (window.LogicModule.GATE_FUNCS[c.type] && !hasOutgoingWire(c))
        );

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        switches.forEach((s, i) => {
            const th = document.createElement('th');
            th.textContent = 'S' + (i + 1);
            headRow.appendChild(th);
        });
        sinks.forEach(s => {
            const th = document.createElement('th');
            th.textContent = s.type === 'light-bulb' ? 'Bulb' : (s.type === 'four-bit-digit' ? 'Digit' : s.type.toUpperCase());
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const total = Math.max(1, Math.pow(2, switches.length));
        for (let i = 0; i < total; i++) {
            const assignment = new Map();
            switches.forEach((s, b) => assignment.set(s.id, (i >> b) & 1));
            const values = evaluateComponent(components, assignment);

            const tr = document.createElement('tr');
            switches.forEach(s => {
                const td = document.createElement('td');
                td.textContent = String(assignment.get(s.id));
                tr.appendChild(td);
            });
            sinks.forEach(s => {
                const td = document.createElement('td');
                if (s.type === 'four-bit-digit') {
                    let n = 0;
                    for (let b = 0; b < 4; b++) {
                        const wire = App.allWires().find(w => w.toNodeId === s.id + '-in-' + b);
                        const v = wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : 0;
                        if (v === 1) n |= (1 << (3 - b));
                    }
                    td.textContent = String(n);
                } else if (s.type === 'light-bulb') {
                    const wire = App.allWires().find(w => w.toNodeId === s.id + '-in-0');
                    const v = wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined;
                    td.textContent = v === undefined ? '\u2014' : String(v);
                } else {
                    const v = values.get(s.id + '-out');
                    td.textContent = v === undefined ? '\u2014' : String(v);
                }
                tr.appendChild(td);
            });

            tr.addEventListener('click', () => {
                switches.forEach(s => {
                    const cb = s.el.querySelector('.switch-input');
                    if (cb) cb.checked = !!assignment.get(s.id);
                });
                window.LogicModule.evaluate();
            });

            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        return table;
    }

    // ---------------- Rebuild the whole panel ----------------
    function rebuild() {
        listEl.innerHTML = '';
        const components = findComponents();
        const groupedIds = new Set();
        components.forEach(g => g.forEach(c => groupedIds.add(c.id)));

        App.allControls().forEach(c => {
            if (GATE_TYPES.includes(c.type) && !groupedIds.has(c.id)) {
                listEl.appendChild(buildGateTable(c));
            }
        });

        components.forEach(group => {
            const frag = circuitTpl.content.cloneNode(true);
            const details = frag.querySelector('.logic-circuit');
            const body = frag.querySelector('.logic-circuit-body');
            details.open = true;
            body.appendChild(buildCircuitTable(group));
            group.filter(c => GATE_TYPES.includes(c.type)).forEach(c => body.appendChild(buildGateTable(c)));
            listEl.appendChild(frag);
        });
    }

    App.events.addEventListener('control:add', rebuild);
    App.events.addEventListener('control:remove', rebuild);
    App.events.addEventListener('control:inputcount', rebuild);
    App.events.addEventListener('wire:add', rebuild);
    App.events.addEventListener('wire:remove', rebuild);

    window.TablesModule = { rebuild };
})();
