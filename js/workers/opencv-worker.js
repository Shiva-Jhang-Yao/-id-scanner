/**
 * OpenCV.js Web Worker
 * ---------------------------------
 * 這支 worker 只做一件事：接收主緒送來的 image + 參數，跑完整條 warp / enhance /
 * sharpen / binarize 管線，回傳結果 Blob。主緒因此不會卡住渲染 & 手勢。
 *
 * 訊息格式：
 *   { id, type: 'ping' }               → 回 { id, ok: true } 代表 opencv 已就緒
 *   { id, type: 'process', payload }   → 回 { id, ok: true, blob, width, height }
 *
 * payload:
 *   {
 *     imageBitmap: ImageBitmap (transferable),
 *     points: [{x,y}, {x,y}, {x,y}, {x,y}],
 *     aspectRatio: number,   // 0 = 自由比例
 *     outputRes: number,     // 0 = 不限
 *     filters: {
 *       whiteBalance, shadow, denoise (0~1), brightness (-100~100),
 *       contrast (0~3), saturate (0~3), sharp (0~2), grayscale, binarize
 *     }
 *   }
 */

/* eslint-disable no-restricted-globals */
importScripts('https://docs.opencv.org/4.8.0/opencv.js');

let cvReadyResolve;
const cvReadyPromise = new Promise((res) => { cvReadyResolve = res; });
// opencv.js 在 worker 中會非同步 initialize；我們用 onRuntimeInitialized 判斷
if (typeof cv !== 'undefined') {
    if (cv.Mat) cvReadyResolve();
    else cv.onRuntimeInitialized = () => cvReadyResolve();
}

// -------- 輕量 Mat pool --------
// 用 (rows,cols,type) 當 key，回收後放進 free list 供下次 borrow 重用，
// 減少反覆 alloc/dispose 造成的 GC 停頓。
const matPool = {
    cap: 8,
    free: new Map(),
    key(rows, cols, type) { return `${rows}x${cols}x${type}`; },
    borrow(rows, cols, type) {
        const k = this.key(rows, cols, type);
        const list = this.free.get(k);
        if (list && list.length) return list.pop();
        return new cv.Mat(rows, cols, type);
    },
    release(mat) {
        if (!mat) return;
        if (typeof mat.isDeleted === 'function' && mat.isDeleted()) return;
        try {
            const k = this.key(mat.rows, mat.cols, mat.type());
            let list = this.free.get(k);
            if (!list) { list = []; this.free.set(k, list); }
            if (list.length < this.cap) list.push(mat);
            else mat.delete();
        } catch (_) {
            try { mat.delete(); } catch (__) {}
        }
    },
    drain() {
        for (const list of this.free.values()) {
            for (const m of list) { try { m.delete(); } catch (_) {} }
        }
        this.free.clear();
    }
};
function safeDelete(mat) {
    if (!mat) return;
    if (typeof mat.isDeleted === 'function' && mat.isDeleted()) return;
    try { mat.delete(); } catch (_) {}
}

