/**
 * theme.js — Theme Persistence
 * ---------------------------------------------------------------------------
 * Per javascript.md §9 / colorScheme.md's "Tokyo Night" dark mode:
 *   - Listens to #dark-mode-toggle and toggles .dark-mode on <body> (every
 *     rule in style.css reads its colors from custom properties, so this one
 *     class swap re-themes the entire app).
 *   - Persists the choice under the localStorage key "darkMode" and restores
 *     it on load, inside try/catch in case storage is unavailable (private
 *     browsing, blocked storage, ...).
 */
const STORAGE_KEY = 'darkMode';

const toggle = document.getElementById('dark-mode-toggle');

export const applyTheme = (isDark) => {
    document.body.classList.toggle('dark-mode', isDark);
};

toggle.addEventListener('change', () => {
    applyTheme(toggle.checked);
    try {
        localStorage.setItem(STORAGE_KEY, toggle.checked ? '1' : '0');
    } catch (error) {
        // Storage unavailable: the choice just won't survive a reload.
    }
});

try {
    if (localStorage.getItem(STORAGE_KEY) === '1') {
        toggle.checked = true;
        applyTheme(true);
    }
} catch (error) {
    // Storage unavailable: default to light mode.
}
