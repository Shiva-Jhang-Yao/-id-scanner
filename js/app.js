import { initScannerApp } from './canvas-editor.js';
import { registerServiceWorker, watchGlobal } from './ui.js';

const scannerApp = initScannerApp();

// Keeps iOS Safari :active button feedback working without inline handlers.
document.body.addEventListener('touchstart', () => {}, { passive: true });

registerServiceWorker('./sw.js');

watchGlobal('tf', scannerApp.onTensorFlowReady, scannerApp.onTensorFlowError, {
    timeoutMs: 30000,
    intervalMs: 80
});

watchGlobal('cv', () => {
    if (window.cv?.Mat) {
        scannerApp.onOpenCvReady();
        return;
    }

    const previousRuntimeReady = window.cv.onRuntimeInitialized;
    window.cv.onRuntimeInitialized = () => {
        if (typeof previousRuntimeReady === 'function') previousRuntimeReady();
        scannerApp.onOpenCvReady();
    };
}, scannerApp.onOpenCvError, {
    timeoutMs: 30000,
    intervalMs: 80
});
