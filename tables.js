/**
 * tables.js — Truth Table Generator
 * ---------------------------------------------------------------------------
 * Per javascript.md §6:
 *   - Every logic gate not wired into a bigger circuit gets its own reference
 *     truth table in #truth-tables-list (built from GATE_FUNCS — the gate's
 *     abstract behavior, independent of what is wired to it).
 *   - Gates wired together are grouped (App.getComponents) under one cloned
 *     #logic-circuit-template: a master table of every combination of the
 *     group's toggle-switch inputs against its outputs (light bulbs, 4-bit
 *     digits, and any gate output that feeds nothing), plus each member
 *     gate's own table nested inside.
 *   - Clicking a master-table row sets the real canvas switches to that
 *     row's combination and re-evaluates.
 *
 * Input cap (limits.js): a master table has 2^n rows for n switches. Up to
 * TABLE_INPUT_LIMIT it is built automatically. Above that a message replaces
 * it, with a "Show anyway" button (per circuit, behind a warning dialog);
 * above TABLE_INPUT_HARD_LIMIT it is never built.
 *
 * Rebuilds are coalesced (one per burst of events) and timed for the speed
 * guard in limits.js.
 */
import * as App from './app.js';
import * as Logic from './logic.js';
import * as Limits from './limits.js';

const listEl = document.getElementById('truth-tables-list');
const circuitTemplate = document.getElementById('logic-circuit-template');
const EMPTY_CELL = '\u2014';

const cell = (value) => (value === undefined ? EMPTY_CELL : String(value));

// ---------------- Individual gate tables ----------------

const truthTableRows = (type, inputCount) => {
    const fn = Logic.GATE_FUNCS[type];
    const rows = [];
    for (let i = 0; i < 2 ** inputCount; i++) {
        const ins = [];
        for (let bit = inputCount - 1; bit >= 0; bit--) ins.push(Math.floor(i / 2 ** bit) % 2);
        rows.push({ ins, out: fn(ins) });
    }
    return rows;
};

