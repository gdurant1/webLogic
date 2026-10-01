/**
 * logic.js — Simulation & Gate Logic
 * ---------------------------------------------------------------------------
 * Gate truth tables, Tri-State, sources, sinks, the shared clock timer and
 * Play/Stop are UNCHANGED in behavior from the pre-JointJS version. What
 * changed:
 *   - Toggle switch / push button (Phase A Task 2 + 4): a click anywhere on
 *     the whole shape now toggles/presses it, not just its track/face
 *     sub-element — the previous per-sub-element listeners missed the knob
 *     and the inner circle, which sit visually on top of their own parent.
 *     This uses the Paper's own `element:pointerclick` (switch) and
 *     `element:pointerdown` + a single document-level `pointerup` (button,
 *     replacing a per-control listener that used to leak) — both of which
 *     this project's joint.js binds to 'mousedown'/'touchstart' internally
 *     (verified directly in joint.js), so touch works with no extra code.
 *     Both stay fully draggable too (Task 2 requires both at once) — a
 *     plain click/press with no real movement resolves to
 *     element:pointerclick/pointerdown regardless of whether elementMove is
 *     enabled, since JointJS's own move-threshold is what decides click vs.
 *     drag, not canvas.js's `interactive` option. (An earlier version of
 *     that option disabled elementMove for these two types specifically "to
 *     protect the click" — a mistaken assumption, caught by testing: it
 *     broke dragging them entirely for no actual benefit, since there was
 *     never a race to protect against.)
 *   - Toggle switch: no real `<input type="checkbox">`. Clicking toggles a
 *     `.checked` class on `control.el` (the cell's root `<g>`, which already
 *     carries `.control.toggle-switch` — see shapes.js); getSourceValue
 *     reads that class instead of `.checked`.
 *   - Push button: press/release toggles `.pushed` on the `.push-button-inner`
 *     circle (style.css targets `.push-button-inner.pushed` directly, since
 *     this shape's markup is flat, not nested like the old DOM version's
 *     `.push-button-face.pushed .push-button-inner`).
 *   - Custom gates (Phase A "Create Gate"): evaluated via a precomputed
 *     truth table looked up through a resolver customGates.js registers
 *     with setCustomGateLookup — logic.js never imports customGates.js
 *     directly, since that file already imports THIS one (for GATE_FUNCS),
 *     and a two-way static import would be circular.
 * Everything else — evaluate(), the wire/light-bulb/4-bit-digit code, the
 * clock timer, play/stop — reads `control.el`/`wire.pathEl` the same way it
 * always did, because SVGElement supports classList/querySelector exactly
 * like HTML elements.
 */
import * as App from './app.js';
import * as Limits from './limits.js';
import { getPaperInstance } from './canvas.js';

const paper = getPaperInstance();

const SOURCE_TYPES = new Set(['toggle-switch', 'push-button', 'clock', 'high-constant', 'low-constant']);
const CLOCK_HALF_PERIOD_MS = 800;
const PLAY_STEP_MS = 700;
const isCustomGate = (control) => typeof control.type === 'string' && control.type.startsWith('custom:');

const anyUndefined = (ins) => ins.some((v) => v === undefined);

export const GATE_FUNCS = {
    buffer: (ins) => ins[0],
    not: (ins) => (ins[0] === undefined ? undefined : (ins[0] ? 0 : 1)),
    and: (ins) => (anyUndefined(ins) ? undefined : (ins.every((v) => v === 1) ? 1 : 0)),
    nand: (ins) => (anyUndefined(ins) ? undefined : (ins.every((v) => v === 1) ? 0 : 1)),
    or: (ins) => (anyUndefined(ins) ? undefined : (ins.some((v) => v === 1) ? 1 : 0)),
    nor: (ins) => (anyUndefined(ins) ? undefined : (ins.some((v) => v === 1) ? 0 : 1)),
    xor: (ins) => (anyUndefined(ins) ? undefined : (ins.filter((v) => v === 1).length % 2 === 1 ? 1 : 0)),
    xnor: (ins) => (anyUndefined(ins) ? undefined : (ins.filter((v) => v === 1).length % 2 === 1 ? 0 : 1)),
    'tri-state': (ins) => {
        const data = ins[0];
        const enable = ins[1];
        if (enable === undefined) return undefined;
        return enable === 0 ? data : undefined; // enable=1 -> floating
    },
};

