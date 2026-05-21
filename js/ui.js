export function waitForPaint() {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

export function setStatusPanel(panel, titleEl, messageEl, title, message, state = 'loading') {
    if (!panel) return;
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    panel.classList.add('is-visible');
    panel.classList.toggle('done', state === 'done');
    panel.setAttribute('aria-hidden', 'false');
}

export function hideStatusPanel(panel) {
    if (!panel) return;
    panel.classList.remove('is-visible', 'done');
    panel.setAttribute('aria-hidden', 'true');
}

export function registerServiceWorker(scriptUrl = './sw.js') {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register(scriptUrl)
            .then(() => console.log('✅ ServiceWorker 註冊成功'))
            .catch(err => console.log('❌ ServiceWorker 註冊失敗:', err));
    });
}

export function watchGlobal(name, onReady, onError, { timeoutMs = 30000, intervalMs = 80 } = {}) {
    const startedAt = Date.now();
    let settled = false;

    const timer = setInterval(() => {
        if (window[name]) {
            settled = true;
            clearInterval(timer);
            onReady();
            return;
        }

        if (Date.now() - startedAt > timeoutMs) {
            settled = true;
            clearInterval(timer);
            if (onError) onError(new Error(`${name} 載入逾時`));
        }
    }, intervalMs);

    return () => {
        if (settled) return;
        clearInterval(timer);
    };
}
