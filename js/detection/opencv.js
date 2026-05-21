export function disposeCvResources(...resources) {
    resources.forEach(resource => {
        if (!resource || typeof resource.delete !== 'function') return;
        try {
            if (typeof resource.isDeleted === 'function' && resource.isDeleted()) return;
            resource.delete();
        } catch (err) {
            console.warn('OpenCV 資源釋放失敗', err);
        }
    });
}

export function createDetectionMatFromImage(cv, imageObj, targetHeight = 500) {
    let ratio = imageObj.height / targetHeight;
    if (ratio < 1.0) ratio = 1.0;

    const detectWidth = Math.max(1, Math.round(imageObj.width / ratio));
    const detectHeight = Math.max(1, Math.round(imageObj.height / ratio));
    const detectCanvas = document.createElement('canvas');
    detectCanvas.width = detectWidth;
    detectCanvas.height = detectHeight;
    detectCanvas.getContext('2d').drawImage(imageObj, 0, 0, detectWidth, detectHeight);

    return {
        mat: cv.imread(detectCanvas),
        ratio
    };
}
