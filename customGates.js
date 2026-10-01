/**
 * customGates.js — "Create Gate" (Phase A)
 * ---------------------------------------------------------------------------
 * Lets the user wire up 3+ built-in gates, select them, and press "create
 * gate" to package that sub-circuit into one reusable, labeled box that
 * drops onto the canvas from its own palette section — exactly like a
 * built-in gate, but evaluated by looking up a precomputed truth table
 * instead of running GATE_FUNCS directly (see logic.js's isCustomGate path).
 *
 * Rules (all explicit decisions, not assumptions):
 *   - Only plain built-in gates may be selected — no sources/sinks, and NO
 *     nesting (an existing custom gate can't be a component of a new one).
 *   - Minimum 3 gates, and they must form one connected group among
 *     THEMSELVES (ignoring any wires to things outside the selection).
 *   - A selected gate's input becomes a boundary INPUT port if it's
 *     unconnected or fed from outside the selection; its output becomes a
 *     boundary OUTPUT port if it's unconnected or feeds anything outside the
 *     selection (even if it ALSO feeds something inside — both can be true).
 *     Every wire that crossed the selection boundary reattaches to the
 *     matching new port automatically, just by virtue of the port keeping
 *     the same node id the original pin had (see derivePorts()).
 *   - Ports are ordered top-to-bottom by the originating gate's canvas
 *     position, inputs and outputs independently.
 *   - Duplicate check: same input/output counts AND an identical truth table
 *     (every combination of inputs produces the same outputs) blocks
 *     creation with a named message — never silently created, never offered
 *     as a substitute.
 *   - Counts as ceil(selectedGateCount / 2) toward limits.js's 10-gate cap
 *     (stored as `gateWeight` on both the definition and every instance
 *     placed from it — see limits.js's countGates and canvas.js's
 *     placeControl).
 *   - Survives reload: definitions persist in their OWN localStorage key,
 *     `logic-sim-custom-gates`, independent of Phase B's circuit Save/Load.
 *   - Deleting a definition removes it, its palette entry, AND every placed
 *     instance (with its wires) from the canvas — no "keep the orphans"
 *     option.
 *   - Cannot be edited after creation — only viewed (read-only) or deleted.
 *
 * canvas.js and logic.js never import this file directly (this file imports
 * THEM, for the graph/paper and for GATE_FUNCS/evaluate — a two-way static
 * import would be circular): instead this file registers itself with both
 * via a small late-bound resolver each already exposes
 * (setCustomDefinitionResolver / setCustomGateLookup).
 */
import * as App from './app.js';
import * as Logic from './logic.js';
import { setCustomDefinitionResolver } from './canvas.js';

const STORAGE_KEY = 'logic-sim-custom-gates';
const MIN_GATES = 3;

/** id -> { id, name, inputCount, outputCount, truthTable: Map<"0,1,...", number[]>, gateWeight, gateTypes: string[] } */
const definitions = new Map();

// ---------------- DOM ----------------

const paletteList = document.getElementById('custom-gates-items');
const createGateButton = document.getElementById('btn-create-gate');

const namePopup = document.getElementById('create-gate-name-popup');
const nameInput = document.getElementById('create-gate-name-input');
const nameConfirm = document.getElementById('create-gate-name-confirm');
const nameCancel = document.getElementById('create-gate-name-cancel');

const removeConfirm = document.getElementById('create-gate-remove-confirm');
const removeYes = document.getElementById('create-gate-remove-yes');
const removeNo = document.getElementById('create-gate-remove-no');

const messagePopup = document.getElementById('custom-gate-message');
const messageText = document.getElementById('custom-gate-message-text');
const messageOk = document.getElementById('custom-gate-message-ok');

const viewPopup = document.getElementById('custom-gate-view');
const viewTitle = document.getElementById('custom-gate-view-title');
const viewBody = document.getElementById('custom-gate-view-body');
const viewClose = document.getElementById('custom-gate-view-close');

const deleteConfirm = document.getElementById('custom-gate-delete-confirm');
const deleteText = document.getElementById('custom-gate-delete-text');
const deleteYes = document.getElementById('custom-gate-delete-yes');
const deleteNo = document.getElementById('custom-gate-delete-no');