// ---------------- Custom gates ----------------
// customGates.js registers itself here once at its own module-load time
// (see that file). A definition is `{ id, name, inputCount, outputCount,
// truthTable: Map<"0,1,...": number[]> }` — plain, JSON-serializable data
// (not a live function), since definitions need to survive reload via
// localStorage.

let customGateLookup = null;
export const setCustomGateLookup = (fn) => { customGateLookup = fn; };
/** tables.js also needs a definition's own precomputed truth table/ports. */
export const getCustomGateDefinition = (id) => customGateLookup && customGateLookup(id);

/** All-undefined (floating) if any input is undefined; else the definition's precomputed row. */
const evaluateCustomGate = (definition, ins) => {
    if (!definition) return [];
    if (ins.some((v) => v === undefined)) return new Array(definition.outputCount).fill(undefined);
    const row = definition.truthTable.get(ins.join(','));
    return row || new Array(definition.outputCount).fill(undefined);
};

const getSourceValue = (control) => {
    switch (control.type) {
        case 'toggle-switch':
            return control.el.classList.contains('checked') ? 1 : 0;
        case 'push-button': {
            const inner = control.el.querySelector('.push-button-inner');
            return inner && inner.classList.contains('pushed') ? 1 : 0;
        }
        case 'clock':
            return control.clockValue || 0;
        case 'high-constant':
            return 1;
        case 'low-constant':
            return 0;
        default:
            return undefined;
    }
};

/** Value arriving at an input node, given the current node values. */
const valueInto = (nodeId, values, fallback) => {
    const wire = App.getWireInto(nodeId);
    if (!wire || !values.has(wire.fromNodeId)) return fallback;
    return values.get(wire.fromNodeId);
};

export const evaluate = () => {
    const started = performance.now();
    const controls = App.allControls();
    const values = new Map(); // nodeId -> 0 | 1 | undefined (floating / unknown)

    controls.forEach((control) => {
        if (SOURCE_TYPES.has(control.type)) values.set(`${control.id}-out`, getSourceValue(control));
    });

    const gates = controls.filter((control) => GATE_FUNCS[control.type] || isCustomGate(control));
    for (let pass = 0; pass < gates.length + 2; pass++) {
        let changed = false;
        gates.forEach((gate) => {
            const ins = [];
            for (let i = 0; i < gate.inputCount; i++) {
                ins.push(valueInto(`${gate.id}-in-${i}`, values, undefined));
            }
            if (isCustomGate(gate)) {
                const definition = customGateLookup && customGateLookup(gate.type.slice('custom:'.length));
                const outs = evaluateCustomGate(definition, ins);
                outs.forEach((out, i) => {
                    const key = `${gate.id}-out-${i}`;
                    if (!values.has(key) || values.get(key) !== out) {
                        values.set(key, out);
                        changed = true;
                    }
                });
            } else {
                const key = `${gate.id}-out`;
                const out = GATE_FUNCS[gate.type](ins);
                if (!values.has(key) || values.get(key) !== out) {
                    values.set(key, out);
                    changed = true;
                }
            }
        });
        if (!changed) break;
    }

    App.allWires().forEach((wire) => {
        const value = values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined;
        wire.signal = value;
        // A wire carrying a Clock's output changes on every tick — color it
        // gray ("this signal changes regularly") instead of flickering
        // between the high/low colors.
        const source = App.getControl(wire.fromControlId);
        const isClockSource = Boolean(source && source.type === 'clock');
        wire.pathEl.classList.toggle('signal-clock', isClockSource);
        wire.pathEl.classList.toggle('signal-high', !isClockSource && value === 1);
        wire.pathEl.classList.toggle('signal-low', !isClockSource && value === 0);
    });

    controls.forEach((control) => {
        if (control.type === 'light-bulb') {
            control.el.classList.toggle('on', valueInto(`${control.id}-in-0`, values, undefined) === 1);
        } else if (control.type === 'four-bit-digit') {
            let digit = 0;
            for (let i = 0; i < 4; i++) {
                if (valueInto(`${control.id}-in-${i}`, values, 0) === 1) digit += 2 ** (3 - i); // node 0 = top = MSB
            }
            const display = control.el.querySelector('.digit-display');
            if (display) display.textContent = String(digit);
        }
    });

    App.emit('simulation:update', values);
    Limits.recordEvaluate(performance.now() - started);
};

