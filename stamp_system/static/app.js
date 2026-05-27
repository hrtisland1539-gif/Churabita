/* 電子印鑑システム – app.js */

const state = {
  sessionId: null,
  totalPages: 0,
  currentPage: 0,
  stampPos: null,          // { xRatio, yRatio } — ユーザーが指定した押印位置
  detectedPos: null,       // { x_ratio, y_ratio, page } — 自動検出された印位置
  stampReady: false,
};

// ── DOM refs ─────────────────────────────────
const stampResult     = document.getElementById("stamp-result");
const stampPreviewImg = document.getElementById("stamp-preview-img");

const linesContainer  = document.getElementById("lines-container");
const addLineBtn      = document.getElementById("add-line-btn");
const createStampBtn  = document.getElementById("create-stamp-btn");

const stampDropZone   = document.getElementById("stamp-drop-zone");
const stampFileInput  = document.getElementById("stamp-file-input");

const pdfDropZone     = document.getElementById("pdf-drop-zone");
const pdfInput        = document.getElementById("pdf-input");
const useSampleBtn    = document.getElementById("use-sample-btn");

const stampSection    = document.getElementById("stamp-section");
const downloadSection = document.getElementById("download-section");

const previewWrapper  = document.getElementById("preview-wrapper");
const previewImg      = document.getElementById("preview-img");
const stampOverlay    = document.getElementById("stamp-overlay");
const detectedMarker  = document.getElementById("detected-marker");
const pageInfo        = document.getElementById("page-info");
const prevPageBtn     = document.getElementById("prev-page-btn");
const sizeSlider      = document.getElementById("size-slider");
const sizeValue       = document.getElementById("size-value");
const nextPageBtn     = document.getElementById("next-page-btn");
const autoHint        = document.getElementById("auto-hint");

const applyAllCheck   = document.getElementById("apply-all-check");
const doStampBtn      = document.getElementById("do-stamp-btn");
const downloadLink    = document.getElementById("download-link");

// ── Tab switcher ──────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ── STEP 1A: テキストから印鑑作成 ────────────

addLineBtn.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "line-input";
  input.placeholder = "テキスト（縦書き1列）";
  linesContainer.appendChild(input);
});

createStampBtn.addEventListener("click", async () => {
  const inputs = linesContainer.querySelectorAll(".line-input");
  const lines = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
  if (!lines.length) { alert("印鑑に表示するテキストを入力してください"); return; }

  createStampBtn.disabled = true;
  createStampBtn.textContent = "作成中…";

  const res  = await fetch("/api/create-stamp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  const json = await res.json();

  createStampBtn.disabled = false;
  createStampBtn.textContent = "印鑑を作成";

  if (!json.ok) { alert("エラー: " + json.error); return; }
  _showStampReady();
});

// ── STEP 1B: 印鑑画像アップロード ────────────

stampDropZone.addEventListener("click",     () => stampFileInput.click());
stampDropZone.addEventListener("dragover",  e  => { e.preventDefault(); stampDropZone.classList.add("drag-over"); });
stampDropZone.addEventListener("dragleave", () => stampDropZone.classList.remove("drag-over"));
stampDropZone.addEventListener("drop",      e  => {
  e.preventDefault();
  stampDropZone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) _uploadStampImage(e.dataTransfer.files[0]);
});
stampFileInput.addEventListener("change", () => {
  if (stampFileInput.files[0]) _uploadStampImage(stampFileInput.files[0]);
});

async function _uploadStampImage(file) {
  stampDropZone.textContent = "アップロード中…";
  const fd = new FormData();
  fd.append("stamp", file);
  const res  = await fetch("/api/upload-stamp-image", { method: "POST", body: fd });
  const json = await res.json();
  stampDropZone.innerHTML = '<span class="icon">🖼</span>PNG / JPG 形式の印鑑画像をドラッグ&ドロップ<br>またはクリックして選択';
  if (!json.ok) { alert("エラー: " + json.error); return; }
  _showStampReady();
}