/** Simple one-button-at-a-time modal helper (these popups never nest). */
const showMessage = (text) =>
    new Promise((resolve) => {
        messageText.textContent = text;
        messagePopup.hidden = false;
        const onOk = () => { messagePopup.hidden = true; messageOk.removeEventListener('click', onOk); resolve(); };
        messageOk.addEventListener('click', onOk);
    });

const showYesNo = (popup, yesButton, noButton) =>
    new Promise((resolve) => {
        popup.hidden = false;
        const finish = (result) => {
            popup.hidden = true;
            yesButton.removeEventListener('click', onYes);
            noButton.removeEventListener('click', onNo);
            resolve(result);
        };
        const onYes = () => finish(true);
        const onNo = () => finish(false);
        yesButton.addEventListener('click', onYes);
        noButton.addEventListener('click', onNo);
    });

const promptName = () =>
    new Promise((resolve) => {
        nameInput.value = '';
        namePopup.hidden = false;
        nameInput.focus();
        const finish = (result) => {
            namePopup.hidden = true;
            nameConfirm.removeEventListener('click', onConfirm);
            nameCancel.removeEventListener('click', onCancel);
            resolve(result);
        };
        const onConfirm = () => finish(nameInput.value.trim() || null);
        const onCancel = () => finish(null);
        nameConfirm.addEventListener('click', onConfirm);
        nameCancel.addEventListener('click', onCancel);
    });

// ---------------- Selection validation ----------------

const selectedGateControls = () =>
    App.getSelection()
        .filter((key) => key.startsWith('c:'))
        .map((key) => App.getControl(key.slice(2)))
        .filter(Boolean);

const isPlainBuiltinGate = (control) => App.GATE_TYPES.has(control.type); // excludes 'custom:…' — no nesting

/** One connected group among ONLY the selected gates (ignoring outside wires). */
const isOneConnectedGroup = (gates) => {
    const ids = new Set(gates.map((g) => g.id));
    const seen = new Set([gates[0].id]);
    const stack = [gates[0].id];
    while (stack.length > 0) {
        const id = stack.pop();
        App.getWiresForControl(id).forEach((wire) => {
            [wire.fromControlId, wire.toControlId].forEach((other) => {
                if (ids.has(other) && !seen.has(other)) { seen.add(other); stack.push(other); }
            });
        });
    }
    return seen.size === ids.size;
};

/**
 * Validate the current selection. Returns { ok: true, gates } or
 * { ok: false, message } — the message is shown verbatim via showMessage().
 */
const validateSelection = () => {
    const selected = selectedGateControls();
    const nonGate = selected.find((control) => !App.GATE_TYPES.has(control.type) && !control.type.startsWith('custom:'));
    const customGate = selected.find((control) => control.type.startsWith('custom:'));
    if (customGate) {
        return { ok: false, message: 'Only logic gates can go into a custom gate — nesting an existing custom gate is not allowed.' };
    }
    if (nonGate) {
        return { ok: false, message: 'Only logic gates can go into a custom gate — switches, buttons, clocks, constants and sinks are not allowed. Remove them from the selection and try again.' };
    }
    const gates = selected.filter(isPlainBuiltinGate);
    if (gates.length < MIN_GATES) {
        return { ok: false, message: `Select at least ${MIN_GATES} gates to create a custom gate (${gates.length} selected).` };
    }
    if (!isOneConnectedGroup(gates)) {
        return { ok: false, message: 'The selected gates must all be wired together as one connected group.' };
    }
    return { ok: true, gates };
};

// ---------------- Boundary ports ----------------

/**
 * `inputs`/`outputs`: arrays of { gateId, index, nodeId }, each ordered
 * top-to-bottom by the originating gate's canvas y-position. `internal`:
 * every wire whose both ends are inside the selection (used to run the
 * sub-circuit; excluded from re-creation once the box exists).
 */
const derivePorts = (gates) => {
    const ids = new Set(gates.map((g) => g.id));
    const byId = new Map(gates.map((g) => [g.id, g]));
    const inputs = [];
    const outputs = [];
    const internal = [];

    gates.forEach((gate) => {
        for (let i = 0; i < gate.inputCount; i++) {
            const nodeId = `${gate.id}-in-${i}`;
            const wire = App.getWireInto(nodeId);
            if (wire && ids.has(wire.fromControlId)) internal.push(wire);
            else inputs.push({ gateId: gate.id, index: i, nodeId, y: byId.get(gate.id).y });
        }
        const outNodeId = `${gate.id}-out`;
        const outWires = App.getWiresFromNode(outNodeId);
        const exposedOutside = outWires.length === 0 || outWires.some((w) => !ids.has(w.toControlId));
        if (exposedOutside) outputs.push({ gateId: gate.id, index: 0, nodeId: outNodeId, y: byId.get(gate.id).y });
    });

    inputs.sort((a, b) => a.y - b.y);
    outputs.sort((a, b) => a.y - b.y);
    return { inputs, outputs, internal };
};

