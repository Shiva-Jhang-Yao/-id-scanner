# 📱 手機證件掃描器 (ID Card Scanner PWA)

這是一個基於純前端技術、AI 驅動的證件掃描 Web App。它利用您手機的瀏覽器，在 **100% 離線** 的單機環境下，提供媲美原生 App 的證件裁切、影像優化與格式轉換功能。

**線上體驗 Demo:** [https://shiva-jhang-yao.github.io/-id-scanner/](https://shiva-jhang-yao.github.io/-id-scanner/)

操作展示 GIF 可在錄製完成後再補上。

---

## ✨ 核心特色

*   **🚀 純前端 AI 運算 (Edge AI):**
    *   **YOLOv8-tfjs:** 在瀏覽器端即時偵測證件外框，自動標記四個角落。
    *   **OpenCV.js:** 執行透視校正、邊緣吸附、影像濾鏡與二值化等所有影像處理，零延遲、零伺服器負擔。
*   **🔒 絕對隱私與安全:**
    *   所有運算皆在您的手機上完成，照片**永不上傳**至任何伺服器。
    *   支援 100% 離線使用，確保個資絕不外洩。
*   **📱 媲美原生 App 的體驗 (PWA):**
    *   可「加入主畫面」安裝至手機桌面，擁有獨立 App 圖示。
    *   支援全螢幕 `standalone` 模式，隱藏瀏覽器網址列。
    *   Service Worker 離線快取，即使在飛航模式下也能秒開 App。
*   **🖱️ 專業級編輯工具:**
    *   **兩指縮放與單指平移:** 輕鬆檢視圖片任何細節。
    *   **磁性套索:** 手指靠近邊角時，自動吸附至最精準的像素點。
    *   **像素級微調:** 提供方向鍵與多段變速，滿足極致的對齊需求。
    *   **即時濾鏡預覽:** 亮度、對比、飽和度等參數可透過懸浮面板即時調整。
*   **📄 彈性的輸出選項:**
    *   支援多種裁切比例（證件、A4、4:3、16:9、自由比例）。
    *   可選擇輸出解析度，有效縮減檔案大小。
    *   支援一鍵匯出為 **JPG** 或 **PDF** 格式。

---

## 🛠️ 技術棧 (Tech Stack)

*   **AI / CV:**
    *   Ultralytics YOLOv8: 用於訓練證件偵測模型。
    *   TensorFlow.js: 在瀏覽器端執行 YOLO 模型推論。
    *   OpenCV.js: 在瀏覽器端執行所有影像處理演算法。
*   **前端:**
    *   純 HTML5 / CSS3 / JavaScript (Vanilla JS)。
    *   Progressive Web App (PWA) 技術，包含 Manifest 與 Service Worker。

---

## 🚀 如何部署到您自己的 GitHub Pages

本專案已完全前端化，您不需要任何伺服器即可部署！

1.  **準備部署檔案:**
    *   將 `index.html`, `manifest.json`, `sw.js`, `icon.svg` 複製到一個新資料夾。
    *   若您有訓練好的 YOLO 模型，請執行 `yolo export model=best.pt format=tfjs`，並將產生的 `best_web_model` 資料夾重新命名為 `model_web`，一併放入。

2.  **建立 GitHub 儲存庫:**
    *   登入 GitHub，建立一個新的 **Public** 儲存庫 (例如 `id-scanner`)。
    *   將您準備好的所有檔案上傳到這個儲存庫的根目錄。

3.  **啟用 GitHub Pages:**
    *   進入儲存庫的 **Settings** > **Pages**。
    *   在 `Build and deployment` 區塊，將 Source 設為 `Deploy from a branch`。
    *   Branch 選擇 `main`，資料夾維持 `/(root)`，點擊 **Save**。

4.  **等待部署:**
    *   等待約 2-5 分鐘，當頁面上方顯示 "Your site is live at..." 時，即可透過該網址存取。

---

## 展望 (Future Work)

*   **防盜浮水印:** 新增輸入框，讓使用者能自訂浮水印文字並印在最終圖片上。
*   **EXIF 自動旋轉:** 讀取照片的 EXIF 方向資訊，自動將橫躺的照片轉正。
*   **Web Worker 優化:** 將耗時的 OpenCV 運算移至背景執行緒，避免 UI 凍結。

歡迎提交 Pull Request 或開啟 Issue 來一同完善這個專案！
