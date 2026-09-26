/**
 * selection.js — Selection & Transformations
 * ---------------------------------------------------------------------------
 * Per javascript.md §4:
 *   - Click on a .control sets the single active selection and toggles
 *     .selected (style.css already defines the look — see colorScheme.md's
 *     --color-selected). Ctrl/Cmd-click adds/removes from the selection.
 *   - #btn-multiselect arms a rubber-band drag over empty canvas space that
 *     selects every intersecting .control.
 *   - Delete removes selected controls/wires (and, via app.js, any wires
 *     attached to a removed control).
 *   - Cut/copy/paste, flip-h/flip-v, and group are implemented here.
 *
 * Grouping is deliberately lightweight: a shared control.groupId makes a
 * later click on any member of the group re-select the whole group, and
 * canvas.js's drag-repositioning already moves the entire current selection
 * together — so "group" doesn't need its own drag logic.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('canvas');
    const btnMultiselect = document.getElementById('btn-multiselect');

    let multiSelectMode = false;
    let clipboard = [];
    let nextGroupId = 1;

    function keyC(id) { return 'c:' + id; }
    function keyW(id) { return 'w:' + id; }

    // ---------------- Visual sync ----------------
    function applyVisualSelection() {
        document.querySelectorAll('.control.selected, .wire.selected').forEach(el => el.classList.remove('selected'));
        App.getSelection().forEach(key => {
            if (key.startsWith('c:')) {
                const c = App.getControl(key.slice(2));
                if (c) c.el.classList.add('selected');
            } else if (key.startsWith('w:')) {
                const w = App.getWire(key.slice(2));
                if (w) w.pathEl.classList.add('selected');
            }
        });
    }
    App.events.addEventListener('selection:change', applyVisualSelection);

    // ---------------- Click-to-select ----------------
    function selectControl(id, additive) {
        const c = App.getControl(id);
        const idsToSelect = (c && c.groupId)
            ? App.allControls().filter(x => x.groupId === c.groupId).map(x => x.id)
            : [id];

        if (additive) {
            idsToSelect.forEach(cid => {
                const key = keyC(cid);
                if (App.isSelected(key)) App.removeFromSelection(key);
                else App.addToSelection(key);
            });
        } else {
            App.setSelection(idsToSelect.map(keyC));
        }
    }

    canvas.addEventListener('click', (e) => {
        if (window.WiresModule && window.WiresModule.isEraserActive()) return;
        const controlEl = e.target.closest('.control');
        if (controlEl) {
            selectControl(controlEl.dataset.id, e.ctrlKey || e.metaKey);
            return;
        }
        if (e.target === canvas) App.clearSelection();
    });

    // ---------------- Rubber-band multi-select ----------------
    if (btnMultiselect) {
        btnMultiselect.addEventListener('click', () => {
            multiSelectMode = !multiSelectMode;
            btnMultiselect.classList.toggle('selected', multiSelectMode);
        });
    }

    canvas.addEventListener('mousedown', (e) => {
        if (!multiSelectMode) return;
        if (e.target.closest('.control') || e.target.closest('.node')) return;

        const rect = canvas.getBoundingClientRect();
        const scale = window.WiresModule ? window.WiresModule.getScale() : 1;
        const startX = (e.clientX - rect.left) / scale + canvas.scrollLeft;
        const startY = (e.clientY - rect.top) / scale + canvas.scrollTop;

        const band = document.createElement('div');
        band.style.position = 'absolute';
        band.style.border = '1px dashed var(--color-selected, #2979ff)';
        band.style.background = 'rgba(41,121,255,0.12)';
        band.style.left = startX + 'px';
        band.style.top = startY + 'px';
        band.style.zIndex = '50';
        band.style.pointerEvents = 'none';
        canvas.appendChild(band);

        function onMove(ev) {
            const x = (ev.clientX - rect.left) / scale + canvas.scrollLeft;
            const y = (ev.clientY - rect.top) / scale + canvas.scrollTop;
            band.style.left = Math.min(startX, x) + 'px';
            band.style.top = Math.min(startY, y) + 'px';
            band.style.width = Math.abs(x - startX) + 'px';
            band.style.height = Math.abs(y - startY) + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const bandRect = band.getBoundingClientRect();
            const picked = App.allControls()
                .filter(c => {
                    const r = c.el.getBoundingClientRect();
                    return r.left < bandRect.right && r.right > bandRect.left &&
                        r.top < bandRect.bottom && r.bottom > bandRect.top;
                })
                .map(c => keyC(c.id));
            App.setSelection(picked);
            band.remove();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // ---------------- Delete ----------------
    function deleteSelection() {
        App.getSelection().forEach(key => {
            if (key.startsWith('c:')) App.removeControl(key.slice(2));
            else if (key.startsWith('w:')) App.removeWire(key.slice(2));
        });
        App.clearSelection();
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        deleteSelection();
    });

    // ---------------- Cut / copy / paste ----------------
    function serializeSelectedControls() {
        return App.getSelection()
            .filter(k => k.startsWith('c:'))
            .map(k => App.getControl(k.slice(2)))
            .filter(Boolean)
            .map(c => ({ type: c.type, x: c.x, y: c.y, inputCount: c.inputCount }));
    }

    function copySelection() { clipboard = serializeSelectedControls(); }
    function cutSelection() { copySelection(); deleteSelection(); }

    function pasteClipboard() {
        if (!clipboard.length || !window.CanvasModule) return;
        const newKeys = clipboard.map(item => {
            const control = window.CanvasModule.placeControl(item.type, item.x + 40, item.y + 40, item.inputCount);
            return control ? keyC(control.id) : null;
        }).filter(Boolean);
        App.setSelection(newKeys);
    }

    // ---------------- Flip ----------------
    function flip(axis) {
        App.getSelection().filter(k => k.startsWith('c:')).forEach(key => {
            const c = App.getControl(key.slice(2));
            if (!c) return;
            c.flipH = c.flipH || false;
            c.flipV = c.flipV || false;
            if (axis === 'h') c.flipH = !c.flipH;
            else c.flipV = !c.flipV;
            c.el.style.transform = 'scale(' + (c.flipH ? -1 : 1) + ', ' + (c.flipV ? -1 : 1) + ')';
        });
    }

    // ---------------- Group ----------------
    function group() {
        const ids = App.getSelection().filter(k => k.startsWith('c:')).map(k => k.slice(2));
        if (ids.length < 2) return;
        const gid = 'grp-' + (nextGroupId++);
        ids.forEach(id => {
            const c = App.getControl(id);
            if (c) c.groupId = gid;
        });
    }

    // ---------------- Toolbar bindings ----------------
    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    };
    bind('btn-delete', deleteSelection);
    bind('btn-cut', cutSelection);
    bind('btn-copy', copySelection);
    bind('btn-paste', pasteClipboard);
    bind('btn-flip-h', () => flip('h'));
    bind('btn-flip-v', () => flip('v'));
    bind('btn-group', group);

    window.SelectionModule = {
        deleteSelection, copySelection, cutSelection, pasteClipboard, flip, group,
        isMultiSelectMode: () => multiSelectMode,
    };
})();