/** Coalesce bursts of events (e.g. Clear All) into one evaluation. */
let evaluatePending = false;
export const scheduleEvaluate = () => {
    if (evaluatePending) return;
    evaluatePending = true;
    queueMicrotask(() => {
        evaluatePending = false;
        evaluate();
    });
};

// ---------------- Shared clock timer ----------------

let clockTimer = null;

const stopClockTimer = () => {
    if (clockTimer !== null) {
        clearInterval(clockTimer);
        clockTimer = null;
    }
};

const tickClocks = () => {
    const clocks = App.allControls().filter((control) => control.type === 'clock');
    if (clocks.length === 0) {
        stopClockTimer();
        return;
    }
    clocks.forEach((clock) => {
        clock.clockValue = clock.clockValue ? 0 : 1;
        clock.el.classList.toggle('on', clock.clockValue === 1);
    });
    evaluate();
};

const ensureClockTimer = () => {
    if (clockTimer === null) clockTimer = setInterval(tickClocks, CLOCK_HALF_PERIOD_MS);
};

// ---------------- Wiring up interactive source controls ----------------

// A click (press+release with no real movement) anywhere on a toggle switch
// toggles it — the whole shape is the hit area now, not just the track, so
// clicking the knob itself (which used to do nothing — Task 2's bug) works.
// `element:pointerclick` only fires when the pointer didn't move enough to
// count as a drag, so this can never fire mid-drag — the switch is still
// fully draggable too (canvas.js's `interactive` option no longer disables
// elementMove for it; see that file's own comment for why that was never
// actually necessary). selection.js's own `element:pointerclick` listener
// still runs too on the same click — a click both toggles AND selects.
paper.on('element:pointerclick', (elementView) => {
    const control = App.getControl(elementView.model.id);
    if (!control || control.type !== 'toggle-switch') return;
    control.el.classList.toggle('checked');
    evaluate();
});

// Press-and-hold anywhere on a push button lights a connected bulb only
// while held, same as before — but via Paper's own pointerdown (so the
// whole shape, including the inner circle, is the hit area) and a SINGLE
// document-level pointerup shared by every button (not one leaked listener
// per control, as the old mousedown/mouseup version had).
paper.on('element:pointerdown', (elementView) => {
    const control = App.getControl(elementView.model.id);
    if (!control || control.type !== 'push-button') return;
    const inner = control.el.querySelector('.push-button-inner');
    if (!inner) return;
    inner.classList.add('pushed');
    evaluate();
});

document.addEventListener('pointerup', () => {
    const pushed = document.querySelectorAll('.push-button-inner.pushed');
    if (pushed.length === 0) return;
    pushed.forEach((inner) => inner.classList.remove('pushed'));
    evaluate();
});

App.events.addEventListener('control:placed', (event) => {
    const control = event.detail;
    if (control.type === 'clock') {
        control.clockValue = 0; // always starts low
        control.el.classList.remove('on');
        ensureClockTimer();
    }
    scheduleEvaluate();
});

App.events.addEventListener('control:remove', () => {
    if (!App.allControls().some((control) => control.type === 'clock')) stopClockTimer();
    scheduleEvaluate();
});
App.events.addEventListener('wire:add', scheduleEvaluate);
App.events.addEventListener('wire:remove', scheduleEvaluate);
App.events.addEventListener('control:inputcount', scheduleEvaluate);

// ---------------- Play / Stop simulation ----------------

let playTimer = null;
let stepIndex = 0;

export const getPrimaryInputs = () => App.allControls().filter((control) => control.type === 'toggle-switch');

const setSwitch = (control, on) => control.el.classList.toggle('checked', on);

const applyCombination = (index) => {
    getPrimaryInputs().forEach((control, i) => {
        setSwitch(control, Math.floor(index / 2 ** i) % 2 === 1);
    });
    evaluate();
};

export const stop = () => {
    if (playTimer !== null) {
        clearInterval(playTimer);
        playTimer = null;
    }
};

export const play = () => {
    stop();
    playTimer = setInterval(() => {
        const total = Math.max(1, 2 ** getPrimaryInputs().length);
        applyCombination(stepIndex % total);
        stepIndex = (stepIndex + 1) % total;
    }, PLAY_STEP_MS);
};