function _showStampReady() {
  stampPreviewImg.src = "/api/stamp-preview?" + Date.now();
  stampOverlay.style.backgroundImage = `url('/api/stamp-preview?${Date.now()}')`;
  stampResult.classList.add("show");
  state.stampReady = true;
  _updateDoStampBtn();
}

// ── STEP 2: PDF 選択 ─────────────────────────

pdfDropZone.addEventListener("click",     () => pdfInput.click());
pdfDropZone.addEventListener("dragover",  e  => { e.preventDefault(); pdfDropZone.classList.add("drag-over"); });
pdfDropZone.addEventListener("dragleave", () => pdfDropZone.classList.remove("drag-over"));
pdfDropZone.addEventListener("drop",      e  => {
  e.preventDefault();
  pdfDropZone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) _handlePdf(e.dataTransfer.files[0]);
});
pdfInput.addEventListener("change", () => {
  if (pdfInput.files[0]) _handlePdf(pdfInput.files[0]);
});

useSampleBtn.addEventListener("click", async () => {
  useSampleBtn.disabled = true;
  useSampleBtn.textContent = "読み込み中…";
  const res  = await fetch("/api/use-sample", { method: "POST" });
  const json = await res.json();
  useSampleBtn.disabled = false;
  useSampleBtn.textContent = "このPDFを使う";
  if (!json.ok) { alert("エラー: " + json.error); return; }
  _onPdfLoaded(json, "delivery_20260521001.pdf");
});

async function _handlePdf(file) {
  if (!file.name.toLowerCase().endsWith(".pdf")) { alert("PDFファイルを選択してください"); return; }
  pdfDropZone.innerHTML = '<span class="icon">⏳</span>アップロード中…';
  const fd = new FormData();
  fd.append("pdf", file);
  const res  = await fetch("/api/upload", { method: "POST", body: fd });
  const json = await res.json();
  pdfDropZone.innerHTML = `<span class="icon">✅</span>${file.name}`;
  if (!json.ok) { alert("エラー: " + json.error); return; }
  _onPdfLoaded(json, file.name);
}

function _onPdfLoaded(json, filename) {
  state.sessionId    = json.session_id;
  state.totalPages   = json.pages;
  state.currentPage  = 0;
  state.stampPos     = null;
  state.detectedPos  = json.detected_stamp_pos;

  pdfDropZone.innerHTML = `<span class="icon">✅</span>${filename}`;
  stampSection.style.display  = "block";
  downloadSection.style.display = "none";

  _loadPage(0);
}

// ── STEP 3: プレビュー & 押印位置指定 ────────

function _loadPage(idx) {
  state.currentPage = idx;
  state.stampPos    = null;
  stampOverlay.style.display    = "none";
  detectedMarker.style.display  = "none";
  autoHint.classList.remove("show");

  previewImg.src = `/api/preview/${state.sessionId}/${idx}`;
  previewImg.onload = () => _applyDetectedPos();

  pageInfo.textContent   = `${idx + 1} / ${state.totalPages}`;
  prevPageBtn.disabled   = idx === 0;
  nextPageBtn.disabled   = idx === state.totalPages - 1;
  _updateDoStampBtn();
}

prevPageBtn.addEventListener("click", () => _loadPage(state.currentPage - 1));
nextPageBtn.addEventListener("click", () => _loadPage(state.currentPage + 1));

/** 自動検出位置をマーカー表示してデフォルト押印位置にセットする */
function _applyDetectedPos() {
  const d = state.detectedPos;
  if (!d || d.page !== state.currentPage) return;

  const rect = previewWrapper.getBoundingClientRect();
  const MARKER_SIZE = 60;

  const mx = d.x_ratio * rect.width  - MARKER_SIZE / 2;
  const my = d.y_ratio * rect.height - MARKER_SIZE / 2;

  detectedMarker.style.left   = mx + "px";
  detectedMarker.style.top    = my + "px";
  detectedMarker.style.width  = MARKER_SIZE + "px";
  detectedMarker.style.height = MARKER_SIZE + "px";
  detectedMarker.style.display = "block";

  // デフォルト押印位置として自動セット
  state.stampPos = { xRatio: d.x_ratio, yRatio: d.y_ratio };
  _placeStampOverlay(d.x_ratio, d.y_ratio);

  autoHint.classList.add("show");
  _updateDoStampBtn();
}