// ---------------- Sub-circuit simulation (for the truth table) ----------------

const internalWireIntoMap = (internalWires) => {
    const map = new Map();
    internalWires.forEach((wire) => map.set(wire.toNodeId, wire));
    return map;
};

/** Run the captured sub-circuit for one assignment of the boundary inputs. */
const simulate = (gates, ports, internalWireInto, assignment) => {
    const values = new Map();
    ports.inputs.forEach((port, i) => values.set(port.nodeId, assignment[i]));

    for (let pass = 0; pass < gates.length + 2; pass++) {
        let changed = false;
        gates.forEach((gate) => {
            const ins = [];
            for (let i = 0; i < gate.inputCount; i++) {
                const nodeId = `${gate.id}-in-${i}`;
                if (values.has(nodeId)) { ins.push(values.get(nodeId)); continue; } // boundary-seeded
                const wire = internalWireInto.get(nodeId);
                ins.push(wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined);
            }
            const outKey = `${gate.id}-out`;
            const out = Logic.GATE_FUNCS[gate.type](ins);
            if (!values.has(outKey) || values.get(outKey) !== out) { values.set(outKey, out); changed = true; }
        });
        if (!changed) break;
    }
    return ports.outputs.map((port) => (values.has(port.nodeId) ? values.get(port.nodeId) : undefined));
};

/** Every 0/1 combination of `n` inputs, in binary-counting order. */
const allCombinations = (n) => {
    const total = 2 ** n;
    const rows = [];
    for (let i = 0; i < total; i++) {
        const row = [];
        for (let bit = n - 1; bit >= 0; bit--) row.push(Math.floor(i / 2 ** bit) % 2);
        rows.push(row);
    }
    return rows;
};

const buildTruthTable = (gates, ports) => {
    const internalWireInto = internalWireIntoMap(ports.internal);
    const table = new Map();
    allCombinations(ports.inputs.length).forEach((ins) => {
        table.set(ins.join(','), simulate(gates, ports, internalWireInto, ins));
    });
    return table;
};

// ---------------- Duplicate detection ----------------

const sameTruthTable = (a, b) => {
    if (a.size !== b.size) return false;
    for (const [key, outs] of a) {
        const other = b.get(key);
        if (!other || other.length !== outs.length) return false;
        for (let i = 0; i < outs.length; i++) if (other[i] !== outs[i]) return false;
    }
    return true;
};

const findDuplicate = (inputCount, outputCount, truthTable) => {
    for (const definition of definitions.values()) {
        if (definition.inputCount !== inputCount || definition.outputCount !== outputCount) continue;
        if (sameTruthTable(definition.truthTable, truthTable)) return definition;
    }
    return null;
};

// ---------------- Create flow ----------------

