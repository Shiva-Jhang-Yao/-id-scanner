const JSPDF_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

let jsPdfLoadPromise = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`載入失敗：${src}`));
        document.head.appendChild(script);
    });
}

export async function getJsPdfConstructor() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;

    if (!jsPdfLoadPromise) {
        jsPdfLoadPromise = loadScript(JSPDF_CDN_URL);
    }

    await jsPdfLoadPromise;

    if (!window.jspdf?.jsPDF) {
        throw new Error('PDF 套件尚未載入完成');
    }

    return window.jspdf.jsPDF;
}

export function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('圖片載入失敗'));
        img.src = dataUrl;
    });
}

export function fitImageToA4(img, {
    pageWidth = 210,
    pageHeight = 297,
    margin = 10
} = {}) {
    const imgRatio = img.width / img.height;
    let imgWidth = pageWidth - margin * 2;
    let imgHeight = imgWidth / imgRatio;

    if (imgHeight > pageHeight - margin * 2) {
        imgHeight = pageHeight - margin * 2;
        imgWidth = imgHeight * imgRatio;
    }

    return {
        x: (pageWidth - imgWidth) / 2,
        y: margin,
        width: imgWidth,
        height: imgHeight
    };
}
