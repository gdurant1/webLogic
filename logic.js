/**
 * logic.js — Simulation & Gate Logic
 * ---------------------------------------------------------------------------
 * Per javascript.md §5 + §6:
 *   - Truth-table evaluation for Buffer/NOT/AND/NAND/OR/NOR/XOR/XNOR.
 *   - Tri-State: input 0 = data, input 1 = active-low enable. enable=0 ->
 *     output follows data; enable=1 -> high-impedance (floating): the wire
 *     gets no signal class at all.
 *   - Sources: toggle switches (real checkbox), push buttons (press-and-
 *     hold), clocks, and the two constants.
 *   - Clocks share ONE timer (CLOCK_HALF_PERIOD_MS). Each clock keeps its own
 *     value and starts LOW when placed, so clocks placed at different moments
 *     can be opposite each other; the .on class drives the visible indicator.
 *   - Sinks: light bulb (.on class) and the 4-bit digit display.
 *   - Play / Stop step through every combination of the canvas's toggle
 *     switches. (Step-forward / step-back were removed with the canvas
 *     controls.)
 *
 * evaluate() is a small iterative relaxation over every control. It stops as
 * soon as a pass changes nothing, so ordinary circuits settle in 2-3 passes.
 * Every run is timed and reported to limits.js (speed guard).
 */
import * as App from './app.js';
import * as Limits from './limits.js';

const SOURCE_TYPES = new Set(['toggle-switch', 'push-button', 'clock', 'high-constant', 'low-constant']);
const CLOCK_HALF_PERIOD_MS = 800;
const PLAY_STEP_MS = 700;

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

const getSourceValue = (control) => {
    switch (control.type) {
        case 'toggle-switch': {
            const checkbox = control.el.querySelector('.switch-input');
            return checkbox && checkbox.checked ? 1 : 0;
        }
        case 'push-button': {
            const face = control.el.querySelector('.push-button-face');
            return face && face.classList.contains('pushed') ? 1 : 0;
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

    const gates = controls.filter((control) => GATE_FUNCS[control.type]);
    for (let pass = 0; pass < gates.length + 2; pass++) {
        let changed = false;
        gates.forEach((gate) => {
            const ins = [];
            for (let i = 0; i < gate.inputCount; i++) {
                ins.push(valueInto(`${gate.id}-in-${i}`, values, undefined));
            }
            const key = `${gate.id}-out`;
            const out = GATE_FUNCS[gate.type](ins);
            if (!values.has(key) || values.get(key) !== out) {
                values.set(key, out);
                changed = true;
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

App.events.addEventListener('control:placed', (event) => {
    const control = event.detail;
    if (control.type === 'toggle-switch') {
        control.el.querySelector('.switch-input').addEventListener('change', evaluate);
    } else if (control.type === 'push-button') {
        const face = control.el.querySelector('.push-button-face');
        const press = () => {
            face.classList.add('pushed');
            evaluate();
        };
        const release = () => {
            if (!face.classList.contains('pushed')) return;
            face.classList.remove('pushed');
            evaluate();
        };
        face.addEventListener('mousedown', press);
        face.addEventListener('mouseup', release);
        face.addEventListener('mouseleave', release);
    } else if (control.type === 'clock') {
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

const applyCombination = (index) => {
    getPrimaryInputs().forEach((control, i) => {
        const checkbox = control.el.querySelector('.switch-input');
        checkbox.checked = Math.floor(index / 2 ** i) % 2 === 1;
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
