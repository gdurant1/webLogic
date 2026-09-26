/**
 * logic.js — Simulation & Gate Logic
 * ---------------------------------------------------------------------------
 * Per javascript.md §5 + §6:
 *   - Truth-table evaluation for Buffer/NOT/AND/NAND/OR/NOR/XOR/XNOR.
 *   - Tri-State: input 0 = data, input 1 = active-low enable. enable=0 ->
 *     output follows data; enable=1 -> high-impedance (no signal class is
 *     applied to the outgoing wire at all) — see colorScheme.md's wire note
 *     and htmlPromptForCSS.md's tri-state note.
 *   - Source controls: toggle switches (real checkbox), push buttons
 *     (press-and-hold), a JS-driven clock (800ms half-period; the CSS
 *     @keyframes blink in style.css is a purely visual placeholder that
 *     runs independently — this is the value the simulation actually uses),
 *     and the two constants.
 *   - Sinks: light bulb (.on class) and the 4-bit digit display.
 *   - Play/Stop/step-forward/step-back cycle through every combination of
 *     the canvas's toggle-switch inputs.
 *
 * Evaluation itself is a small iterative relaxation over every control on
 * the canvas — cheap at the scale this app deals with, and tolerant of
 * simple feedback loops without needing a full topological sort.
 */
