export function canvasToBlobAsync(canvas, type = 'image/jpeg', quality = 0.95) {
    return new Promise(resolve => {
        canvas.toBlob(resolve, type, quality);
    });
}

function loadImageFromObjectUrl(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('圖片載入失敗'));
        image.src = url;
    });
}

export async function prepareImageFile(file, {
    getSourceImageMaxDimension,
    setStatus,
    waitForPaint,
    formatDimensions
}) {
    const tempUrl = URL.createObjectURL(file);

    try {
        const tempImg = await loadImageFromObjectUrl(tempUrl);
        const originalWidth = tempImg.width;
        const originalHeight = tempImg.height;
        const maxSourceDim = getSourceImageMaxDimension(originalWidth, originalHeight);
        let width = originalWidth;
        let height = originalHeight;

        setStatus('正在檢查圖片', `原始尺寸 ${formatDimensions(originalWidth, originalHeight)}，正在準備可編輯版本。`);
        await waitForPaint();

        if (width > maxSourceDim || height > maxSourceDim) {
            console.log(`📸 圖片過大 (${originalWidth}x${originalHeight})，執行防閃退預縮放至長邊 ${maxSourceDim}px...`);
            setStatus('正在最佳化圖片', '高解析照片較大，正在縮小到手機較穩定的處理尺寸。');
            await waitForPaint();

            const ratio = Math.min(maxSourceDim / width, maxSourceDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);

            const offCanvas = document.createElement('canvas');
            offCanvas.width = width;
            offCanvas.height = height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(tempImg, 0, 0, width, height);

            const blob = await canvasToBlobAsync(offCanvas, 'image/jpeg', 0.95);
            if (!blob) throw new Error('圖片預縮放失敗');

            return {
                file: new File([blob], file.name, { type: 'image/jpeg' }),
                sourceImageInfo: {
                    originalWidth,
                    originalHeight,
                    workingWidth: width,
                    workingHeight: height,
                    maxSourceDim,
                    wasPreScaled: true
                }
            };
        }

        return {
            file,
            sourceImageInfo: {
                originalWidth,
                originalHeight,
                workingWidth: width,
                workingHeight: height,
                maxSourceDim,
                wasPreScaled: false
            }
        };
    } finally {
        URL.revokeObjectURL(tempUrl);
    }
}
