/**
 * theme.js — Theme Persistence
 * ---------------------------------------------------------------------------
 * Per javascript.md §9 / colorScheme.md's "Tokyo Night" dark mode:
 *   - Listens to #dark-mode-toggle, toggling .dark-mode on <body> (every
 *     rule in style.css already reads its colors from custom properties, so
 *     this one class swap re-themes the entire app).
 *   - Persists the choice under the localStorage key "darkMode" and restores
 *     it on load, inside a try/catch in case storage is unavailable
 *     (private browsing, disabled storage, etc.).
 */
(function () {
    'use strict';

    const toggle = document.getElementById('dark-mode-toggle');

    function apply(isDark) {
        document.body.classList.toggle('dark-mode', isDark);
    }

    toggle.addEventListener('change', () => {
        apply(toggle.checked);
        try {
            localStorage.setItem('darkMode', toggle.checked ? '1' : '0');
        } catch (err) {
            // Storage unavailable — the choice just won't survive a reload.
        }
    });

    try {
        if (localStorage.getItem('darkMode') === '1') {
            toggle.checked = true;
            apply(true);
        }
    } catch (err) {
        // Storage unavailable — default to light mode.
    }

    window.ThemeModule = { apply };
})();