const buildGateTable = (control) => {
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = control.type.toUpperCase();
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (let i = 0; i < control.inputCount; i++) {
        const th = document.createElement('th');
        th.textContent = `In${i + 1}`;
        headRow.appendChild(th);
    }
    const outTh = document.createElement('th');
    outTh.textContent = 'Out';
    headRow.appendChild(outTh);
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    truthTableRows(control.type, control.inputCount).forEach((row) => {
        const tr = document.createElement('tr');
        [...row.ins, row.out].forEach((value) => {
            const td = document.createElement('td');
            td.textContent = cell(value);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
};

// ---------------- Circuit tables ----------------

const hasOutgoingWire = (control) => App.getWiresFromNode(`${control.id}-out`).length > 0;

/**
 * Pure (non-mutating) evaluation of one connected group for a hypothetical
 * assignment of its toggle switches, so the master table can be filled in
 * without disturbing the real canvas state.
 */
const evaluateComponent = (components, switchValues) => {
    const values = new Map();
    components.forEach((control) => {
        const key = `${control.id}-out`;
        if (control.type === 'toggle-switch') values.set(key, switchValues.get(control.id));
        else if (control.type === 'high-constant') values.set(key, 1);
        else if (control.type === 'low-constant') values.set(key, 0);
        else if (control.type === 'push-button') values.set(key, 0); // clocks stay unknown (undefined), as before
    });

    const gates = components.filter((control) => Logic.GATE_FUNCS[control.type]);
    for (let pass = 0; pass < gates.length + 2; pass++) {
        let changed = false;
        gates.forEach((gate) => {
            const ins = [];
            for (let i = 0; i < gate.inputCount; i++) {
                const wire = App.getWireInto(`${gate.id}-in-${i}`);
                ins.push(wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined);
            }
            const key = `${gate.id}-out`;
            const out = Logic.GATE_FUNCS[gate.type](ins);
            if (!values.has(key) || values.get(key) !== out) {
                values.set(key, out);
                changed = true;
            }
        });
        if (!changed) break;
    }
    return values;
};

const sinkValue = (sink, values) => {
    if (sink.type === 'four-bit-digit') {
        let digit = 0;
        for (let bit = 0; bit < 4; bit++) {
            const wire = App.getWireInto(`${sink.id}-in-${bit}`);
            if (wire && values.get(wire.fromNodeId) === 1) digit += 2 ** (3 - bit);
        }
        return digit;
    }
    if (sink.type === 'light-bulb') {
        const wire = App.getWireInto(`${sink.id}-in-0`);
        return wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined;
    }
    return values.get(`${sink.id}-out`);
};

const sinkLabel = (sink) => {
    if (sink.type === 'light-bulb') return 'Bulb';
    if (sink.type === 'four-bit-digit') return 'Digit';
    return sink.type.toUpperCase();
};

const buildCircuitTable = (components) => {
    const switches = components.filter((control) => control.type === 'toggle-switch');
    const sinks = components.filter((control) =>
        control.type === 'light-bulb' || control.type === 'four-bit-digit' ||
        (Logic.GATE_FUNCS[control.type] && !hasOutgoingWire(control)));

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    switches.forEach((_, i) => {
        const th = document.createElement('th');
        th.textContent = `S${i + 1}`;
        headRow.appendChild(th);
    });
    sinks.forEach((sink) => {
        const th = document.createElement('th');
        th.textContent = sinkLabel(sink);
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const total = Math.max(1, 2 ** switches.length);
    for (let i = 0; i < total; i++) {
        const assignment = new Map();
        switches.forEach((control, bit) => assignment.set(control.id, Math.floor(i / 2 ** bit) % 2));
        const values = evaluateComponent(components, assignment);

        const tr = document.createElement('tr');
        switches.forEach((control) => {
            const td = document.createElement('td');
            td.textContent = String(assignment.get(control.id));
            tr.appendChild(td);
        });
        sinks.forEach((sink) => {
            const td = document.createElement('td');
            td.textContent = cell(sinkValue(sink, values));
            tr.appendChild(td);
        });

        tr.addEventListener('click', () => {
            switches.forEach((control) => {
                const checkbox = control.el.querySelector('.switch-input');
                if (checkbox) checkbox.checked = assignment.get(control.id) === 1;
            });
            Logic.evaluate();
        });
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
};

/** Message shown in place of a master table that is over the input cap. */
const buildCapMessage = (inputCount, controlIds) => {
    const box = document.createElement('div');
    box.className = 'table-cap-message';

    const text = document.createElement('p');
    if (inputCount > Limits.TABLE_INPUT_HARD_LIMIT) {
        text.textContent =
            `Truth table hidden: ${inputCount} inputs would need ${(2 ** inputCount).toLocaleString()} rows, ` +
            `more than the ${Limits.TABLE_INPUT_HARD_LIMIT}-input maximum. Split the circuit to see its table.`;
        box.appendChild(text);
        return box;
    }

    text.textContent =
        `Truth table hidden: ${inputCount} inputs need ${(2 ** inputCount).toLocaleString()} rows ` +
        `(limit ${Limits.TABLE_INPUT_LIMIT} inputs).`;
    box.appendChild(text);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Show anyway';
    button.addEventListener('click', async () => {
        const approved = await Limits.requestTableApproval(inputCount, controlIds);
        if (approved) rebuild();
    });
    box.appendChild(button);
    return box;
};

// ---------------- Rebuild the whole panel ----------------

export const rebuild = () => {
    const started = performance.now();
    listEl.innerHTML = '';

    const components = App.getComponents();
    const groupedIds = new Set();
    components.forEach((group) => group.forEach((control) => groupedIds.add(control.id)));

    App.allControls().forEach((control) => {
        if (App.GATE_TYPES.has(control.type) && !groupedIds.has(control.id)) {
            listEl.appendChild(buildGateTable(control));
        }
    });

    components.forEach((group) => {
        const fragment = circuitTemplate.content.cloneNode(true);
        const details = fragment.querySelector('.logic-circuit');
        const body = fragment.querySelector('.logic-circuit-body');
        details.open = true;

        const controlIds = group.map((control) => control.id);
        const inputCount = group.filter((control) => control.type === 'toggle-switch').length;
        const overCap = inputCount > Limits.TABLE_INPUT_LIMIT;
        const allowed = inputCount <= Limits.TABLE_INPUT_HARD_LIMIT && (!overCap || Limits.isTableApproved(controlIds));

        body.appendChild(allowed ? buildCircuitTable(group) : buildCapMessage(inputCount, controlIds));
        group
            .filter((control) => App.GATE_TYPES.has(control.type))
            .forEach((control) => body.appendChild(buildGateTable(control)));
        listEl.appendChild(fragment);
    });

    Limits.recordRebuild(performance.now() - started);
};

/** Coalesce bursts of events (e.g. Clear All) into one rebuild. */
let rebuildPending = false;
export const scheduleRebuild = () => {
    if (rebuildPending) return;
    rebuildPending = true;
    queueMicrotask(() => {
        rebuildPending = false;
        rebuild();
    });
};

['control:add', 'control:remove', 'control:inputcount', 'wire:add', 'wire:remove'].forEach((name) => {
    App.events.addEventListener(name, scheduleRebuild);
});
