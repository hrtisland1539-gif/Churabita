/* 電子印鑑システム フロントエンド */

const state = {
  sessionId: null,
  totalPages: 0,
  currentPage: 0,
  stampPos: null,          // { xRatio, yRatio }
  stampCreated: false,
};

// ── DOM refs ──────────────────────────────────────────
const setupSection   = document.getElementById("setup-section");
const stampSection   = document.getElementById("stamp-section");
const downloadSection= document.getElementById("download-section");

const linesContainer = document.getElementById("lines-container");
const addLineBtn     = document.getElementById("add-line-btn");
const createStampBtn = document.getElementById("create-stamp-btn");
const stampPreviewImg= document.getElementById("stamp-preview-img");

const pdfInput       = document.getElementById("pdf-input");
const uploadArea     = document.getElementById("upload-area");

const previewWrapper = document.getElementById("preview-wrapper");
const previewImg     = document.getElementById("preview-img");
const stampOverlay   = document.getElementById("stamp-overlay");
const pageInfo       = document.getElementById("page-info");
const prevPageBtn    = document.getElementById("prev-page-btn");
const nextPageBtn    = document.getElementById("next-page-btn");

const applyAllCheck  = document.getElementById("apply-all-check");
const doStampBtn     = document.getElementById("do-stamp-btn");
const downloadLink   = document.getElementById("download-link");

// ── Stamp creator ──────────────────────────────────────
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
  if (lines.length === 0) {
    alert("印鑑に表示するテキストを入力してください");
    return;
  }

  createStampBtn.disabled = true;
  createStampBtn.textContent = "作成中…";

  const res = await fetch("/api/create-stamp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  const json = await res.json();

  createStampBtn.disabled = false;
  createStampBtn.textContent = "印鑑を作成";

  if (!json.ok) {
    alert("エラー: " + json.error);
    return;
  }

  // プレビュー表示（キャッシュバスト付き）
  stampPreviewImg.src = "/api/stamp-preview?" + Date.now();
  stampPreviewImg.style.display = "block";
  document.getElementById("stamp-created-msg").style.display = "block";
  // オーバーレイの背景画像も更新
  stampOverlay.style.backgroundImage = `url('/api/stamp-preview?${Date.now()}')`;
  state.stampCreated = true;
  updateDoStampBtn();
});

// ── PDF Upload ──────────────────────────────────────────
uploadArea.addEventListener("click", () => pdfInput.click());
uploadArea.addEventListener("dragover", e => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", e => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handlePdfFile(file);
});
pdfInput.addEventListener("change", () => {
  if (pdfInput.files[0]) handlePdfFile(pdfInput.files[0]);
});

async function handlePdfFile(file) {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    alert("PDFファイルを選択してください");
    return;
  }
  uploadArea.textContent = "アップロード中…";

  const formData = new FormData();
  formData.append("pdf", file);

  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const json = await res.json();

  if (!json.ok) {
    alert("エラー: " + json.error);
    uploadArea.textContent = "クリックまたはドラッグ&ドロップでPDFを選択";
    return;
  }

  state.sessionId = json.session_id;
  state.totalPages = json.pages;
  state.currentPage = 0;
  state.stampPos = null;

  uploadArea.textContent = `${file.name} (${json.pages}ページ)`;
  stampSection.style.display = "block";
  downloadSection.style.display = "none";
  loadPage(0);
}

// ── Preview & stamp placement ──────────────────────────
function loadPage(idx) {
  state.currentPage = idx;
  state.stampPos = null;
  stampOverlay.style.display = "none";
  previewImg.src = `/api/preview/${state.sessionId}/${idx}`;
  pageInfo.textContent = `${idx + 1} / ${state.totalPages}`;
  prevPageBtn.disabled = idx === 0;
  nextPageBtn.disabled = idx === state.totalPages - 1;
  updateDoStampBtn();
}

prevPageBtn.addEventListener("click", () => loadPage(state.currentPage - 1));
nextPageBtn.addEventListener("click", () => loadPage(state.currentPage + 1));

// クリック/タップで押印位置を指定
function handlePlacementEvent(clientX, clientY) {
  const rect = previewWrapper.getBoundingClientRect();
  const xRatio = (clientX - rect.left) / rect.width;
  const yRatio = (clientY - rect.top) / rect.height;

  // 0〜1 にクランプ
  state.stampPos = {
    xRatio: Math.min(1, Math.max(0, xRatio)),
    yRatio: Math.min(1, Math.max(0, yRatio)),
  };

  // オーバーレイの印鑑プレビューを配置
  const OVERLAY_SIZE = 80; // px
  stampOverlay.style.left = (state.stampPos.xRatio * rect.width - OVERLAY_SIZE / 2) + "px";
  stampOverlay.style.top  = (state.stampPos.yRatio * rect.height - OVERLAY_SIZE / 2) + "px";
  stampOverlay.style.width  = OVERLAY_SIZE + "px";
  stampOverlay.style.height = OVERLAY_SIZE + "px";
  stampOverlay.style.display = "block";

  updateDoStampBtn();
}

previewWrapper.addEventListener("click", e => handlePlacementEvent(e.clientX, e.clientY));
previewWrapper.addEventListener("touchend", e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  handlePlacementEvent(t.clientX, t.clientY);
});

// ── Apply stamp ────────────────────────────────────────
function updateDoStampBtn() {
  doStampBtn.disabled = !(state.stampCreated && state.sessionId && state.stampPos);
}

doStampBtn.addEventListener("click", async () => {
  if (!state.stampPos) return;

  doStampBtn.disabled = true;
  doStampBtn.textContent = "押印中…";

  const pageIndex = applyAllCheck.checked ? null : state.currentPage;

  const res = await fetch("/api/stamp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: state.sessionId,
      x_ratio: state.stampPos.xRatio,
      y_ratio: state.stampPos.yRatio,
      page_index: pageIndex,
    }),
  });

  doStampBtn.disabled = false;
  doStampBtn.textContent = "押印する";

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    alert("エラー: " + (json.error || res.statusText));
    return;
  }

  // BlobとしてダウンロードURLを生成
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = "stamped.pdf";
  downloadSection.style.display = "block";
  downloadLink.scrollIntoView({ behavior: "smooth" });
});
