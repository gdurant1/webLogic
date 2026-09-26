/**
 * main.js — Application Entry Point
 * ---------------------------------------------------------------------------
 * Per javascript.md §10. Every other module is self-initializing: each
 * file's own IIFE attaches its listeners as soon as it runs, and because
 * all <script> tags sit at the end of <body> (see index.html), the DOM they
 * query is already fully parsed by the time they execute.
 *
 * This file only performs the one bit of work that genuinely has to wait
 * until *every* module has loaded: an initial evaluate()/rebuild() pass, so
 * the truth-tables panel and any signal coloring are correct from the very
 * first frame even before the user touches anything.
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        if (window.LogicModule) window.LogicModule.evaluate();
        if (window.TablesModule) window.TablesModule.rebuild();
    });
})();