/** クリック / タップで押印位置を指定 */
function _handlePlacement(clientX, clientY) {
  const rect = previewWrapper.getBoundingClientRect();
  const xRatio = Math.min(1, Math.max(0, (clientX - rect.left)  / rect.width));
  const yRatio = Math.min(1, Math.max(0, (clientY - rect.top)   / rect.height));
  state.stampPos = { xRatio, yRatio };

  // 自動検出マーカーを隠す（ユーザーが上書き）
  detectedMarker.style.display = "none";
  autoHint.classList.remove("show");

  _placeStampOverlay(xRatio, yRatio);
  _updateDoStampBtn();
}

/** スライダー値(5〜25) をオーバーレイpxサイズに変換 */
function _sliderToOverlayPx() {
  const ratio = parseInt(sizeSlider.value) / 100;        // 0.05〜0.25
  const rect  = previewWrapper.getBoundingClientRect();
  return rect.width * ratio;
}

function _placeStampOverlay(xRatio, yRatio) {
  const rect        = previewWrapper.getBoundingClientRect();
  const overlaySize = _sliderToOverlayPx();
  stampOverlay.style.left    = (xRatio * rect.width  - overlaySize / 2) + "px";
  stampOverlay.style.top     = (yRatio * rect.height - overlaySize / 2) + "px";
  stampOverlay.style.width   = overlaySize + "px";
  stampOverlay.style.height  = overlaySize + "px";
  stampOverlay.style.display = "block";
}

// ── サイズスライダー ──────────────────────────
// A4幅 595pt ≈ 210mm → 1pt ≈ 0.353mm → ratio×595pt×0.353mm/pt でmm換算
function _ratioToMm(ratio) {
  return Math.round(ratio * 210);  // A4幅210mm基準
}

sizeSlider.addEventListener("input", () => {
  const ratio = parseInt(sizeSlider.value) / 100;
  sizeValue.textContent = `約${_ratioToMm(ratio)}mm`;
  // オーバーレイが表示中なら位置を保ったままサイズだけ更新
  if (state.stampPos) {
    _placeStampOverlay(state.stampPos.xRatio, state.stampPos.yRatio);
  }
});

previewWrapper.addEventListener("click", e => _handlePlacement(e.clientX, e.clientY));
previewWrapper.addEventListener("touchend", e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  _handlePlacement(t.clientX, t.clientY);
});

// ── STEP 4: 押印 & ダウンロード ──────────────

function _updateDoStampBtn() {
  doStampBtn.disabled = !(state.stampReady && state.sessionId && state.stampPos);
}

doStampBtn.addEventListener("click", async () => {
  if (!state.stampPos) return;

  doStampBtn.disabled = true;
  doStampBtn.textContent = "押印中…";

  const pageIndex = applyAllCheck.checked ? null : state.currentPage;

  const stampSizeRatio = parseInt(sizeSlider.value) / 100;  // スライダー値 → ratio

  const res = await fetch("/api/stamp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id:       state.sessionId,
      x_ratio:          state.stampPos.xRatio,
      y_ratio:          state.stampPos.yRatio,
      stamp_size_ratio: stampSizeRatio,
      page_index:       pageIndex,
    }),
  });

  doStampBtn.disabled = false;
  doStampBtn.textContent = "押印する";

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    alert("エラー: " + (json.error || res.statusText));
    return;
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  downloadLink.href     = url;
  downloadLink.download = "stamped.pdf";
  downloadSection.style.display = "block";
  downloadLink.scrollIntoView({ behavior: "smooth" });
});
