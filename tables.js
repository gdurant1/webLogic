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
// buildGateTable() is generic — it just needs a caption, an input/output
// column-count, and a row generator. Built-in gates compute rows straight
// from GATE_FUNCS; a custom gate instance (customGates.js) already HAS its
// full truth table precomputed, so its rows are a lookup, not a computation.

const builtinRows = (type, inputCount) => {
    const fn = Logic.GATE_FUNCS[type];
    const rows = [];
    for (let i = 0; i < 2 ** inputCount; i++) {
        const ins = [];
        for (let bit = inputCount - 1; bit >= 0; bit--) ins.push(Math.floor(i / 2 ** bit) % 2);
        rows.push({ ins, outs: [fn(ins)] });
    }
    return rows;
};

const customGateRows = (definition) => {
    const rows = [];
    for (let i = 0; i < 2 ** definition.inputCount; i++) {
        const ins = [];
        for (let bit = definition.inputCount - 1; bit >= 0; bit--) ins.push(Math.floor(i / 2 ** bit) % 2);
        rows.push({ ins, outs: definition.truthTable.get(ins.join(',')) || [] });
    }
    return rows;
};

const buildTable = (caption, inputCount, outputLabels, rows) => {
    const table = document.createElement('table');
    const captionEl = document.createElement('caption');
    captionEl.textContent = caption;
    table.appendChild(captionEl);

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (let i = 0; i < inputCount; i++) {
        const th = document.createElement('th');
        th.textContent = `In${i + 1}`;
        headRow.appendChild(th);
    }
    outputLabels.forEach((label) => {
        const th = document.createElement('th');
        th.textContent = label;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
        const tr = document.createElement('tr');
        [...row.ins, ...row.outs].forEach((value) => {
            const td = document.createElement('td');
            td.textContent = cell(value);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
};

/** A standalone (not wired into a bigger circuit) gate or custom-gate instance. */
const buildGateTable = (control) => {
    if (control.type.startsWith('custom:')) {
        const definition = Logic.getCustomGateDefinition(control.type.slice('custom:'.length));
        if (!definition) return document.createTextNode('');
        const outputLabels = definition.outputCount <= 1 ? ['Out'] : Array.from({ length: definition.outputCount }, (_, i) => `Out${i + 1}`);
        return buildTable(definition.name, definition.inputCount, outputLabels, customGateRows(definition));
    }
    return buildTable(control.type.toUpperCase(), control.inputCount, ['Out'], builtinRows(control.type, control.inputCount));
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

    const gates = components.filter((control) => Logic.GATE_FUNCS[control.type] || isCustomGateControl(control));
    for (let pass = 0; pass < gates.length + 2; pass++) {
        let changed = false;
        gates.forEach((gate) => {
            const ins = [];
            for (let i = 0; i < gate.inputCount; i++) {
                const wire = App.getWireInto(`${gate.id}-in-${i}`);
                ins.push(wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined);
            }
            if (isCustomGateControl(gate)) {
                const definition = Logic.getCustomGateDefinition(gate.type.slice('custom:'.length));
                const outs = definition ? (ins.some((v) => v === undefined) ? new Array(definition.outputCount).fill(undefined) : (definition.truthTable.get(ins.join(',')) || [])) : [];
                outs.forEach((out, i) => {
                    const key = `${gate.id}-out-${i}`;
                    if (!values.has(key) || values.get(key) !== out) { values.set(key, out); changed = true; }
                });
            } else {
                const key = `${gate.id}-out`;
                const out = Logic.GATE_FUNCS[gate.type](ins);
                if (!values.has(key) || values.get(key) !== out) {
                    values.set(key, out);
                    changed = true;
                }
            }
        });
        if (!changed) break;
    }
    return values;
};

const isCustomGateControl = (control) => typeof control.type === 'string' && control.type.startsWith('custom:');

/**
 * One descriptor per output COLUMN a component contributes to the master
 * table — plural for a custom gate with more than one output, singular (or
 * none) for everything else. A custom gate's output only shows a column
 * when that specific output is dangling (unconnected), same rule as a
 * built-in gate's single output.
 */
const outputDescriptorsFor = (control) => {
    if (control.type === 'light-bulb') return [{ control, label: 'Bulb' }];
    if (control.type === 'four-bit-digit') return [{ control, label: 'Digit', isDigit: true }];
    if (isCustomGateControl(control)) {
        const definition = Logic.getCustomGateDefinition(control.type.slice('custom:'.length));
        if (!definition) return [];
        const descriptors = [];
        for (let i = 0; i < definition.outputCount; i++) {
            if (App.getWiresFromNode(`${control.id}-out-${i}`).length === 0) {
                descriptors.push({ control, outIndex: i, label: definition.outputCount > 1 ? `${definition.name}.${i}` : definition.name });
            }
        }
        return descriptors;
    }
    if (Logic.GATE_FUNCS[control.type] && !hasOutgoingWire(control)) return [{ control, label: control.type.toUpperCase() }];
    return [];
};

const descriptorValue = (d, values) => {
    if (d.isDigit) {
        let digit = 0;
        for (let bit = 0; bit < 4; bit++) {
            const wire = App.getWireInto(`${d.control.id}-in-${bit}`);
            if (wire && values.get(wire.fromNodeId) === 1) digit += 2 ** (3 - bit);
        }
        return digit;
    }
    if (d.control.type === 'light-bulb') {
        const wire = App.getWireInto(`${d.control.id}-in-0`);
        return wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined;
    }
    if (d.outIndex !== undefined) return values.get(`${d.control.id}-out-${d.outIndex}`);
    return values.get(`${d.control.id}-out`);
};

const buildCircuitTable = (components) => {
    const switches = components.filter((control) => control.type === 'toggle-switch');
    const sinks = components.flatMap(outputDescriptorsFor);

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
        th.textContent = sink.label;
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
            td.textContent = cell(descriptorValue(sink, values));
            tr.appendChild(td);
        });

        tr.addEventListener('click', () => {
            // No real <input type="checkbox"> any more (see shapes.js) — a
            // toggle switch's on/off state is the `.checked` class on its
            // cell root, same place logic.js's getSourceValue() reads it.
            switches.forEach((control) => {
                control.el.classList.toggle('checked', assignment.get(control.id) === 1);
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
        if ((App.GATE_TYPES.has(control.type) || isCustomGateControl(control)) && !groupedIds.has(control.id)) {
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
            .filter((control) => App.GATE_TYPES.has(control.type) || isCustomGateControl(control))
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
