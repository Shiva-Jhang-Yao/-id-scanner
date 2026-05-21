import { createAppState } from './state.js';
import { waitForPaint, setStatusPanel, hideStatusPanel } from './ui.js';
import { prepareImageFile } from './image-loader.js';
import { getJsPdfConstructor, loadImageFromDataUrl } from './pdf-export.js';
import { disposeCvResources, createDetectionMatFromImage } from './detection/opencv.js';
import { loadYoloModelAssets } from './detection/yolo.js';

export function initScannerApp() {
    // ==========================================
    // 1. DOM 元素綁定與初始化
    // ==========================================
    const cameraInput = document.getElementById('cameraInput');
    const galleryInput = document.getElementById('galleryInput');
    const btnCamera = document.getElementById('btnCamera');
    const btnGallery = document.getElementById('btnGallery');
    const uploadCard = document.getElementById('uploadCard');
    const editorCard = document.getElementById('editorCard');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const processBtn = document.getElementById('processBtn');
    const resetBtn = document.getElementById('resetBtn');
    const loading = document.getElementById('loading');
    const imagePrepStatus = document.getElementById('imagePrepStatus');
    const imagePrepTitle = document.getElementById('imagePrepTitle');
    const imagePrepMessage = document.getElementById('imagePrepMessage');
    const imageAnalysisStatus = document.getElementById('imageAnalysisStatus');
    const imageAnalysisTitle = document.getElementById('imageAnalysisTitle');
    const imageAnalysisMessage = document.getElementById('imageAnalysisMessage');
    const engineStatus = document.getElementById('cvLoading');
    const engineStatusText = document.getElementById('engineStatusText');
    const downloadJpgBtn = document.getElementById('downloadJpgBtn');
    const addToPdfBtn = document.getElementById('addToPdfBtn');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const shareBtn = document.getElementById('shareBtn');
    const reeditBtn = document.getElementById('reeditBtn');
    const btnRotate = document.getElementById('btnRotate');
    const floatingControls = document.getElementById('floatingControls');
    const openFiltersBtn = document.getElementById('openFiltersBtn');
    const closeFiltersBtn = document.getElementById('closeFiltersBtn');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const pdfCart = document.getElementById('pdfCart');
    const pdfPageCount = document.getElementById('pdfPageCount');
    const btnClearPdfCart = document.getElementById('btnClearPdfCart');
    const btnGenerateMultiPdf = document.getElementById('btnGenerateMultiPdf');
    const btnPreviewPdfCart = document.getElementById('btnPreviewPdfCart');
    const pdfPreviewModal = document.getElementById('pdfPreviewModal');
    const btnClosePreview = document.getElementById('btnClosePreview');
    const pdfPreviewGallery = document.getElementById('pdfPreviewGallery');
    const pdfPreviewEmpty = document.getElementById('pdfPreviewEmpty');
    const btnRetake = document.getElementById('btnRetake');
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    const uploadButtons = Array.from(uploadCard.querySelectorAll('button'));

    // 吸附力道 UI 控制
    const autoSnapCheckbox = document.getElementById('autoSnap');
    const snapStrengthContainer = document.getElementById('snapStrengthContainer');
    const snapStrengthSlider = document.getElementById('snapStrength');
    const snapStrengthValue = document.getElementById('snapStrengthValue');

    const strengthTextMap = { 1: '最弱', 2: '弱', 3: '中', 4: '強', 5: '最強' };

    function updateSnapUI() {
        const isChecked = autoSnapCheckbox.checked;
        snapStrengthContainer.style.opacity = isChecked ? '1' : '0';
        snapStrengthContainer.style.pointerEvents = isChecked ? 'auto' : 'none';
        snapStrengthValue.textContent = strengthTextMap[snapStrengthSlider.value];
    }

    autoSnapCheckbox.addEventListener('change', updateSnapUI);
    snapStrengthSlider.addEventListener('input', () => {
        snapStrengthValue.textContent = strengthTextMap[snapStrengthSlider.value];
    });
    updateSnapUI(); // 初始化

    btnCamera.addEventListener('click', () => cameraInput.click());
    btnGallery.addEventListener('click', () => galleryInput.click());

    function setImagePrepStatus(title, message) {
        setStatusPanel(imagePrepStatus, imagePrepTitle, imagePrepMessage, title, message);
        uploadButtons.forEach(button => { button.disabled = true; });
    }

    function hideImagePrepStatus() {
        hideStatusPanel(imagePrepStatus);
        uploadButtons.forEach(button => { button.disabled = false; });
    }

    function setImageAnalysisStatus(title, message, state = 'loading') {
        setStatusPanel(imageAnalysisStatus, imageAnalysisTitle, imageAnalysisMessage, title, message, state);
    }

    function hideImageAnalysisStatus() {
        hideStatusPanel(imageAnalysisStatus);
    }

    function finishImageAnalysisStatus(message) {
        setImageAnalysisStatus('分析完成', message, 'done');
        setTimeout(() => {
            hideImageAnalysisStatus();
        }, 1200);
    }

    // ==========================================
    // 2. 全域狀態變數 (Global State)
    // ==========================================
    const state = createAppState();

    // 控制多頁購物車面板的顯示狀態 (編輯模式時隱藏以免擋住畫面)
    function updatePdfCartVisibility() {
        const isEditorActive = document.getElementById('editorCard').style.display === 'block';
        pdfCart.style.display = (state.pdfPages.length > 0 && !isEditorActive) ? 'block' : 'none';
    }

    // 檢查瀏覽器是否支援 Web Share API，若支援則顯示分享按鈕
    if (navigator.share) {
        shareBtn.style.display = 'block';
    }
    let imageObj = new Image();

    function revokeCurrentImageObjectUrl() {
        if (!state.currentImageObjectUrl) return;
        URL.revokeObjectURL(state.currentImageObjectUrl);
        state.currentImageObjectUrl = null;
    }

    function setImageSourceFromFile(file) {
        const nextUrl = URL.createObjectURL(file);
        revokeCurrentImageObjectUrl();
        state.currentImageObjectUrl = nextUrl;
        imageObj.src = nextUrl;
    }

    function setImageSourceFromDataUrl(dataUrl) {
        revokeCurrentImageObjectUrl();
        imageObj.src = dataUrl;
    }

    function formatDimensions(width, height) {
        return `${Math.round(width)} x ${Math.round(height)}`;
    }

    function getSourceImageMaxDimension(originalWidth, originalHeight) {
        const selectedRatio = parseFloat(document.getElementById('aspectRatio').value);
        const deviceMemory = Number(navigator.deviceMemory) || 4;
        const isHighDetailDocument = selectedRatio === 1.414 || selectedRatio === 0;
        const megapixels = (originalWidth * originalHeight) / 1000000;
        const isHighResolutionPhoto = megapixels >= 8;

        if (deviceMemory < 4) {
            return isHighDetailDocument ? 2400 : 2000;
        }

        return (isHighDetailDocument || isHighResolutionPhoto) ? 3000 : 2400;
    }

    function getSourceQualityMessage() {
        if (!state.sourceImageInfo || !state.sourceImageInfo.wasPreScaled) return '';

        return `已為避免手機記憶體不足，將原圖 ${formatDimensions(state.sourceImageInfo.originalWidth, state.sourceImageInfo.originalHeight)} 預縮到 ${formatDimensions(state.sourceImageInfo.workingWidth, state.sourceImageInfo.workingHeight)}；「目前載入畫質」會以這個尺寸裁切。`;
    }

    function updateSourceQualityNotice() {
        const message = getSourceQualityMessage();
        ['sourceImageNotice', 'resultSourceInfo'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = message;
            el.style.display = message ? 'block' : 'none';
        });
    }

    function analyzeImageQuality() {
        if (!imageObj.width || !imageObj.height) return [];

        const issues = [];
        const maxDim = 320;
        const scale = Math.min(maxDim / imageObj.width, maxDim / imageObj.height, 1);
        const width = Math.max(1, Math.round(imageObj.width * scale));
        const height = Math.max(1, Math.round(imageObj.height * scale));
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = width;
        sampleCanvas.height = height;
        const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
        sampleCtx.drawImage(imageObj, 0, 0, width, height);

        const pixels = sampleCtx.getImageData(0, 0, width, height).data;
        const gray = new Float32Array(width * height);
        let sum = 0;
        let sumSq = 0;
        let veryBright = 0;
        let veryDark = 0;

        for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
            const value = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
            gray[p] = value;
            sum += value;
            sumSq += value * value;
            if (value > 245) veryBright++;
            if (value < 10) veryDark++;
        }

        const total = gray.length;
        const mean = sum / total;
        const stdDev = Math.sqrt(Math.max(0, sumSq / total - mean * mean));
        const brightRatio = veryBright / total;
        const darkRatio = veryDark / total;

        let lapSum = 0;
        let lapSumSq = 0;
        let lapCount = 0;
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const lap = -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - width] + gray[idx + width];
                lapSum += lap;
                lapSumSq += lap * lap;
                lapCount++;
            }
        }

        const blurScore = lapCount > 0 ? (lapSumSq / lapCount) - (lapSum / lapCount) ** 2 : 0;
        const minSide = Math.min(imageObj.width, imageObj.height);
        const maxSide = Math.max(imageObj.width, imageObj.height);

        if (maxSide < 1200 || minSide < 700) {
            issues.push(`解析度偏低 (${formatDimensions(imageObj.width, imageObj.height)})，細字或 A4 文件可能不清楚。`);
        }
        if (blurScore < 15) {
            issues.push('照片明顯偏糊，建議重拍並保持手機穩定。');
        } else if (blurScore < 35) {
            issues.push('照片銳利度偏低，若文字很小，建議放大對焦後重拍。');
        }
        if (brightRatio > 0.45 && mean > 210) {
            issues.push('亮部比例過高，若有反光或文字泛白，建議避開強光重拍。');
        }
        if (darkRatio > 0.35 && mean < 70) {
            issues.push('畫面偏暗，建議增加照明後重拍。');
        }
        if (stdDev < 18) {
            issues.push('整體對比偏低，文件邊界或文字可能不容易辨識。');
        }

        return issues;
    }

    function getPolygonArea(poly) {
        if (poly.length !== 4) return 0;
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const next = poly[(i + 1) % poly.length];
            area += poly[i].x * next.y - next.x * poly[i].y;
        }
        return Math.abs(area) / 2;
    }

    function orientation(a, b, c) {
        return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    }

    function segmentsIntersect(a, b, c, d) {
        const o1 = orientation(a, b, c);
        const o2 = orientation(a, b, d);
        const o3 = orientation(c, d, a);
        const o4 = orientation(c, d, b);
        return (o1 * o2 < 0) && (o3 * o4 < 0);
    }

    function getCropQualityIssues() {
        if (points.length !== 4 || !imageObj.width || !imageObj.height) return [];

        const issues = [];
        const imageArea = imageObj.width * imageObj.height;
        const cropAreaRatio = getPolygonArea(points) / imageArea;
        const minMargin = Math.min(
            ...points.map(p => Math.min(p.x, p.y, imageObj.width - p.x, imageObj.height - p.y))
        );
        const minMarginRatio = minMargin / Math.max(imageObj.width, imageObj.height);

        if (segmentsIntersect(points[0], points[1], points[2], points[3]) || segmentsIntersect(points[1], points[2], points[3], points[0])) {
            issues.push('裁切框疑似交叉，請重新調整四個角的位置。');
        }
        if (cropAreaRatio < 0.08) {
            issues.push('文件在照片中占比偏小，建議靠近一點重拍以保留細節。');
        } else if (cropAreaRatio > 0.92) {
            issues.push('文件幾乎貼滿照片，邊界可能被裁掉，建議留一點外圍背景。');
        }
        if (minMarginRatio < 0.01) {
            issues.push('有角點太靠近照片邊緣，請確認證件四角沒有被拍掉。');
        }

        return issues;
    }

    function updateQualityCheckNotice() {
        const issues = [...state.imageQualityIssues, ...getCropQualityIssues()];
        const hasIssues = issues.length > 0;
        const message = hasIssues
            ? `品質提醒：${issues.join(' ')}`
            : '品質檢查通過：未發現明顯模糊、曝光或裁切框問題。';

        ['qualityCheckNotice', 'resultQualityInfo'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = message;
            el.classList.toggle('warning', hasIssues);
            el.classList.toggle('ok', !hasIssues);
            el.style.display = 'block';
        });
    }

    let points = []; // [{x, y}, {x, y}, {x, y}, {x, y}]
    let draggingIdx = -1;
    let selectedIdx = 0; // 紀錄目前被選中的點
    let isDragging = false; // 紀錄是否真的有發生拖曳移動
    let draggingEdgeIdx = -1; // 紀錄目前正在拖拉的「邊」
    let selectedEdgeIdx = -1; // 紀錄目前被選中的「邊」
    let lastEdgeDragPoint = null; // 紀錄邊緣拖曳的上一幀座標

    // ==========================================
    // 2.5 歷史紀錄 (Undo / Redo) 邏輯
    // ==========================================
    let pointsHistory = [];
    let historyIndex = -1;

    function savePointsState() {
        // 如果在返回上一步後又做了新操作，則清除未來的歷史紀錄
        if (historyIndex < pointsHistory.length - 1) {
            pointsHistory = pointsHistory.slice(0, historyIndex + 1);
        }
        // 將當前的 4 個點深度複製 (Deep Copy) 並推入堆疊
        pointsHistory.push(JSON.parse(JSON.stringify(points)));

        // 限制最多儲存 30 步，避免吃掉太多手機記憶體
        if (pointsHistory.length > 30) {
            pointsHistory.shift();
        } else {
            historyIndex++;
        }
        updateUndoRedoUI();
        updateQualityCheckNotice();
    }

    function updateUndoRedoUI() {
        btnUndo.disabled = historyIndex <= 0;
        btnRedo.disabled = historyIndex >= pointsHistory.length - 1;
    }

    btnUndo.addEventListener('click', () => {
        if (historyIndex > 0) {
            historyIndex--;
            points = JSON.parse(JSON.stringify(pointsHistory[historyIndex]));
            drawCanvas(); updateUndoRedoUI(); updateQualityCheckNotice();
        }
    });
    btnRedo.addEventListener('click', () => {
        if (historyIndex < pointsHistory.length - 1) {
            historyIndex++;
            points = JSON.parse(JSON.stringify(pointsHistory[historyIndex]));
            drawCanvas(); updateUndoRedoUI(); updateQualityCheckNotice();
        }
    });

    /**
     * 更新濾鏡狀態提示 (若有調整且面板收起時，顯示「已套用濾鏡」)
     */
    function updateFilterHint() {
        const b = document.getElementById('slider_b').value;
        const c = document.getElementById('slider_c').value;
        const s = document.getElementById('slider_s').value;
        const sharp = document.getElementById('slider_sharp').value;
        const denoise = document.getElementById('slider_denoise').value;
        const isGrayscale = document.getElementById('chkGrayscale').checked;
        const isBinarize = document.getElementById('chkBinarize').checked;
        const isModified = (b !== '100' || c !== '100' || s !== '100' || sharp !== '100' || denoise !== '0' || isGrayscale || isBinarize);
        const isPanelHidden = !floatingControls.classList.contains('visible');
        document.getElementById('filterActiveHint').style.display = (isModified && isPanelHidden) ? 'block' : 'none';
    }

    // ==========================================
    // 3. 畫布變換與 AI 引擎狀態
    // ==========================================
    let transform = { scale: 1, x: 0, y: 0 };
    let activePointers = new Map();
    let initialPinchDistance = null;
    let initialTransform = null;
    let initialPinchCenter = null;
    let lastPanPoint = null;

    function updateCanvasTransform() {
        canvas.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
    }

    function resetTransform() {
        transform = { scale: 1, x: 0, y: 0 };
        updateCanvasTransform();
    }

    // AI 與 OpenCV 引擎初始化
    let cvReady = false;
    let tfReady = typeof tf !== 'undefined';
    let yoloModel = null;
    let yoloClassNames = [];
    let yoloStatus = 'idle';
    let yoloLoadPromise = null;
    let yoloLoadScheduled = false;
    let engineStatusHideTimer = null;
    let pendingOpenCvAutoDetect = false;
    let allowDeferredAutoDetect = false;

    function setEngineStatus(message, state = 'loading') {
        if (!engineStatus || !engineStatusText) return;
        clearTimeout(engineStatusHideTimer);
        engineStatus.style.display = 'flex';
        engineStatus.classList.toggle('ready', state === 'ready');
        engineStatus.classList.toggle('warning', state === 'warning');
        engineStatusText.textContent = message;

        if (state === 'ready') {
            engineStatusHideTimer = setTimeout(() => {
                engineStatus.style.display = 'none';
            }, 2500);
        }
    }

    function updateEngineStatus() {
        if (!cvReady) {
            setEngineStatus('影像引擎正在背景載入；你可以先拍照或選取照片。');
            return;
        }

        if (yoloStatus === 'ready') {
            setEngineStatus('AI 模型已就緒。', 'ready');
        } else if (yoloStatus === 'failed') {
            setEngineStatus('基礎影像引擎已就緒；AI 模型暫不可用，將使用基礎偵測。', 'warning');
        } else {
            setEngineStatus('基礎影像引擎已就緒；AI 模型正在背景載入。');
        }
    }

    function updateProcessButtonState() {
        if (document.getElementById('editorCard').style.display !== 'block') return;
        processBtn.disabled = !cvReady;
        processBtn.textContent = cvReady ? '✂️ 裁切圖片' : '⏳ 影像引擎載入中';
    }

    async function runPendingOpenCvAutoDetect() {
        if (!pendingOpenCvAutoDetect || !allowDeferredAutoDetect || !cvReady) return;
        if (document.getElementById('editorCard').style.display !== 'block') return;

        pendingOpenCvAutoDetect = false;
        allowDeferredAutoDetect = false;
        setImageAnalysisStatus('正在尋找邊界', '影像引擎已載入，正在自動抓取文件邊界。');
        await waitForPaint();

        if (autoDetectCornersLocal()) {
            savePointsState();
            finishImageAnalysisStatus('已自動定位邊界，可以微調角點或直接裁切。');
        } else {
            updateQualityCheckNotice();
            finishImageAnalysisStatus('圖片已載入，可以手動調整角點。');
        }
    }

    function startYoloBackgroundLoad() {
        if (!tfReady || yoloLoadPromise || yoloLoadScheduled || yoloStatus === 'ready' || yoloStatus === 'failed') return;

        yoloLoadScheduled = true;
        yoloStatus = 'queued';
        updateEngineStatus();

        const startLoad = () => {
            yoloLoadScheduled = false;
            yoloLoadPromise = loadYoloModel();
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(startLoad, { timeout: 1500 });
        } else {
            setTimeout(startLoad, 800);
        }
    }


    async function loadYoloModel() {
        try {
            yoloStatus = 'loading';
            updateEngineStatus();

            const result = await loadYoloModelAssets({ tf: window.tf });
            yoloModel = result.model;
            yoloClassNames = result.classNames;
            yoloStatus = 'ready';
            updateEngineStatus();
            console.log('✅ YOLO 證件模型載入成功！');
            return true;
        } catch (e) {
            yoloModel = null;
            yoloStatus = 'failed';
            updateEngineStatus();
            console.warn('⚠️ YOLO 證件模型不可用，將自動使用 OpenCV 傳統邊緣偵測作為備案。', e);
            return false;
        }
    }

    function onTensorFlowReady() {
        tfReady = true;
        startYoloBackgroundLoad();
    }

    function onTensorFlowError() {
        tfReady = false;
        yoloStatus = 'failed';
        updateEngineStatus();
    }

    function onOpenCvReady() {
        cvReady = true;
        updateEngineStatus();
        updateProcessButtonState();
        runPendingOpenCvAutoDetect();
    }

    function onOpenCvError() {
        cvReady = false;
        setEngineStatus('影像引擎載入失敗，請重新整理頁面或確認網路連線。', 'warning');
    }

    updateEngineStatus();
    if (tfReady) startYoloBackgroundLoad();

    // 更新滑桿數字顯示
    ['b', 'c', 's', 'sharp', 'denoise'].forEach(id => {
        const slider = document.getElementById(`slider_${id}`);
        const valSpan = document.getElementById(`val_${id}`);
        slider.addEventListener('input', (e) => {
            let val = e.target.value;
            if (id !== 'b') val = (val / 100).toFixed(1);
            valSpan.textContent = val;
            drawCanvas(); // 拉動滑桿時即時重繪預覽
            updateFilterHint();
        });
    });

    // 核取方塊改變時也即時重繪預覽
    document.getElementById('chkGrayscale').addEventListener('change', () => {
        drawCanvas();
        updateFilterHint();
    });
    document.getElementById('chkBinarize').addEventListener('change', () => {
        drawCanvas();
        updateFilterHint();
    });

    // 將濾鏡重置邏輯獨立出來
    const resetFilters = () => {
        const defaults = { 'b': { val: 100, text: '100' }, 'c': { val: 100, text: '1.0' }, 's': { val: 100, text: '1.0' }, 'sharp': { val: 100, text: '1.0' }, 'denoise': { val: 0, text: '0.0' } };
        for (const id in defaults) {
            document.getElementById(`slider_${id}`).value = defaults[id].val;
            document.getElementById(`val_${id}`).textContent = defaults[id].text;
        }
        document.getElementById('chkGrayscale').checked = false;
        document.getElementById('chkBinarize').checked = false;
        drawCanvas(); // 重繪畫布以取消濾鏡效果
        updateFilterHint();
    };

    // 主畫面重置按鈕：重置濾鏡與畫布縮放狀態
    resetBtn.addEventListener('click', () => {
        resetFilters();
        resetTransform(); // 同時重置畫布的縮放與平移
    });

    // 懸浮面板重置按鈕：僅重置濾鏡
    resetFiltersBtn.addEventListener('click', resetFilters);

    // 處理濾鏡面板的展開與收起
    openFiltersBtn.addEventListener('click', () => {
        floatingControls.classList.add('visible');
        document.body.classList.add('controls-visible');
        updateFilterHint();
    });
    closeFiltersBtn.addEventListener('click', () => {
        floatingControls.classList.remove('visible');
        document.body.classList.remove('controls-visible');
        updateFilterHint();
    });

    // 將圖片載入完成的邏輯獨立出來，以便旋轉後能重複使用
    imageObj.onload = async () => {
        revokeCurrentImageObjectUrl();

        setImagePrepStatus('正在開啟編輯器', '正在建立裁切框與檢查圖片品質。');
        await waitForPaint();

        canvas.width = imageObj.width;
        canvas.height = imageObj.height;
        uploadCard.style.display = 'none'; // 隱藏首頁區塊，節省空間
        editorCard.style.display = 'block';
        document.getElementById('resultCard').style.display = 'none';
        hideImagePrepStatus();
        updatePdfCartVisibility();

        resetTransform(); // 載入新圖片時重置縮放狀態

        // 給預設的 4 個點 (內縮 10%)
        const w = imageObj.width, h = imageObj.height;
        const m = Math.min(w, h) * 0.1;
        points = [ {x: m, y: m}, {x: w-m, y: m}, {x: w-m, y: h-m}, {x: m, y: h-m} ];
        selectedIdx = 0; // 預設選取第一個點
        selectedEdgeIdx = -1;
        allowDeferredAutoDetect = true;
        pendingOpenCvAutoDetect = false;
        drawCanvas();
        updateFilterHint(); // 載入新圖時重置提示
        updateSourceQualityNotice();
        state.imageQualityIssues = analyzeImageQuality();

        setImageAnalysisStatus('正在分析圖片', '正在自動抓取文件邊界，完成後會顯示可調整的角點。');
        await waitForPaint();

        // 優先使用已就緒的 YOLO；模型還在背景載入時，直接使用 OpenCV 或預設裁切框。
        let autoDetected = false;
        if (yoloModel) {
            autoDetected = await runYoloInference();
        }
        if (!autoDetected) {
            if (cvReady) {
                setImageAnalysisStatus('正在尋找邊界', 'AI 尚未定位成功，正在改用本機影像偵測。');
                await waitForPaint();
                autoDetected = autoDetectCornersLocal();
                allowDeferredAutoDetect = false;
            } else {
                pendingOpenCvAutoDetect = true;
                setImageAnalysisStatus('等待影像引擎', '圖片已準備好，影像引擎載入後會自動嘗試抓取邊界。');
                setEngineStatus('照片已載入；影像引擎仍在背景載入，完成後會自動嘗試抓取邊界。');
            }
        }
        updateProcessButtonState();

        // 重置歷史紀錄，並儲存第一筆初始點位狀態
        pointsHistory = [];
        historyIndex = -1;
        savePointsState();

        if (!pendingOpenCvAutoDetect) {
            finishImageAnalysisStatus(autoDetected ? '已自動定位邊界，可以微調角點或直接裁切。' : '圖片已載入，可以手動調整角點。');
        }
    };

    imageObj.onerror = () => {
        hideImagePrepStatus();
        hideImageAnalysisStatus();
        alert('圖片載入失敗，請重新選取照片。');
    };

    // 處理照片選擇的共用邏輯 (加入記憶體防護預縮放)
    const handleFileSelect = async (e) => {
        if (!e.target.files[0]) return;
        let file = e.target.files[0];

        setImagePrepStatus('正在讀取圖片', '已收到照片，正在解碼並準備預覽。');
        await waitForPaint();

        try {
            const result = await prepareImageFile(file, {
                getSourceImageMaxDimension,
                setStatus: setImagePrepStatus,
                waitForPaint,
                formatDimensions
            });
            state.sourceImageInfo = result.sourceImageInfo;
            state.currentFile = result.file;
            setImageSourceFromFile(state.currentFile);
        } catch (err) {
            console.error('圖片準備失敗', err);
            hideImagePrepStatus();
            alert('圖片準備失敗，請重新選取照片。');
        }

        // 清空 input，確保即使重複選取同一張照片也能觸發更新
        e.target.value = '';
    };

    cameraInput.addEventListener('change', handleFileSelect);
    galleryInput.addEventListener('change', handleFileSelect);

    // 手機版專用：透過按鈕主動讀取剪貼簿 API
    const btnPaste = document.getElementById('btnPaste');
    if (btnPaste) {
        btnPaste.addEventListener('click', async () => {
            try {
                const clipboardItems = await navigator.clipboard.read();
                let foundImage = false;
                for (const clipboardItem of clipboardItems) {
                    for (const type of clipboardItem.types) {
                        if (type.startsWith('image/')) {
                            const blob = await clipboardItem.getType(type);
                            const file = new File([blob], "pasted_image.jpg", { type: type });
                            handleFileSelect({ target: { files: [file], value: '' } });
                            foundImage = true;
                            break;
                        }
                    }
                    if (foundImage) break;
                }
                if (!foundImage) {
                    alert('剪貼簿中沒有找到圖片喔！請先複製一張圖片再試一次。');
                }
            } catch (err) {
                console.error('讀取剪貼簿失敗:', err);
                alert('無法讀取剪貼簿。請確保網頁處於 HTTPS 安全連線，並允許剪貼簿讀取權限。');
            }
        });
    }

    // 支援從剪貼簿貼上照片
    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || window.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                handleFileSelect({ target: { files: [file], value: '' } }); // 模擬 input change 事件
                break; // 找到第一張圖片就停止並處理
            }
        }
    });

    // 處理圖片旋轉 90 度
    btnRotate.addEventListener('click', () => {
        if (!state.currentFile) return;

        // 建立離線畫布來進行影像旋轉
        const offCanvas = document.createElement('canvas');
        const offCtx = offCanvas.getContext('2d');
        offCanvas.width = imageObj.height;
        offCanvas.height = imageObj.width;

        // 旋轉 90 度並重繪
        offCtx.translate(offCanvas.width / 2, offCanvas.height / 2);
        offCtx.rotate(90 * Math.PI / 180);
        offCtx.drawImage(imageObj, -imageObj.width / 2, -imageObj.height / 2);

        // 將旋轉後的圖片轉回 File 物件，以便正確傳送給後端 API
        const dataUrl = offCanvas.toDataURL('image/jpeg', 0.95);
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--) { u8arr[n] = bstr.charCodeAt(n); }

        state.currentFile = new File([u8arr], "rotated.jpg", {type: mime});
        if (state.sourceImageInfo) {
            state.sourceImageInfo = {
                ...state.sourceImageInfo,
                originalWidth: state.sourceImageInfo.originalHeight,
                originalHeight: state.sourceImageInfo.originalWidth,
                workingWidth: offCanvas.width,
                workingHeight: offCanvas.height
            };
        }
        setImageSourceFromDataUrl(dataUrl); // 觸發 onload，自動重設畫布與呼叫 YOLO
    });

    function clampNumber(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function boxIoU(a, b) {
        const x1 = Math.max(a.x1, b.x1);
        const y1 = Math.max(a.y1, b.y1);
        const x2 = Math.min(a.x2, b.x2);
        const y2 = Math.min(a.y2, b.y2);
        const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
        const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
        return intersection / Math.max(1, areaA + areaB - intersection);
    }

    function applyNms(candidates, iouThreshold = 0.45) {
        const sorted = [...candidates].sort((a, b) => b.conf - a.conf);
        const kept = [];

        for (const candidate of sorted) {
            if (kept.every(item => boxIoU(item, candidate) < iouThreshold)) {
                kept.push(candidate);
            }
        }

        return kept;
    }

    function orderQuadrilateral(quad) {
        const sums = quad.map(p => p.x + p.y);
        const diffs = quad.map(p => p.x - p.y);
        return [
            quad[sums.indexOf(Math.min(...sums))],
            quad[diffs.indexOf(Math.max(...diffs))],
            quad[sums.indexOf(Math.max(...sums))],
            quad[diffs.indexOf(Math.min(...diffs))]
        ];
    }

    function isUsableQuad(quad) {
        if (!quad || quad.length !== 4) return false;
        if (quad.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;

        const uniqueCount = new Set(quad.map(p => `${Math.round(p.x)},${Math.round(p.y)}`)).size;
        if (uniqueCount < 4) return false;

        const areaRatio = getPolygonArea(quad) / Math.max(1, imageObj.width * imageObj.height);
        return areaRatio >= 0.03 && areaRatio <= 0.98;
    }

    function readYoloDetectionRows(outputTensor) {
        const squeezed = outputTensor.squeeze();
        if (squeezed.shape.length !== 2) {
            squeezed.dispose();
            throw new Error(`不支援的 YOLO 輸出形狀: ${outputTensor.shape.join('x')}`);
        }

        let rowsTensor = squeezed;
        if (squeezed.shape[0] < squeezed.shape[1]) {
            rowsTensor = squeezed.transpose();
            squeezed.dispose();
        }

        const rows = rowsTensor.arraySync();
        rowsTensor.dispose();
        return rows;
    }

    function buildYoloCandidates(rows, classIndex, classCount) {
        const inputSize = 640;
        const confThreshold = 0.3;
        const maskStart = 4 + classCount;
        const candidates = [];

        for (const row of rows) {
            const conf = row[4 + classIndex];
            if (!Number.isFinite(conf) || conf < confThreshold) continue;

            const cx = row[0], cy = row[1], w = row[2], h = row[3];
            const x1 = clampNumber(cx - w / 2, 0, inputSize);
            const y1 = clampNumber(cy - h / 2, 0, inputSize);
            const x2 = clampNumber(cx + w / 2, 0, inputSize);
            const y2 = clampNumber(cy + h / 2, 0, inputSize);
            if ((x2 - x1) < 5 || (y2 - y1) < 5) continue;

            candidates.push({
                conf,
                x1, y1, x2, y2,
                maskCoeffs: row.length > maskStart ? row.slice(maskStart) : []
            });
        }

        return candidates;
    }

    function getProtoLayout(protoTensor) {
        const shape = protoTensor.shape;
        if (shape.length === 4) {
            if (shape[1] <= 64) {
                return {
                    channels: shape[1],
                    height: shape[2],
                    width: shape[3],
                    index: (x, y, c) => ((c * shape[2] + y) * shape[3] + x)
                };
            }
            return {
                channels: shape[3],
                height: shape[1],
                width: shape[2],
                index: (x, y, c) => ((y * shape[2] + x) * shape[3] + c)
            };
        }

        if (shape.length === 3) {
            if (shape[0] <= 64) {
                return {
                    channels: shape[0],
                    height: shape[1],
                    width: shape[2],
                    index: (x, y, c) => ((c * shape[1] + y) * shape[2] + x)
                };
            }
            return {
                channels: shape[2],
                height: shape[0],
                width: shape[1],
                index: (x, y, c) => ((y * shape[1] + x) * shape[2] + c)
            };
        }

        return null;
    }

    function contourToMaskQuad(contour) {
        const peri = cv.arcLength(contour, true);
        const approx = new cv.Mat();

        try {
            for (const eps of [0.01, 0.02, 0.03, 0.04, 0.06, 0.08]) {
                cv.approxPolyDP(contour, approx, eps * peri, true);
                if (approx.rows === 4) {
                    const quad = [];
                    for (let i = 0; i < 4; i++) {
                        quad.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
                    }
                    return orderQuadrilateral(quad);
                }
            }
        } finally {
            disposeCvResources(approx);
        }

        const extreme = [];
        for (let i = 0; i < contour.rows; i++) {
            extreme.push({ x: contour.data32S[i * 2], y: contour.data32S[i * 2 + 1] });
        }
        if (extreme.length < 4) return null;
        return orderQuadrilateral(extreme);
    }

    function maskQuadToImagePoints(maskQuad, maskWidth, maskHeight) {
        const inputSize = 640;
        const scaleX = imageObj.width / inputSize;
        const scaleY = imageObj.height / inputSize;

        const mapped = maskQuad.map(p => ({
            x: clampNumber((p.x / Math.max(1, maskWidth - 1)) * inputSize * scaleX, 0, imageObj.width),
            y: clampNumber((p.y / Math.max(1, maskHeight - 1)) * inputSize * scaleY, 0, imageObj.height)
        }));

        return orderQuadrilateral(mapped);
    }

    function tryDecodeYoloMaskQuad(protoTensor, detection) {
        if (!cvReady || !protoTensor || !detection.maskCoeffs.length) return null;

        const layout = getProtoLayout(protoTensor);
        if (!layout || detection.maskCoeffs.length < layout.channels) return null;

        const protoData = protoTensor.dataSync();
        const inputSize = 640;
        const x1 = Math.floor((detection.x1 / inputSize) * layout.width);
        const y1 = Math.floor((detection.y1 / inputSize) * layout.height);
        const x2 = Math.ceil((detection.x2 / inputSize) * layout.width);
        const y2 = Math.ceil((detection.y2 / inputSize) * layout.height);

        let mask = null;
        let contours = null;
        let hierarchy = null;
        let kernel = null;
        let bestContour = null;

        try {
            mask = cv.Mat.zeros(layout.height, layout.width, cv.CV_8UC1);

            for (let y = Math.max(0, y1); y < Math.min(layout.height, y2); y++) {
                for (let x = Math.max(0, x1); x < Math.min(layout.width, x2); x++) {
                    let value = 0;
                    for (let c = 0; c < layout.channels; c++) {
                        value += detection.maskCoeffs[c] * protoData[layout.index(x, y, c)];
                    }
                    const probability = 1 / (1 + Math.exp(-value));
                    if (probability > 0.5) mask.ucharPtr(y, x)[0] = 255;
                }
            }

            kernel = cv.Mat.ones(3, 3, cv.CV_8U);
            cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 1);

            contours = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let bestArea = 0;
            for (let i = 0; i < contours.size(); i++) {
                const contour = contours.get(i);
                const area = cv.contourArea(contour);
                if (area > bestArea) {
                    if (bestContour) bestContour.delete();
                    bestContour = contour;
                    bestArea = area;
                } else {
                    contour.delete();
                }
            }

            if (!bestContour || bestArea < 20) return null;
            const maskQuad = contourToMaskQuad(bestContour);
            if (!maskQuad) return null;

            const imageQuad = maskQuadToImagePoints(maskQuad, layout.width, layout.height);
            return isUsableQuad(imageQuad) ? imageQuad : null;
        } catch (err) {
            console.warn('YOLO mask 後處理失敗，改用外框。', err);
            return null;
        } finally {
            disposeCvResources(bestContour, kernel, mask, contours, hierarchy);
        }
    }

    function detectionBoxToImagePoints(detection) {
        const scaleX = imageObj.width / 640;
        const scaleY = imageObj.height / 640;
        return [
            { x: detection.x1 * scaleX, y: detection.y1 * scaleY },
            { x: detection.x2 * scaleX, y: detection.y1 * scaleY },
            { x: detection.x2 * scaleX, y: detection.y2 * scaleY },
            { x: detection.x1 * scaleX, y: detection.y2 * scaleY }
        ];
    }

    /**
     * 執行 TensorFlow.js (YOLO) 模型進行證件邊界預測
     * @returns {Promise<boolean>} 是否成功偵測到證件
     */
    async function runYoloInference() {
        if (!yoloModel) return false;
        const idCardClassIndex = yoloClassNames.indexOf('id_card');
        if (idCardClassIndex === -1) return false;

        let tensor = null;
        let resized = null;
        let scaled = null;
        let normalized = null;
        let predictions = null;

        try {
            // 1. 圖片前處理：轉 Tensor、縮放至 640x640、正規化並擴充維度 [1, 640, 640, 3]
            tensor = tf.browser.fromPixels(imageObj);
            resized = tf.image.resizeBilinear(tensor, [640, 640]);
            scaled = resized.div(255.0);
            normalized = scaled.expandDims(0);

            // 2. 執行推論
            predictions = await yoloModel.executeAsync(normalized);
            const output0 = Array.isArray(predictions) ? predictions[0] : predictions;
            const protoOutput = Array.isArray(predictions) ? predictions[1] : null;

            // 3. 解析輸出，支援 [1, channels, anchors] 或 [1, anchors, channels]
            const rows = readYoloDetectionRows(output0);
            const candidates = buildYoloCandidates(rows, idCardClassIndex, yoloClassNames.length);
            const detections = applyNms(candidates, 0.45);
            const bestDetection = detections[0];

            if (bestDetection) {
                const maskPoints = tryDecodeYoloMaskQuad(protoOutput, bestDetection);
                points = maskPoints || detectionBoxToImagePoints(bestDetection);
                selectedIdx = 0; drawCanvas();
                selectedEdgeIdx = -1;
                updateQualityCheckNotice();
                console.log(`✅ YOLO 偵測成功，信心度 ${(bestDetection.conf * 100).toFixed(1)}%，候選 ${candidates.length} 個，NMS 後 ${detections.length} 個。`);
                return true;
            }
            return false;
        } catch(e) {
            console.error("YOLO 推論失敗", e);
            return false;
        } finally {
            if (tensor) tensor.dispose();
            if (resized) resized.dispose();
            if (scaled) scaled.dispose();
            if (normalized) normalized.dispose();
            if (predictions) {
                if (Array.isArray(predictions)) predictions.forEach(t => t.dispose());
                else predictions.dispose();
            }
        }
    }

    // 呼叫 OpenCV.js 在本機端自動抓 4 個角
    function autoDetectCornersLocal() {
        if (!cvReady) return false;
        let resized = null;
        let gray = null;
        let blur = null;
        let edged = null;
        let morphKernel = null;
        let contours = null;
        let hierarchy = null;
        const sortableContours = [];

        try {
            const detectionInput = createDetectionMatFromImage(cv, imageObj, 500);
            resized = detectionInput.mat;
            const ratio = detectionInput.ratio;

            gray = new cv.Mat();
            cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY, 0);
            blur = new cv.Mat();
            cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

            edged = new cv.Mat();
            cv.Canny(blur, edged, 50, 150);

            morphKernel = cv.Mat.ones(5, 5, cv.CV_8U);
            cv.morphologyEx(edged, edged, cv.MORPH_CLOSE, morphKernel, new cv.Point(-1, -1), 2);

            contours = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

            for (let i = 0; i < contours.size(); ++i) {
                let cnt = contours.get(i);
                let area = cv.contourArea(cnt);
                if (area > 1000) sortableContours.push({cnt: cnt, area: area});
                else cnt.delete();
            }
            sortableContours.sort((a, b) => b.area - a.area);

            let found = false;
            for (let i = 0; i < Math.min(5, sortableContours.length); ++i) {
                let cnt = sortableContours[i].cnt;
                let peri = cv.arcLength(cnt, true);
                for(let eps of [0.01, 0.02, 0.03, 0.04, 0.05]) {
                    let approx = new cv.Mat();
                    try {
                        cv.approxPolyDP(cnt, approx, eps * peri, true);
                        if (approx.rows === 4) {
                            points = [
                                {x: approx.data32S[0] * ratio, y: approx.data32S[1] * ratio},
                                {x: approx.data32S[2] * ratio, y: approx.data32S[3] * ratio},
                                {x: approx.data32S[4] * ratio, y: approx.data32S[5] * ratio},
                                {x: approx.data32S[6] * ratio, y: approx.data32S[7] * ratio}
                            ];
                            found = true;
                            break;
                        }
                    } finally {
                        approx.delete();
                    }
                }
                if (found) break;
            }

            if (found) {
                selectedIdx = 0; drawCanvas();
                selectedEdgeIdx = -1;
            }
            return found;
        } catch (err) {
            console.error("AI 偵測失敗", err);
            return false;
        } finally {
            sortableContours.forEach(item => disposeCvResources(item.cnt));
            disposeCvResources(resized, gray, blur, edged, morphKernel, contours, hierarchy);
        }
    }

    // 繪製 Canvas
    function drawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const activeIdx = draggingIdx !== -1 ? draggingIdx : selectedIdx;
        const activeEdgeIdx = draggingEdgeIdx !== -1 ? draggingEdgeIdx : selectedEdgeIdx;

        // 取得濾鏡數值並轉換為 CSS Filter 語法以達到即時預覽效果
        const b = document.getElementById('slider_b').value;
        const c = document.getElementById('slider_c').value;
        let s = document.getElementById('slider_s').value;

        const isGrayscale = document.getElementById('chkGrayscale').checked;
        const isBinarize = document.getElementById('chkBinarize').checked;
        const denoise = document.getElementById('slider_denoise').value;

        if (isGrayscale || isBinarize) s = 0; // 若選擇黑白/二值化，強制將預覽飽和度歸零
        let extraFilter = isBinarize ? ' contrast(500%)' : ''; // 透過極高對比度來模擬二值化的視覺預覽效果
        if (denoise > 0) extraFilter += ` blur(${denoise / 100}px)`; // 透過動態輕微模糊來模擬降噪的視覺預覽效果

        ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)${extraFilter}`;
        ctx.drawImage(imageObj, 0, 0);
        ctx.filter = 'none'; // 繪製完圖片後關閉濾鏡，以免影響紅點與綠線的顏色

        // --- 繪製九宮格輔助線 ---
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // 半透明白色
        ctx.lineWidth = Math.max(1, (canvas.width * 0.002) / transform.scale); // 線寬隨縮放自動調細
        ctx.setLineDash([5, 5]); // 設定為虛線效果，避免太搶眼
        ctx.beginPath();
        for (let i = 1; i <= 2; i++) {
            // 垂直線 (1/3 與 2/3 處)
            ctx.moveTo(canvas.width * (i / 3), 0);
            ctx.lineTo(canvas.width * (i / 3), canvas.height);
            // 水平線 (1/3 與 2/3 處)
            ctx.moveTo(0, canvas.height * (i / 3));
            ctx.lineTo(canvas.width, canvas.height * (i / 3));
        }
        ctx.stroke();
        ctx.restore();

        if (points.length !== 4) return;

        // 畫線
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = (canvas.width * 0.005) / transform.scale;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.closePath();
        ctx.stroke();

        // 畫選取邊緣的高亮線條
        if (activeEdgeIdx !== -1) {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)';
            ctx.lineWidth = (canvas.width * 0.008) / transform.scale;
            ctx.beginPath();
            ctx.moveTo(points[activeEdgeIdx].x, points[activeEdgeIdx].y);
            ctx.lineTo(points[(activeEdgeIdx + 1) % 4].x, points[(activeEdgeIdx + 1) % 4].y);
            ctx.stroke();
        }

        // 畫邊緣中點 (藍色控制方塊)
        const midRadius = (canvas.width * 0.015) / transform.scale;
        for (let i = 0; i < 4; i++) {
            const midX = (points[i].x + points[(i + 1) % 4].x) / 2;
            const midY = (points[i].y + points[(i + 1) % 4].y) / 2;
            ctx.beginPath();
            ctx.rect(midX - midRadius, midY - midRadius, midRadius * 2, midRadius * 2);
            if (i === activeEdgeIdx) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
                ctx.fill();
                ctx.lineWidth = (canvas.width * 0.005) / transform.scale;
                ctx.strokeStyle = '#FF0000';
                ctx.stroke();
            } else {
                ctx.fillStyle = 'rgba(0, 123, 255, 0.8)'; // 藍色代表邊緣
                ctx.fill();
            }
        }

        // 畫點
        const radius = (canvas.width * 0.02) / transform.scale;
        points.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, (i === activeIdx) ? radius * 1.5 : radius, 0, 2 * Math.PI);
            if (i === activeIdx && activeIdx === selectedIdx && draggingIdx === -1) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.9)'; // 選取狀態：黃色
                ctx.fill();
                ctx.lineWidth = (canvas.width * 0.005) / transform.scale;
                ctx.strokeStyle = '#FF0000';
                ctx.stroke();
            } else {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'; // 一般狀態：紅色
                ctx.fill();
            }
        });

        // --- 放大鏡 (Magnifier) 功能 ---
        let magCenter = null;
        if (activeIdx !== -1) {
            magCenter = points[activeIdx];
        } else if (activeEdgeIdx !== -1) {
            magCenter = { x: (points[activeEdgeIdx].x + points[(activeEdgeIdx + 1) % 4].x) / 2, y: (points[activeEdgeIdx].y + points[(activeEdgeIdx + 1) % 4].y) / 2 };
        }

        if (magCenter) {
            const pt = magCenter;
            const zoomFactor = 3; // 放大倍率
            const magDispSize = (canvas.width * 0.3) / transform.scale; // 放大鏡實體大小保持不變
            const margin = (canvas.width * 0.02) / transform.scale;

            // 決定放大鏡擺放位置：若手指在畫面左側，放大鏡放右邊；反之放左側避免遮擋
            const magX = (pt.x < canvas.width / 2) ? canvas.width - magDispSize - margin : margin;
            const magY = margin;

            const magCx = magX + magDispSize / 2;
            const magCy = magY + magDispSize / 2;
            const magRadius = magDispSize / 2;

            ctx.save();

            // 畫放大鏡的圓形路徑並設定剪裁 (clip)
            ctx.beginPath();
            ctx.arc(magCx, magCy, magRadius, 0, 2 * Math.PI);
            ctx.fillStyle = '#000000';
            ctx.fill();

            // 限制接下來的繪圖只出現在圓形內
            ctx.clip();

            // 將座標系原點移到放大鏡「中心」，並放大
            ctx.save();
            ctx.translate(magCx, magCy);
            ctx.scale(zoomFactor, zoomFactor);

            // 放大鏡內的圖片也套用相同的即時濾鏡
            ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)${extraFilter}`;
            ctx.drawImage(imageObj, -pt.x, -pt.y);
            ctx.filter = 'none';

            ctx.restore(); // 恢復比例與原點，但保留圓形 clip 狀態

            // 在放大鏡上方疊加畫上綠色「十字對準線」
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = (canvas.width * 0.003) / transform.scale;
            ctx.beginPath();
            ctx.moveTo(magCx, magCy - magRadius);
            ctx.lineTo(magCx, magCy + magRadius);
            ctx.moveTo(magCx - magRadius, magCy);
            ctx.lineTo(magCx + magRadius, magCy);
            ctx.stroke();

            // 在放大鏡內部下方顯示即時像素座標 (超出圓形範圍的黑底會被自動隱藏)
            const textBarHeight = magDispSize * 0.18; // 資訊條高度
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';     // 半透明黑底
            ctx.fillRect(magX, magY + magDispSize - textBarHeight, magDispSize, textBarHeight);
            ctx.fillStyle = '#00FF00';                // 綠色螢光字
            ctx.font = `bold ${textBarHeight * 0.7}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`X:${Math.round(pt.x)} Y:${Math.round(pt.y)}`, magCx, magCy + magRadius - textBarHeight / 2);
            ctx.restore();

            // 畫上白色的圓形外框 (在 clip 取消後畫，確保外框完整且清晰)
            ctx.save();
            ctx.beginPath();
            ctx.arc(magCx, magCy, magRadius, 0, 2 * Math.PI);
            ctx.lineWidth = (canvas.width * 0.005) / transform.scale;
            ctx.strokeStyle = '#FFFFFF';
            ctx.stroke();
            ctx.restore();
        }
    }

    // 處理手機觸控拖拉邏輯
    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        // 將螢幕點擊座標換算回圖片的真實解析度座標
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    // 呼叫 OpenCV.js 執行本機端局部邊緣吸附
    function snapPoint(idx) {
        if (!cvReady || !document.getElementById('autoSnap').checked) return;
        const pt = points[idx];

        // 根據拉桿決定吸附力道
        const strengthValue = parseInt(document.getElementById('snapStrength').value, 10);
        const strengthMap = {
            1: { percent: 0.02, quality: 0.05 }, // 最弱
            2: { percent: 0.04, quality: 0.03 }, // 弱
            3: { percent: 0.06, quality: 0.01 }, // 中 (預設)
            4: { percent: 0.08, quality: 0.01 }, // 強
            5: { percent: 0.10, quality: 0.01 }  // 最強
        };
        const currentStrength = strengthMap[strengthValue];

        // 動態計算裁切半徑
        const cropR = Math.floor(Math.max(imageObj.width, imageObj.height) * currentStrength.percent);

        const offCanvas = document.getElementById('offscreenCanvas');
        offCanvas.width = cropR * 2;
        offCanvas.height = cropR * 2;
        const offCtx = offCanvas.getContext('2d');

        // 從原圖擷取該點附近的局部區域 (drawImage 會自動處理超出邊界的黑邊)
        offCtx.drawImage(imageObj, pt.x - cropR, pt.y - cropR, cropR * 2, cropR * 2, 0, 0, cropR * 2, cropR * 2);

        let src = null;
        let gray = null;
        let blur = null;
        let corners = null;
        let mask = null;
        try {
            src = cv.imread('offscreenCanvas');
            gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            blur = new cv.Mat();
            cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

            corners = new cv.Mat();
            mask = new cv.Mat();
            // 增加候選點數量 (10) 並根據力道調整品質閾值
            cv.goodFeaturesToTrack(blur, corners, 10, currentStrength.quality, 5, mask, 15);

            if (corners.rows > 0) {
                let cx = cropR, cy = cropR;
                let bestDist = Infinity, bestX = 0, bestY = 0;
                for (let i = 0; i < corners.rows; i++) {
                    let x = corners.data32F[i * 2], y = corners.data32F[i * 2 + 1];
                    let dist = (x - cx) ** 2 + (y - cy) ** 2;
                    if (dist < bestDist) { bestDist = dist; bestX = x; bestY = y; }
                }
                points[idx].x += (bestX - cx);
                points[idx].y += (bestY - cy);
                drawCanvas();
            }
        } catch (e) {
            console.error("自動吸附失敗", e);
        } finally {
            disposeCvResources(src, gray, blur, corners, mask);
        }
    }

    // ==========================================
    // 4. 觸控與滑鼠手勢處理 (多點觸控支援)
    // ==========================================

    // 處理按下事件 (Touch Start / Mouse Down)
    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 2) {
            // --- 雙指模式：開始縮放 (Pinch to Zoom) ---
            draggingIdx = -1;
            draggingEdgeIdx = -1;
            isDragging = false;
            lastPanPoint = null;
            const pts = Array.from(activePointers.values());
            initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            initialPinchCenter = { x: (pts[0].x + pts[1].x)/2, y: (pts[0].y + pts[1].y)/2 };
            initialTransform = { ...transform };
            drawCanvas(); // 取消選取狀態
            return;
        }

        if (activePointers.size === 1) {
            // --- 單指模式：點擊角點、邊緣或準備平移 ---
            const pos = getPointerPos(e);
            // 調整觸控判定半徑，確保放大後觸控範圍不會縮水
            const hitRadius = (canvas.width * 0.08) / transform.scale;

            draggingIdx = points.findIndex(p => Math.hypot(p.x - pos.x, p.y - pos.y) < hitRadius);
            if (draggingIdx !== -1) {
                // 點擊到「角點」
                selectedIdx = draggingIdx;
                selectedEdgeIdx = -1;
                isDragging = false;
                lastPanPoint = null;
            } else {
                // 檢查是否點擊到「邊緣中點」
                const midpoints = points.map((p, i) => ({ x: (p.x + points[(i + 1) % 4].x) / 2, y: (p.y + points[(i + 1) % 4].y) / 2 }));
                draggingEdgeIdx = midpoints.findIndex(p => Math.hypot(p.x - pos.x, p.y - pos.y) < hitRadius);

                if (draggingEdgeIdx !== -1) {
                    selectedEdgeIdx = draggingEdgeIdx;
                    selectedIdx = -1;
                    isDragging = false;
                    lastPanPoint = null;
                    lastEdgeDragPoint = { x: pos.x, y: pos.y };
                } else {
                    selectedIdx = -1;
                    selectedEdgeIdx = -1;
                    lastPanPoint = { x: e.clientX, y: e.clientY }; // 準備單指平移
                }
            }
            drawCanvas();
        }
    });

    // 處理移動事件 (Touch Move / Mouse Move)
    canvas.addEventListener('pointermove', (e) => {
        e.preventDefault();
        if (!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 2 && initialPinchDistance) {
            // --- 雙指模式：執行縮放與平移計算 ---
            const pts = Array.from(activePointers.values());
            const currentDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const currentCenter = { x: (pts[0].x + pts[1].x)/2, y: (pts[0].y + pts[1].y)/2 };

            const scaleDiff = currentDistance / initialPinchDistance;
            let newScale = initialTransform.scale * scaleDiff;
            newScale = Math.max(0.5, Math.min(newScale, 10)); // 限制縮放比例 0.5x ~ 10x

            const scaleRatio = newScale / initialTransform.scale;
            const newX = currentCenter.x - (initialPinchCenter.x - initialTransform.x) * scaleRatio;
            const newY = currentCenter.y - (initialPinchCenter.y - initialTransform.y) * scaleRatio;

            transform = { scale: newScale, x: newX, y: newY };
            updateCanvasTransform();
            return;
        }

        if (activePointers.size === 1) {
            // --- 單指模式：拖曳角點、邊緣或平移畫布 ---
            if (draggingIdx !== -1) {
                points[draggingIdx] = getPointerPos(e);
                isDragging = true;
                drawCanvas();
            } else if (draggingEdgeIdx !== -1) {
                const pos = getPointerPos(e);
                const dx = pos.x - lastEdgeDragPoint.x;
                const dy = pos.y - lastEdgeDragPoint.y;
                points[draggingEdgeIdx].x += dx;
                points[draggingEdgeIdx].y += dy;
                points[(draggingEdgeIdx + 1) % 4].x += dx;
                points[(draggingEdgeIdx + 1) % 4].y += dy;
                lastEdgeDragPoint = { x: pos.x, y: pos.y };
                isDragging = true;
                drawCanvas();
            } else if (lastPanPoint) {
                const dx = e.clientX - lastPanPoint.x;
                const dy = e.clientY - lastPanPoint.y;
                transform.x += dx;
                transform.y += dy;
                lastPanPoint = { x: e.clientX, y: e.clientY };
                updateCanvasTransform();
            }
        }
    });

    // 處理放開/取消事件 (Touch End / Mouse Up)
    const pointerUpHandler = (e) => {
        e.preventDefault();
        activePointers.delete(e.pointerId);

        if (activePointers.size < 2) {
            initialPinchDistance = null;
        }

        if (activePointers.size === 0) {
            if (isDragging) { // 檢查是否有發生拖曳
                allowDeferredAutoDetect = false;
                pendingOpenCvAutoDetect = false;
                if (draggingIdx !== -1) {
                    // 吸附被拖曳的單一角點
                    snapPoint(draggingIdx);
                } else if (draggingEdgeIdx !== -1) {
                    // 當邊緣被拖曳時，自動吸附其相連的兩個角點
                    snapPoint(draggingEdgeIdx);
                    snapPoint((draggingEdgeIdx + 1) % 4);
                }
                savePointsState(); // 每次拖曳完成後，儲存狀態供復原
            }
            draggingIdx = -1;
            draggingEdgeIdx = -1;
            lastEdgeDragPoint = null;
            isDragging = false;
            lastPanPoint = null;
            drawCanvas(); // 完成所有操作後最終重繪
        } else if (activePointers.size === 1) {
            // 從兩指變回單指時，將剩餘的手指設為平移起點，防止畫面跳動
            const remaining = Array.from(activePointers.values())[0];
            lastPanPoint = { x: remaining.x, y: remaining.y };
            draggingIdx = -1;
            draggingEdgeIdx = -1; // 修正：當從兩指縮放變回單指平移時，應一併重置邊緣拖曳狀態
        }
    };

    canvas.addEventListener('pointerup', pointerUpHandler);
    canvas.addEventListener('pointercancel', pointerUpHandler);
    canvas.addEventListener('pointerout', pointerUpHandler);

    // 方向鍵微調邏輯
    const nudgePoint = (dx, dy) => {
        const step = parseInt(document.getElementById('nudgeStep').value, 10);
        if (selectedIdx !== -1) {
            allowDeferredAutoDetect = false;
            pendingOpenCvAutoDetect = false;
            points[selectedIdx].x += dx * step;
            points[selectedIdx].y += dy * step;
            drawCanvas();
            savePointsState(); // 每次方向鍵微調後儲存
        } else if (selectedEdgeIdx !== -1) {
            allowDeferredAutoDetect = false;
            pendingOpenCvAutoDetect = false;
            points[selectedEdgeIdx].x += dx * step;
            points[selectedEdgeIdx].y += dy * step;
            points[(selectedEdgeIdx + 1) % 4].x += dx * step;
            points[(selectedEdgeIdx + 1) % 4].y += dy * step;
            drawCanvas();
            savePointsState(); // 每次方向鍵微調後儲存
        }
    };
    document.getElementById('btnUp').addEventListener('click', () => nudgePoint(0, -1));
    document.getElementById('btnDown').addEventListener('click', () => nudgePoint(0, 1));
    document.getElementById('btnLeft').addEventListener('click', () => nudgePoint(-1, 0));
    document.getElementById('btnRight').addEventListener('click', () => nudgePoint(1, 0));

    // ==========================================
    // 5. 核心影像處理管線 (OpenCV.js)
    // ==========================================
    processBtn.addEventListener('click', async () => {
        if (!cvReady) {
            setEngineStatus('影像引擎仍在背景載入，請稍候幾秒再裁切。');
            updateProcessButtonState();
            return;
        }
        loading.style.display = 'block'; processBtn.disabled = true;

        // 稍微延遲以確保瀏覽器有空檔渲染 Loading UI
        await new Promise(resolve => setTimeout(resolve, 50));

        let src = null;
        let srcTri = null;
        let dstTri = null;
        let perspectiveTransform = null;
        let warped = null;
        let baseEnhanced = null;
        let maxSharpened = null;
        let sharpenKernel = null;
        let tempImg = null;
        let hsv = null;
        let channels = null;
        let saturationChannel = null;
        let finalResult = null;
        let grayMat = null;
        try {
            src = cv.imread(imageObj);

            // --------------------------------------------------
            // 步驟 1：順時針排序 4 個點並確保最長邊為頂部
            // --------------------------------------------------
            // 1.1 計算中心點
            let cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
            let cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;

            // 1.2 依據角度順時針排序
            let sortedPoints = [...points].sort((a, b) => {
                return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
            });

            // 1.3 找出最長的一條邊，確保裁切輸出為橫向 (Landscape)
            let dists = [];
            for(let i = 0; i < 4; i++) {
                let next = (i + 1) % 4;
                dists.push(Math.hypot(sortedPoints[i].x - sortedPoints[next].x, sortedPoints[i].y - sortedPoints[next].y));
            }
            let maxIdx = dists.indexOf(Math.max(...dists));

            // 1.4 若最長邊在垂直兩側(索引 1 或 3)，將陣列滾動一格，旋轉 90 度
            if (maxIdx === 1 || maxIdx === 3) {
                sortedPoints.push(sortedPoints.shift());
            }

            let tl = sortedPoints[0];
            let tr = sortedPoints[1];
            let br = sortedPoints[2];
            let bl = sortedPoints[3];

            srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);

            // 計算兩側寬度與高度，取最大值作為校正後的基準解析度
            let wA = Math.hypot(br.x - bl.x, br.y - bl.y);
            let wB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
            let maxWidth = Math.max(wA, wB);

            let hA = Math.hypot(tr.x - br.x, tr.y - br.y);
            let hB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
            let maxHeight = Math.max(hA, hB);

            let selectedRatio = parseFloat(document.getElementById('aspectRatio').value);
            let finalW, finalH;
            if (selectedRatio === 0) {
                finalW = Math.round(maxWidth); finalH = Math.round(maxHeight);
            } else {
                if (maxWidth >= maxHeight) { finalW = Math.round(maxWidth); finalH = Math.round(maxWidth / selectedRatio); }
                else { finalH = Math.round(maxHeight); finalW = Math.round(maxHeight / selectedRatio); }
            }

            // --- 根據使用者選擇限制最大輸出像素 ---
            let outRes = parseInt(document.getElementById('outputResolution').value, 10);
            let currentMaxDim = Math.max(finalW, finalH);
            if (outRes > 0 && currentMaxDim > outRes) {
                let scale = outRes / currentMaxDim;
                finalW = Math.round(finalW * scale);
                finalH = Math.round(finalH * scale);
            }

            // --------------------------------------------------
            // 步驟 2：執行透視變換 (Perspective Transform)
            // --------------------------------------------------
            dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, finalW - 1, 0, finalW - 1, finalH - 1, 0, finalH - 1]);
            perspectiveTransform = cv.getPerspectiveTransform(srcTri, dstTri);

            warped = new cv.Mat();
            cv.warpPerspective(src, warped, perspectiveTransform, new cv.Size(finalW, finalH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

            // --------------------------------------------------
            // 步驟 3：影像降噪 (Median Blur)
            // --------------------------------------------------
            let denoiseVal = parseFloat(document.getElementById('slider_denoise').value) / 100.0;
            if (denoiseVal > 0) {
                let ksize = 3 + 2 * Math.floor(denoiseVal * 3); // 將 0.0~1.0 巧妙映射至 3, 5, 7, 9 的奇數 Kernel 參數
                cv.cvtColor(warped, warped, cv.COLOR_RGBA2RGB, 0); // 中值濾波更適合在 RGB 空間運作
                cv.medianBlur(warped, warped, ksize); // 使用動態強度平滑去除相機雜訊顆粒
                cv.cvtColor(warped, warped, cv.COLOR_RGB2RGBA, 0);
            }

            // 取得各項濾鏡參數
            let b = parseFloat(document.getElementById('slider_b').value) - 100;
            let c = parseFloat(document.getElementById('slider_c').value) / 100.0;
            let s = parseFloat(document.getElementById('slider_s').value) / 100.0;
            let sharp = parseFloat(document.getElementById('slider_sharp').value) / 100.0;

            // --------------------------------------------------
            // 步驟 4：銳化處理 (Unsharp Masking 概念)
            // --------------------------------------------------
            baseEnhanced = warped.clone();
            if (sharp > 0) {
                maxSharpened = new cv.Mat();
                sharpenKernel = cv.matFromArray(3, 3, cv.CV_32FC1, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
                cv.filter2D(warped, maxSharpened, -1, sharpenKernel);
                cv.addWeighted(maxSharpened, sharp, warped, 1.0 - sharp, 0, baseEnhanced);
            }

            // --------------------------------------------------
            // 步驟 5：飽顛度調整 (HSV 色彩空間轉換)
            // --------------------------------------------------
            tempImg = baseEnhanced.clone();
            if (s !== 1.0) {
                hsv = new cv.Mat();
                cv.cvtColor(baseEnhanced, hsv, cv.COLOR_RGBA2RGB); // 先確保轉為 RGB
                cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
                channels = new cv.MatVector();
                cv.split(hsv, channels);
                saturationChannel = channels.get(1);
                saturationChannel.convertTo(saturationChannel, -1, s, 0);
                channels.set(1, saturationChannel);
                cv.merge(channels, hsv);
                cv.cvtColor(hsv, tempImg, cv.COLOR_HSV2RGB);
                cv.cvtColor(tempImg, tempImg, cv.COLOR_RGB2RGBA);
            }

            // --------------------------------------------------
            // 步驟 6：亮度與對比度調整 (Linear Transform)
            // --------------------------------------------------
            finalResult = new cv.Mat();
            tempImg.convertTo(finalResult, -1, c, b);

            // --------------------------------------------------
            // 步驟 7：黑白化與自適應二值化 (Adaptive Thresholding)
            // --------------------------------------------------
            const isGrayscale = document.getElementById('chkGrayscale').checked;
            const isBinarize = document.getElementById('chkBinarize').checked;
            if (isGrayscale || isBinarize) {
                grayMat = new cv.Mat();
                cv.cvtColor(finalResult, grayMat, cv.COLOR_RGBA2GRAY, 0);
                if (isBinarize) {
                    // 升級為「自適應二值化」，能完美處理陰影與光線不均的問題
                    cv.adaptiveThreshold(grayMat, grayMat, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 4);
                }
                cv.cvtColor(grayMat, finalResult, cv.COLOR_GRAY2RGBA, 0);
            }

            // --------------------------------------------------
            // 步驟 8：輸出結果至畫布與清理記憶體
            // --------------------------------------------------
            cv.imshow('offscreenCanvas', finalResult);
            document.getElementById('resultImage').src = document.getElementById('offscreenCanvas').toDataURL('image/jpeg', 0.95);
            document.getElementById('resultSize').textContent = ''; // 清空舊的檔案大小
            document.getElementById('resultResolution').textContent = `📐 圖片尺寸：${finalW} x ${finalH} 像素`;

            document.getElementById('editorCard').style.display = 'none';
            floatingControls.classList.remove('visible');
            document.body.classList.remove('controls-visible');
            document.getElementById('resultCard').style.display = 'block';
            updateQualityCheckNotice();
            updatePdfCartVisibility();
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch(err) {
            console.error("OpenCV Processing Error:", err);
            alert("處理圖片時發生錯誤！");
        } finally {
            disposeCvResources(
                src, srcTri, dstTri, perspectiveTransform, warped, baseEnhanced,
                maxSharpened, sharpenKernel, tempImg, hsv, channels, saturationChannel,
                finalResult, grayMat
            );
            loading.style.display = 'none'; processBtn.disabled = false; processBtn.textContent = '✂️ 裁切圖片';
        }
    });

    // ==========================================
    // 6. 檔案匯出與多頁 PDF 管理
    // ==========================================

    /** 將 Bytes 轉為人類可讀的 KB, MB 格式 */
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }


    // 處理下載圖片邏輯
    downloadJpgBtn.addEventListener('click', () => {
        const dataUrl = document.getElementById('resultImage').src;
        if (!dataUrl || !dataUrl.startsWith('data:image')) return;

        // 將 Base64 轉換為 Blob 進行下載，解決手機瀏覽器因網址過長導致下載無反應的問題
        fetch(dataUrl)
            .then(res => res.blob())
            .then(blob => {
                document.getElementById('resultSize').textContent = `| 💾 檔案大小：${formatBytes(blob.size)}`;
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'id_card_processed.jpg';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl); // 釋放記憶體
            });
    });

    // 處理分享圖片邏輯 (Web Share API)
    shareBtn.addEventListener('click', async () => {
        const dataUrl = document.getElementById('resultImage').src;
        if (!dataUrl || !dataUrl.startsWith('data:image')) return;

        try {
            // 將 Base64 轉換回 File 物件以供分享
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], 'id_card_scan.jpg', { type: 'image/jpeg' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: '證件掃描',
                    files: [file]
                });
            } else {
                alert('您的裝置或瀏覽器不支援直接分享圖片檔案，請先使用下載按鈕。');
            }
        } catch (err) { console.error('分享失敗或已取消:', err); }
    });

    // 處理加入多頁文件邏輯
    addToPdfBtn.addEventListener('click', () => {
        const dataUrl = document.getElementById('resultImage').src;
        if (!dataUrl || !dataUrl.startsWith('data:image')) return;

        state.pdfPages.push(dataUrl);
        pdfPageCount.textContent = state.pdfPages.length;

        // 退回首頁準備掃描下一張
        document.getElementById('resultCard').style.display = 'none';
        document.getElementById('uploadCard').style.display = 'block';
        updatePdfCartVisibility();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 處理清空多頁文件邏輯
    btnClearPdfCart.addEventListener('click', () => {
        if (confirm(`確定要清空已掃描的 ${state.pdfPages.length} 頁文件嗎？`)) {
            state.pdfPages = [];
            pdfPageCount.textContent = '0';
            updatePdfCartVisibility();
        }
    });

    // 處理匯出多頁 PDF 邏輯
    btnGenerateMultiPdf.addEventListener('click', async () => {
        if (state.pdfPages.length === 0) return;

        btnGenerateMultiPdf.disabled = true;
        btnGenerateMultiPdf.textContent = '⏳ 處理中...';

        // 依序將陣列中的圖片畫入 PDF 中
        try {
            const jsPDF = await getJsPdfConstructor();
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const A4_WIDTH = 210, A4_HEIGHT = 297, MARGIN = 10;

            for (let i = 0; i < state.pdfPages.length; i++) {
                const img = await loadImageFromDataUrl(state.pdfPages[i]);
                if (i > 0) pdf.addPage(); // 第一頁不需要 addPage
                const imgRatio = img.width / img.height;
                let imgWidth = A4_WIDTH - MARGIN * 2;
                let imgHeight = imgWidth / imgRatio;

                    // 若圖片過長，限制其高度並等比縮小寬度，然後置中
                if (imgHeight > A4_HEIGHT - MARGIN * 2) {
                    imgHeight = A4_HEIGHT - MARGIN * 2;
                    imgWidth = imgHeight * imgRatio;
                }
                const x = (A4_WIDTH - imgWidth) / 2;
                pdf.addImage(img, 'JPEG', x, MARGIN, imgWidth, imgHeight);
            }

            pdf.save('multi_page_scan.pdf');
        } catch (err) {
            console.error('多頁 PDF 匯出失敗', err);
            alert('匯出 PDF 時發生錯誤，請稍後再試。');
        } finally {
            btnGenerateMultiPdf.disabled = false;
            btnGenerateMultiPdf.textContent = '📥 匯出 PDF';
        }
    });

    // 處理多頁文件預覽與刪除邏輯
    function renderPdfPreview() {
        pdfPreviewGallery.innerHTML = '';
        if (state.pdfPages.length === 0) {
            pdfPreviewEmpty.style.display = 'block';
        } else {
            pdfPreviewEmpty.style.display = 'none';
            state.pdfPages.forEach((dataUrl, index) => {
                const item = document.createElement('div');
                item.style.position = 'relative';
                item.style.border = '2px solid var(--border-color)'; // 加粗邊框，避免切換虛線時跳動
                item.style.borderRadius = '8px';
                item.style.overflow = 'hidden';
                item.style.backgroundColor = 'var(--card-bg)';
                item.style.cursor = 'grab'; // 提示這是一個可抓取的物件
                item.draggable = true; // 啟用 HTML5 原生拖曳功能

                const img = document.createElement('img');
                img.src = dataUrl;
                img.style.width = '100%';
                img.style.display = 'block';

                const pageNum = document.createElement('div');
                pageNum.textContent = `第 ${index + 1} 頁`;
                pageNum.style.textAlign = 'center';
                pageNum.style.padding = '5px 0';
                pageNum.style.backgroundColor = 'var(--hint-bg)';
                pageNum.style.fontSize = '0.85rem';
                pageNum.style.fontWeight = 'bold';
                pageNum.style.color = 'var(--text-main)';

                const delBtn = document.createElement('button');
                delBtn.innerHTML = '🗑️';
                delBtn.style.position = 'absolute';
                delBtn.style.top = '5px';
                delBtn.style.right = '5px';
                delBtn.style.width = '32px';
                delBtn.style.height = '32px';
                delBtn.style.padding = '0';
                delBtn.style.backgroundColor = 'rgba(220, 53, 69, 0.9)';
                delBtn.style.border = 'none';
                delBtn.style.borderRadius = '50%';
                delBtn.style.color = 'white';
                delBtn.style.cursor = 'pointer';
                delBtn.style.display = 'flex';
                delBtn.style.alignItems = 'center';
                delBtn.style.justifyContent = 'center';
                delBtn.style.fontSize = '0.9rem';

                delBtn.addEventListener('click', () => {
                    if (confirm(`確定要刪除第 ${index + 1} 頁嗎？`)) {
                        state.pdfPages.splice(index, 1);
                        pdfPageCount.textContent = state.pdfPages.length;
                        updatePdfCartVisibility();
                        renderPdfPreview(); // 刪除後立即重新渲染排版

                        // 如果刪到沒剩半頁，自動關閉預覽視窗
                        if (state.pdfPages.length === 0) {
                            setTimeout(() => {
                                pdfPreviewModal.style.display = 'none';
                                document.body.style.overflow = '';
                            }, 800); // 稍微延遲讓使用者看見空狀態提示
                        }
                    }
                });

                // --- 拖曳排序事件監聽 ---
                item.addEventListener('dragstart', (e) => {
                    state.draggedPdfIndex = index;
                    e.dataTransfer.effectAllowed = 'move';
                    // 使用 setTimeout 讓半透明效果只套用在原地，不影響跟著游標移動的殘影
                    setTimeout(() => item.style.opacity = '0.4', 0);
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault(); // 必須阻止預設行為才能觸發 drop
                    item.style.borderColor = '#007bff';
                    item.style.borderStyle = 'dashed';
                });

                item.addEventListener('dragleave', () => {
                    item.style.borderColor = 'var(--border-color)';
                    item.style.borderStyle = 'solid';
                });

                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (state.draggedPdfIndex !== null && state.draggedPdfIndex !== index) {
                        // 從陣列中抽出被拖曳的項目，並插入到新的索引位置
                        const draggedPage = state.pdfPages.splice(state.draggedPdfIndex, 1)[0];
                        state.pdfPages.splice(index, 0, draggedPage);
                    }
                });

                item.addEventListener('dragend', () => {
                    state.draggedPdfIndex = null;
                    renderPdfPreview(); // 拖曳結束後，無論有沒有改變順序，都重新渲染以重置樣式
                });

                item.appendChild(img);
                item.appendChild(pageNum);
                item.appendChild(delBtn);
                pdfPreviewGallery.appendChild(item);
            });
        }
    }

    btnPreviewPdfCart.addEventListener('click', () => {
        renderPdfPreview();
        pdfPreviewModal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // 防止預覽時背景網頁跟著滾動
    });

    btnClosePreview.addEventListener('click', () => {
        pdfPreviewModal.style.display = 'none';
        document.body.style.overflow = ''; // 恢復背景網頁滾動
    });

    // 處理單張下載 PDF 邏輯
    downloadPdfBtn.addEventListener('click', async () => {
        const imgData = document.getElementById('resultImage').src;
        if (!imgData || !imgData.startsWith('data:image')) return;

        try {
            const jsPDF = await getJsPdfConstructor();
            const img = await loadImageFromDataUrl(imgData);
            const pdf = new jsPDF({
                orientation: 'p', // portrait (直向)
                unit: 'mm',
                format: 'a4'
            });

            const A4_WIDTH = 210;
            const A4_HEIGHT = 297;
            const MARGIN = 10;

            const imgRatio = img.width / img.height;
            let imgWidth = A4_WIDTH - MARGIN * 2;
            let imgHeight = imgWidth / imgRatio;

            // 若圖片過長，限制其高度並等比縮小寬度，然後置中
            if (imgHeight > A4_HEIGHT - MARGIN * 2) {
                imgHeight = A4_HEIGHT - MARGIN * 2;
                imgWidth = imgHeight * imgRatio;
            }
            const x = (A4_WIDTH - imgWidth) / 2;
            pdf.addImage(img, 'JPEG', x, MARGIN, imgWidth, imgHeight);
            pdf.save('id_card_scan.pdf');
        } catch (err) {
            console.error('PDF 匯出失敗', err);
            alert('匯出 PDF 時發生錯誤，請稍後再試。');
        }
    });

    // 處理重新調整邏輯
    reeditBtn.addEventListener('click', () => {
        document.getElementById('resultCard').style.display = 'none';
        document.getElementById('editorCard').style.display = 'block';
        updatePdfCartVisibility();
        window.scrollTo({ top: 0, behavior: 'smooth' }); // 平滑捲動回編輯區
    });

    // 處理重拍/退回首頁邏輯
    btnRetake.addEventListener('click', () => {
        document.getElementById('editorCard').style.display = 'none';
        document.getElementById('uploadCard').style.display = 'block';
        updatePdfCartVisibility();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    return {
        onTensorFlowReady,
        onTensorFlowError,
        onOpenCvReady,
        onOpenCvError
    };
}