(function () {
    'use strict';

    const SOURCE_TYPES = new Set(['toggle-switch', 'push-button', 'clock', 'high-constant', 'low-constant']);

    const GATE_FUNCS = {
        buffer: (ins) => ins[0],
        not: (ins) => (ins[0] === undefined ? undefined : (ins[0] ? 0 : 1)),
        and: (ins) => (ins.some(v => v === undefined) ? undefined : (ins.every(v => v === 1) ? 1 : 0)),
        nand: (ins) => (ins.some(v => v === undefined) ? undefined : (ins.every(v => v === 1) ? 0 : 1)),
        or: (ins) => (ins.some(v => v === undefined) ? undefined : (ins.some(v => v === 1) ? 1 : 0)),
        nor: (ins) => (ins.some(v => v === undefined) ? undefined : (ins.some(v => v === 1) ? 0 : 1)),
        xor: (ins) => (ins.some(v => v === undefined) ? undefined : (ins.filter(v => v === 1).length % 2 === 1 ? 1 : 0)),
        xnor: (ins) => (ins.some(v => v === undefined) ? undefined : (ins.filter(v => v === 1).length % 2 === 1 ? 0 : 1)),
        'tri-state': (ins) => {
            const data = ins[0], enable = ins[1];
            if (enable === undefined) return undefined;
            return enable === 0 ? data : undefined; // enable=1 -> floating
        },
    };

    function findWireInto(nodeId) {
        return App.allWires().find(w => w.toNodeId === nodeId);
    }

    function getSourceValue(control) {
        switch (control.type) {
            case 'toggle-switch': {
                const cb = control.el.querySelector('.switch-input');
                return cb && cb.checked ? 1 : 0;
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
    }

    function evaluate() {
        const controls = App.allControls();
        const values = new Map(); // nodeId -> 0 | 1 | undefined (floating/unknown)

        controls.forEach(c => {
            if (SOURCE_TYPES.has(c.type)) values.set(c.id + '-out', getSourceValue(c));
        });

        // A few relaxation passes handle chains of any depth, plus simple
        // feedback loops, without needing a full dependency sort.
        for (let pass = 0; pass < controls.length + 2; pass++) {
            controls.forEach(c => {
                const fn = GATE_FUNCS[c.type];
                if (!fn) return;
                const ins = [];
                for (let i = 0; i < c.inputCount; i++) {
                    const wire = findWireInto(c.id + '-in-' + i);
                    ins.push(wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined);
                }
                values.set(c.id + '-out', fn(ins));
            });
        }

        App.allWires().forEach(w => {
            const v = values.has(w.fromNodeId) ? values.get(w.fromNodeId) : undefined;
            w.signal = v;
            // A wire carrying a Clock's output changes value on every tick —
            // color it gray (a "this signal changes regularly" cue) instead
            // of flicking between the ordinary high/low colors every 800ms.
            const fromInfo = App.getNode(w.fromNodeId);
            const fromControl = fromInfo && App.getControl(fromInfo.controlId);
            const isClockSource = !!(fromControl && fromControl.type === 'clock');
            w.pathEl.classList.toggle('signal-clock', isClockSource);
            w.pathEl.classList.toggle('signal-high', !isClockSource && v === 1);
            w.pathEl.classList.toggle('signal-low', !isClockSource && v === 0);
        });

        controls.forEach(c => {
            if (c.type === 'light-bulb') {
                const wire = findWireInto(c.id + '-in-0');
                const v = wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : undefined;
                c.el.classList.toggle('on', v === 1);
            } else if (c.type === 'four-bit-digit') {
                let n = 0;
                for (let i = 0; i < 4; i++) {
                    const wire = findWireInto(c.id + '-in-' + i);
                    const v = wire && values.has(wire.fromNodeId) ? values.get(wire.fromNodeId) : 0;
                    if (v === 1) n |= (1 << (3 - i)); // node index 0 = top = MSB
                }
                const display = c.el.querySelector('.digit-display');
                if (display) display.textContent = String(n);
            }
        });

        App.emit('simulation:update', values);
    }

    // ---------------- Wiring up interactive source controls ----------------
    App.events.addEventListener('control:placed', (e) => {
        const c = e.detail;
        if (c.type === 'toggle-switch') {
            const cb = c.el.querySelector('.switch-input');
            cb.addEventListener('change', evaluate);
        } else if (c.type === 'push-button') {
            const face = c.el.querySelector('.push-button-face');
            const press = () => { face.classList.add('pushed'); evaluate(); };
            const release = () => { face.classList.remove('pushed'); evaluate(); };
            face.addEventListener('mousedown', press);
            face.addEventListener('mouseup', release);
            face.addEventListener('mouseleave', release);
        } else if (c.type === 'clock') {
            c.clockValue = 0;
            c.clockTimer = setInterval(() => {
                c.clockValue = c.clockValue ? 0 : 1;
                evaluate();
            }, 800);
        }
        evaluate();
    });

    App.events.addEventListener('control:remove', (e) => {
        if (e.detail.clockTimer) clearInterval(e.detail.clockTimer);
        evaluate();
    });
    App.events.addEventListener('wire:add', evaluate);
    App.events.addEventListener('wire:remove', evaluate);

    // ---------------- Play / Stop / Step simulation ----------------
    let playTimer = null;
    let stepIndex = 0;

    function getPrimaryInputs() {
        // Toggle switches are the canvas's manually steppable inputs; push
        // buttons are momentary and constants/clock aren't stepped.
        return App.allControls().filter(c => c.type === 'toggle-switch');
    }

    function applyCombination(index) {
        const inputs = getPrimaryInputs();
        inputs.forEach((c, i) => {
            const cb = c.el.querySelector('.switch-input');
            cb.checked = !!((index >> i) & 1);
        });
        evaluate();
    }

    function play() {
        stop();
        const total = Math.max(1, Math.pow(2, getPrimaryInputs().length));
        playTimer = setInterval(() => {
            applyCombination(stepIndex);
            stepIndex = (stepIndex + 1) % total;
        }, 700);
    }

    function stop() {
        if (playTimer) { clearInterval(playTimer); playTimer = null; }
    }

    function stepForward() {
        const total = Math.max(1, Math.pow(2, getPrimaryInputs().length));
        stepIndex = (stepIndex + 1) % total;
        applyCombination(stepIndex);
    }

    function stepBack() {
        const total = Math.max(1, Math.pow(2, getPrimaryInputs().length));
        stepIndex = (stepIndex - 1 + total) % total;
        applyCombination(stepIndex);
    }

    window.LogicModule = { GATE_FUNCS, evaluate, play, stop, stepForward, stepBack, getPrimaryInputs };
})();