// -------- 影像 pipeline --------
async function processImage(payload) {
    await cvReadyPromise;
    const { imageBitmap, points, aspectRatio, outputRes, filters } = payload;
    const width = imageBitmap.width;
    const height = imageBitmap.height;

    // 1. 把 ImageBitmap 畫到 OffscreenCanvas，讀取為 ImageData 供 cv.matFromImageData 用
    const bmpCanvas = new OffscreenCanvas(width, height);
    const bctx = bmpCanvas.getContext('2d');
    bctx.drawImage(imageBitmap, 0, 0);
    if (typeof imageBitmap.close === 'function') imageBitmap.close();
    const imageData = bctx.getImageData(0, 0, width, height);

    let src = null, srcTri = null, dstTri = null, perspectiveTransform = null;
    let warped = null;
    let baseEnhanced = null;
    let sharpBlur = null;
    let tempImg = null;
    let hsv = null;
    let channels = null;
    let saturationChannel = null;
    let finalResult = null;
    let grayMat = null;

    try {
        src = cv.matFromImageData(imageData);

        // -------- Step 1: 依順時針排序四點並確保頂邊為最長邊 --------
        const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
        const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
        const sortedPoints = [...points].sort((a, b) =>
            Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
        );
        const dists = [];
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            dists.push(Math.hypot(sortedPoints[i].x - sortedPoints[next].x,
                                   sortedPoints[i].y - sortedPoints[next].y));
        }
        const maxIdx = dists.indexOf(Math.max(...dists));
        if (maxIdx === 1 || maxIdx === 3) sortedPoints.push(sortedPoints.shift());
        const tl = sortedPoints[0], tr = sortedPoints[1],
              br = sortedPoints[2], bl = sortedPoints[3];

        srcTri = cv.matFromArray(4, 1, cv.CV_32FC2,
            [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);

        const wA = Math.hypot(br.x - bl.x, br.y - bl.y);
        const wB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
        const maxWidth = Math.max(wA, wB);
        const hA = Math.hypot(tr.x - br.x, tr.y - br.y);
        const hB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
        const maxHeight = Math.max(hA, hB);

        let finalW, finalH;
        if (!aspectRatio || aspectRatio === 0) {
            finalW = Math.round(maxWidth);
            finalH = Math.round(maxHeight);
        } else {
            const baseLong = Math.max(maxWidth, maxHeight);
            if (maxWidth >= maxHeight) {
                finalW = Math.round(baseLong);
                finalH = Math.round(baseLong / aspectRatio);
            } else {
                finalH = Math.round(baseLong);
                finalW = Math.round(baseLong / aspectRatio);
            }
        }
        const currentMaxDim = Math.max(finalW, finalH);
        if (outputRes > 0 && currentMaxDim > outputRes) {
            const scale = outputRes / currentMaxDim;
            finalW = Math.round(finalW * scale);
            finalH = Math.round(finalH * scale);
        }

        // -------- Step 2: warp --------
        dstTri = cv.matFromArray(4, 1, cv.CV_32FC2,
            [0, 0, finalW - 1, 0, finalW - 1, finalH - 1, 0, finalH - 1]);
        perspectiveTransform = cv.getPerspectiveTransform(srcTri, dstTri);
        warped = matPool.borrow(finalH, finalW, cv.CV_8UC4);
        cv.warpPerspective(src, warped, perspectiveTransform,
            new cv.Size(finalW, finalH), cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());

        // -------- Step 3a: white balance (gray-world) --------
        if (filters.whiteBalance) {
            try {
                cv.cvtColor(warped, warped, cv.COLOR_RGBA2RGB, 0);
                const wbChannels = new cv.MatVector();
                cv.split(warped, wbChannels);
                const means = [
                    cv.mean(wbChannels.get(0))[0],
                    cv.mean(wbChannels.get(1))[0],
                    cv.mean(wbChannels.get(2))[0]
                ];
                const target = (means[0] + means[1] + means[2]) / 3;
                for (let ch = 0; ch < 3; ch++) {
                    const scale = target / Math.max(1, means[ch]);
                    const single = wbChannels.get(ch);
                    single.convertTo(single, -1, scale, 0);
                    wbChannels.set(ch, single);
                }
                cv.merge(wbChannels, warped);
                wbChannels.delete();
                cv.cvtColor(warped, warped, cv.COLOR_RGB2RGBA, 0);
            } catch (_) {}
        }

        // -------- Step 3b: shadow removal (background estimation) --------
        if (filters.shadow) {
            let workRGB = null;
            try {
                workRGB = matPool.borrow(warped.rows, warped.cols, cv.CV_8UC3);
                cv.cvtColor(warped, workRGB, cv.COLOR_RGBA2RGB, 0);
                const bgChannels = new cv.MatVector();
                cv.split(workRGB, bgChannels);
                const shortSide = Math.min(warped.cols, warped.rows);
                let kSize = Math.max(15, Math.floor(shortSide / 40));
                if (kSize % 2 === 0) kSize += 1;
                const morphK = cv.Mat.ones(kSize, kSize, cv.CV_8U);
                const background = new cv.MatVector();
                for (let ch = 0; ch < 3; ch++) {
                    const bg = new cv.Mat();
                    cv.morphologyEx(bgChannels.get(ch), bg, cv.MORPH_CLOSE, morphK);
                    cv.GaussianBlur(bg, bg, new cv.Size(0, 0), shortSide / 40, shortSide / 40);
                    background.push_back(bg);
                    bg.delete();
                }
                morphK.delete();
                const normalized = new cv.MatVector();
                for (let ch = 0; ch < 3; ch++) {
                    const fgF = new cv.Mat();
                    const bgF = new cv.Mat();
                    bgChannels.get(ch).convertTo(fgF, cv.CV_32F);
                    background.get(ch).convertTo(bgF, cv.CV_32F);
                    bgF.convertTo(bgF, cv.CV_32F, 1, 1);
                    const divMat = new cv.Mat();
                    cv.divide(fgF, bgF, divMat, 255, -1);
                    const out = new cv.Mat();
                    divMat.convertTo(out, cv.CV_8U);
                    normalized.push_back(out);
                    fgF.delete();
                    bgF.delete();
                    divMat.delete();
                    out.delete();
                }
                cv.merge(normalized, workRGB);
                cv.cvtColor(workRGB, warped, cv.COLOR_RGB2RGBA, 0);
                bgChannels.delete();
                background.delete();
                normalized.delete();
            } catch (_) {} finally {
                matPool.release(workRGB);
            }
        }

        // -------- Step 3c: denoise (bilateralFilter) --------
        if (filters.denoise > 0) {
            try {
                cv.cvtColor(warped, warped, cv.COLOR_RGBA2RGB, 0);
                const d = 5 + 2 * Math.floor(filters.denoise * 3);
                const sigmaColor = 30 + filters.denoise * 60;
                const sigmaSpace = 30 + filters.denoise * 60;
                const denoisedMat = new cv.Mat();
                cv.bilateralFilter(warped, denoisedMat, d, sigmaColor, sigmaSpace);
                denoisedMat.copyTo(warped);
                denoisedMat.delete();
                cv.cvtColor(warped, warped, cv.COLOR_RGB2RGBA, 0);
            } catch (_) {
                const ksize = 3 + 2 * Math.floor(filters.denoise * 3);
                cv.cvtColor(warped, warped, cv.COLOR_RGBA2RGB, 0);
                cv.medianBlur(warped, warped, ksize);
                cv.cvtColor(warped, warped, cv.COLOR_RGB2RGBA, 0);
            }
        }

        // -------- Step 4: unsharp mask --------
        baseEnhanced = matPool.borrow(warped.rows, warped.cols, warped.type());
        warped.copyTo(baseEnhanced);
        if (filters.sharp > 0) {
            try {
                sharpBlur = matPool.borrow(warped.rows, warped.cols, warped.type());
                cv.GaussianBlur(warped, sharpBlur, new cv.Size(0, 0), 1.5, 1.5);
                cv.addWeighted(warped, 1 + filters.sharp, sharpBlur, -filters.sharp, 0, baseEnhanced);
            } catch (_) {}
        }

        // -------- Step 5: saturation --------
        tempImg = matPool.borrow(baseEnhanced.rows, baseEnhanced.cols, baseEnhanced.type());
        baseEnhanced.copyTo(tempImg);
        if (filters.saturate !== 1.0) {
            hsv = new cv.Mat();
            cv.cvtColor(baseEnhanced, hsv, cv.COLOR_RGBA2RGB);
            cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
            channels = new cv.MatVector();
            cv.split(hsv, channels);
            saturationChannel = channels.get(1);
            saturationChannel.convertTo(saturationChannel, -1, filters.saturate, 0);
            channels.set(1, saturationChannel);
            cv.merge(channels, hsv);
            cv.cvtColor(hsv, tempImg, cv.COLOR_HSV2RGB);
            cv.cvtColor(tempImg, tempImg, cv.COLOR_RGB2RGBA);
        }

        // -------- Step 6: brightness / contrast --------
        finalResult = matPool.borrow(tempImg.rows, tempImg.cols, tempImg.type());
        tempImg.convertTo(finalResult, -1, filters.contrast, filters.brightness);

        // -------- Step 7: grayscale / binarize --------
        if (filters.grayscale || filters.binarize) {
            grayMat = new cv.Mat();
            cv.cvtColor(finalResult, grayMat, cv.COLOR_RGBA2GRAY, 0);
            if (filters.binarize) {
                const shortSide = Math.min(grayMat.cols, grayMat.rows);
                let block = Math.max(15, Math.floor(shortSide / 30));
                if (block % 2 === 0) block += 1;
                block = Math.min(block, 51);
                cv.adaptiveThreshold(grayMat, grayMat, 255,
                    cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 8);
            }
            cv.cvtColor(grayMat, finalResult, cv.COLOR_GRAY2RGBA, 0);
        }

        // -------- Step 8: 輸出 --------
        // 直接把 finalResult.data 包成 ImageData 再放到 OffscreenCanvas
        const outW = finalResult.cols;
        const outH = finalResult.rows;
        const outCanvas = new OffscreenCanvas(outW, outH);
        const octx = outCanvas.getContext('2d');
        // finalResult 是 CV_8UC4，data 為 Uint8Array，長度 = outW * outH * 4
        const buf = new Uint8ClampedArray(finalResult.data.buffer,
            finalResult.data.byteOffset, finalResult.data.byteLength);
        const outData = new ImageData(new Uint8ClampedArray(buf), outW, outH);
        octx.putImageData(outData, 0, 0);
        const blob = await outCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });

        return { blob, width: outW, height: outH };
    } finally {
        matPool.release(warped);
        matPool.release(baseEnhanced);
        matPool.release(sharpBlur);
        matPool.release(tempImg);
        matPool.release(finalResult);
        safeDelete(src);
        safeDelete(srcTri);
        safeDelete(dstTri);
        safeDelete(perspectiveTransform);
        safeDelete(hsv);
        safeDelete(channels);
        safeDelete(saturationChannel);
        safeDelete(grayMat);
    }
}

self.onmessage = async (e) => {
    const { id, type, payload } = e.data || {};
    try {
        if (type === 'ping') {
            await cvReadyPromise;
            self.postMessage({ id, ok: true, matPoolCap: matPool.cap });
        } else if (type === 'process') {
            const result = await processImage(payload);
            self.postMessage({ id, ok: true, blob: result.blob, width: result.width, height: result.height });
        } else if (type === 'drain') {
            matPool.drain();
            self.postMessage({ id, ok: true });
        }
    } catch (err) {
        console.error('[opencv-worker] error', err);
        self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
    }
};
