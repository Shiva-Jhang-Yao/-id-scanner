# 📱 手機證件掃描器 (ID Card Scanner PWA)

純前端、100% 離線、隱私第一的證件 / 文件掃描 Web App。打開網址就用，不需要下載 App，照片絕不上傳。

**線上體驗：** [https://shiva-jhang-yao.github.io/-id-scanner/](https://shiva-jhang-yao.github.io/-id-scanner/)

---

## ✨ 核心特色

- **🔒 絕對隱私**：所有影像處理都在你手機的瀏覽器完成，照片從未離開裝置。
- **📷 一鍵拍攝到 PDF**：拍照 → 自動抓邊 → 微調 → 匯出 JPG / PDF，三步搞定。
- **🧠 多演算法邊界偵測**：內建四種模式，一鍵切換：
  - **自動**：三種演算法同時跑，依「四角接近直角、對邊長度對稱、面積合理」打分，擇優套用
  - **直邊 (Canny + Hough)**：適合證件、名片等邊界筆直的文件
  - **外框 (Canny + 輪廓)**：適合背景乾淨、外框明顯的情境
  - **雜訊多 (RANSAC 直線擬合)**：適合背景複雜、光影多的情境
- **🎯 兩段式選點 + 磁性吸附**：第一次點只選取（避免不小心推歪），再點才拖曳；放開時用局部 Canny + Hough 交點做次像素精修。
- **🌗 專業級影像後處理**：
  - 陰影 / 光場校正（morphology background + 除法）
  - Gray-world 自動白平衡
  - Bilateral Filter 保邊降噪
  - Unsharp Mask 銳化
  - 自適應二值化（block size 依短邊動態）
- **📄 多頁掃描**：右下角浮動 badge 累積多頁，一鍵合併匯出 A4 PDF。
- **📱 PWA 體驗**：可加到主畫面、離線可用、獨立 App 圖示、全螢幕 standalone。

---

## 🛠️ 技術棧

- **前端**：純 HTML / CSS / Vanilla JS (ES modules)
- **影像處理**：OpenCV.js (WASM)
- **效能**：Web Worker + 內建 Mat pool（`(rows, cols, type)` 快取、cap 8），主緒不被影像運算卡死
- **PWA**：Service Worker 預快取所有資源、離線可用
- **開發**：Python 3 內建 HTTPS 伺服器（`serve.py`）方便手機透過同 Wi-Fi 熱點測試

沒有後端、沒有雲端、沒有帳號系統，也沒有 AI 模型下載（早期版本用過 YOLOv8-tfjs，已於 v2.2 完全移除）。

---

## 🚀 本機開發 / 手機測試

因為手機瀏覽器需要 HTTPS 才能開相機權限，附一支 Python 腳本一鍵起 HTTPS 伺服器：

```bash
python serve.py
```

- 預設 port 8443（`python serve.py 9443` 可指定其他 port）
- 若沒有 `cert.pem` / `key.pem` 會自動用 `cryptography` 套件產一組（也支援 openssl CLI）
- 啟動後會列出電腦所有區網 IP；手機連到**同一個 Wi-Fi**（例如手機開熱點）即可透過 `https://<內網IP>:8443/` 開啟
- 首次連線瀏覽器會警告憑證不受信任 → 進階 → 繼續前往

`cert.pem` / `key.pem` 已在 `.gitignore` 排除，不會上傳。

---

## 📤 部署到 GitHub Pages

本專案是純靜態網站，不需要任何後端或建置步驟：

1. Fork 或複製到你自己的 repo
2. Settings → Pages → Source 選 `Deploy from a branch` → Branch 選 `main`、資料夾 `/(root)` → Save
3. 等 1-3 分鐘即可透過 `https://<你的帳號>.github.io/<repo-name>/` 開啟

Service Worker 有版本號機制，你更新程式碼時只要改 `sw.js` 裡的 `CACHE_NAME` 版本，使用者的 PWA 下次啟動就會自動更新。

---

## 📐 專案結構

```
├─ index.html
├─ manifest.json
├─ sw.js                       # Service Worker (含 CACHE_NAME 版本)
├─ serve.py                    # 本機 HTTPS 開發伺服器
├─ icon.svg / icon-192.png / icon-512.png
├─ css/
│  └─ styles.css
└─ js/
   ├─ app.js                   # 進入點
   ├─ canvas-editor.js         # 主邏輯：偵測 / 手勢 / UI
   ├─ image-loader.js          # 圖片載入 + EXIF 方向處理
   ├─ pdf-export.js            # jsPDF 匯出
   ├─ state.js / ui.js
   ├─ detection/
   │  └─ opencv.js             # OpenCV 相關 helper
   └─ workers/
      └─ opencv-worker.js      # Web Worker：warp + enhance pipeline
```

---

## 🧭 使用流程

1. **首頁**：拍攝或從相簿選取照片
2. **編輯頁**：
   - 自動偵測邊界後，四個角/邊可以拖動或用方向鍵微調（**兩段式**：第一次點只選取，再點才拖曳）
   - 濾鏡：亮度 / 對比 / 飽和度 / 銳化 / 降噪 + 黑白 / 文件強化 / 去除陰影 / 自動白平衡
   - 比例：證件 / A4 / 4:3 / 16:9 / 自由；輸出解析度可選
3. **結果頁**：下載 JPG / 下載 PDF / 加入多頁 / 分享；點圖可放大檢視

---

## 🗺️ 路線圖 (可能的方向)

- [ ] 即時相機取景時的邊框預覽（`getUserMedia` + 每幀低解析偵測）
- [ ] Tesseract.js OCR「複製文字」按鈕
- [ ] 多頁模式頂端 toggle：拍完自動加入、免每次按「加入多頁」
- [ ] 文字自動轉正（依水平線角度統計）
- [ ] 證件正反面拼版 A4 匯出
- [ ] 純函式（scoreQuad / pickBorderLines）加單元測試
- [ ] PWA 更新可用時彈 toast

---

## 📝 授權

MIT。歡迎 fork、修改、二次發行；如果覺得有用給個 ⭐ 就好。