const runCreateFlow = async () => {
    const validation = validateSelection();
    if (!validation.ok) { await showMessage(validation.message); return; }

    const { gates } = validation;
    const ports = derivePorts(gates);
    const truthTable = buildTruthTable(gates, ports);

    const duplicate = findDuplicate(ports.inputs.length, ports.outputs.length, truthTable);
    if (duplicate) {
        await showMessage(`A gate with this exact behavior already exists: "${duplicate.name}".`);
        return;
    }

    const name = await promptName();
    if (!name) return; // cancelled

    const id = `cg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const definition = {
        id,
        name,
        inputCount: ports.inputs.length,
        outputCount: ports.outputs.length,
        truthTable,
        gateWeight: Math.ceil(gates.length / 2), // Owner decision: round UP
        gateTypes: gates.map((g) => g.type),
        internalWireCount: ports.internal.length,
    };
    definitions.set(id, definition);
    addPaletteItem(definition);
    persist();

    const removeOriginals = await showYesNo(removeConfirm, removeYes, removeNo);
    if (removeOriginals) {
        gates.forEach((gate) => App.removeControl(gate.id));
    }
};

if (createGateButton) createGateButton.addEventListener('click', runCreateFlow);

// ---------------- Palette management ----------------

const addPaletteItem = (definition) => {
    const item = document.createElement('div');
    item.className = 'palette-item custom-gate-item';
    item.draggable = true;
    item.dataset.type = `custom:${definition.id}`;
    item.textContent = definition.name;

    const infoButton = document.createElement('button');
    infoButton.type = 'button';
    infoButton.className = 'custom-gate-info';
    infoButton.title = 'View configuration';
    infoButton.textContent = 'i';
    infoButton.addEventListener('click', (event) => { event.stopPropagation(); openView(definition.id); });
    item.appendChild(infoButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'custom-gate-delete';
    deleteButton.title = 'Delete this custom gate';
    deleteButton.textContent = '\u00d7';
    deleteButton.addEventListener('click', (event) => { event.stopPropagation(); requestDelete(definition.id); });
    item.appendChild(deleteButton);

    paletteList.appendChild(item);
};

const removePaletteItem = (id) => {
    const item = paletteList.querySelector(`.palette-item[data-type="custom:${id}"]`);
    if (item) item.remove();
};

// ---------------- View configuration (read-only) ----------------

const openView = (id) => {
    const definition = definitions.get(id);
    if (!definition) return;
    viewTitle.textContent = definition.name;
    const lines = [
        `${definition.inputCount} input${definition.inputCount === 1 ? '' : 's'}, ${definition.outputCount} output${definition.outputCount === 1 ? '' : 's'}`,
        `Built from ${definition.gateTypes.length} gates (counts as ${definition.gateWeight} toward the 10-gate circuit limit):`,
        ...definition.gateTypes.map((type, i) => `  ${i + 1}. ${type.toUpperCase()}`),
        `${definition.internalWireCount} internal connection${definition.internalWireCount === 1 ? '' : 's'} (not shown — captured permanently; this gate cannot be edited).`,
    ];
    viewBody.textContent = lines.join('\n');
    viewPopup.hidden = false;
};

viewClose.addEventListener('click', () => { viewPopup.hidden = true; });

// ---------------- Delete (definition + every placed instance) ----------------

const requestDelete = async (id) => {
    const definition = definitions.get(id);
    if (!definition) return;
    const instances = App.allControls().filter((control) => control.type === `custom:${id}`);
    deleteText.textContent = instances.length > 0
        ? `Delete "${definition.name}"? This also removes ${instances.length} placed instance${instances.length === 1 ? '' : 's'} (and its wires) from the canvas. This cannot be undone.`
        : `Delete "${definition.name}"? This cannot be undone.`;
    const confirmed = await showYesNo(deleteConfirm, deleteYes, deleteNo);
    if (!confirmed) return;

    instances.forEach((control) => App.removeControl(control.id));
    definitions.delete(id);
    removePaletteItem(id);
    persist();
};

// ---------------- Resolver registration (canvas.js places instances, logic.js evaluates them) ----------------

export const getDefinition = (id) => definitions.get(id);
setCustomDefinitionResolver(getDefinition);
Logic.setCustomGateLookup(getDefinition);

// ---------------- Persistence ----------------
// Its own key, independent of Phase B's circuit Save/Load format.

const serializeDefinition = (definition) => ({
    id: definition.id,
    name: definition.name,
    inputCount: definition.inputCount,
    outputCount: definition.outputCount,
    gateWeight: definition.gateWeight,
    gateTypes: definition.gateTypes,
    internalWireCount: definition.internalWireCount,
    truthTable: [...definition.truthTable.entries()],
});

const deserializeDefinition = (data) => ({
    ...data,
    truthTable: new Map(data.truthTable),
});

const persist = () => {
    try {
        const payload = [...definitions.values()].map(serializeDefinition);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error(`Could not save custom gates (localStorage unavailable): ${error}`);
    }
};

/** Load persisted definitions and repopulate the palette. Called once by main.js. */
export const loadFromStorage = () => {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        console.error(`Could not read saved custom gates (localStorage unavailable): ${error}`);
        return;
    }
    if (!raw) return;
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (error) {
        console.error('Saved custom gates are corrupt; ignoring.', error);
        return;
    }
    payload.forEach((data) => {
        const definition = deserializeDefinition(data);
        definitions.set(definition.id, definition);
        addPaletteItem(definition);
    });
};
