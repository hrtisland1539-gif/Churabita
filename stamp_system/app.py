import os
import uuid
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, render_template, request, send_file
from pdf2image import convert_from_path
from PIL import Image

from stamp_creator import create_kaku_in, save_stamp
from pdf_stamper import stamp_pdf, find_stamp_position

app = Flask(__name__)

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

STAMP_PNG = UPLOAD_DIR / "stamp.png"
SAMPLE_PDF = BASE_DIR / "sample_delivery.pdf"

ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"}


def _allowed_pdf(filename: str) -> bool:
    return filename.lower().endswith(".pdf")


def _allowed_image(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_IMAGE_EXT


# ─────────────────────────────────────────────
#  Pages
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ─────────────────────────────────────────────
#  Stamp creation (text → generate)
# ─────────────────────────────────────────────

@app.route("/api/create-stamp", methods=["POST"])
def api_create_stamp():
    """テキストから角印画像を生成して保存する"""
    data = request.get_json(force=True)
    lines = data.get("lines", ["株式会社", "チュラビタ"])
    size_px = int(data.get("size_px", 400))

    img = create_kaku_in(lines=lines, size_px=size_px)
    save_stamp(img, str(STAMP_PNG))
    return jsonify({"ok": True, "message": "印鑑を作成しました"})


# ─────────────────────────────────────────────
#  Stamp upload (existing image)
# ─────────────────────────────────────────────

def _remove_white_background(img: Image.Image, threshold: int = 210) -> Image.Image:
    """白背景を透過処理して返す（RGBA変換済み）"""
    img_rgba = img.convert("RGBA")
    data = np.array(img_rgba, dtype=np.uint8)
    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]
    white_mask = (r > threshold) & (g > threshold) & (b > threshold)
    data[white_mask, 3] = 0
    return Image.fromarray(data, "RGBA")


def _crop_to_content(img: Image.Image, padding: int = 10) -> Image.Image:
    """透明部分を除いた bounding box でクロップする"""
    data = np.array(img)
    alpha = data[:, :, 3]
    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)
    if not rows.any() or not cols.any():
        return img
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    h, w = data.shape[:2]
    rmin = max(0, rmin - padding)
    rmax = min(h, rmax + padding)
    cmin = max(0, cmin - padding)
    cmax = min(w, cmax + padding)
    return img.crop((cmin, rmin, cmax, rmax))


@app.route("/api/upload-stamp-image", methods=["POST"])
def api_upload_stamp_image():
    """既存の印鑑画像（PNG/JPG/WebP等）をアップロードして保存する。
    白背景を自動透過化してから保存する。"""
    if "stamp" not in request.files:
        return jsonify({"ok": False, "error": "ファイルがありません"}), 400

    f = request.files["stamp"]
    if not _allowed_image(f.filename):
        return jsonify({"ok": False, "error": "PNG/JPG形式の画像ファイルを選択してください"}), 400

    img = Image.open(f.stream)
    img = _remove_white_background(img)   # 白背景を透過化
    img = _crop_to_content(img)           # 余白をトリム
    img = img.resize((400, 400), Image.LANCZOS)
    img.save(str(STAMP_PNG), "PNG")

    return jsonify({"ok": True, "message": "印鑑画像をアップロードしました（白背景を自動透過化済み）"})


@app.route("/api/stamp-preview")
def api_stamp_preview():
    """生成済み印鑑画像を返す（オーバーレイ表示用）"""
    if not STAMP_PNG.exists():
        return "Not found", 404
    return send_file(str(STAMP_PNG), mimetype="image/png")


# ─────────────────────────────────────────────
#  PDF upload & preview
# ─────────────────────────────────────────────

@app.route("/api/upload", methods=["POST"])
def api_upload():
    """PDFをアップロードし、全ページのプレビューURLと印位置を返す"""
    if "pdf" not in request.files:
        return jsonify({"ok": False, "error": "ファイルがありません"}), 400

    f = request.files["pdf"]
    if not _allowed_pdf(f.filename):
        return jsonify({"ok": False, "error": "PDFファイルのみ対応しています"}), 400

    session_id = uuid.uuid4().hex
    pdf_path = UPLOAD_DIR / f"{session_id}.pdf"
    f.save(str(pdf_path))

    return _process_pdf(session_id, pdf_path)


@app.route("/api/use-sample", methods=["POST"])
def api_use_sample():
    """サンプル納品書PDFを使用する"""
    if not SAMPLE_PDF.exists():
        return jsonify({"ok": False, "error": "サンプルPDFが見つかりません"}), 404

    session_id = uuid.uuid4().hex
    pdf_path = UPLOAD_DIR / f"{session_id}.pdf"
    import shutil
    shutil.copy(str(SAMPLE_PDF), str(pdf_path))

    return _process_pdf(session_id, pdf_path)


def _process_pdf(session_id: str, pdf_path: Path) -> object:
    """PDFをプレビュー変換し、印位置を検出してレスポンスを返す"""
    images = convert_from_path(str(pdf_path), dpi=120)
    for idx, img in enumerate(images):
        preview_path = UPLOAD_DIR / f"{session_id}_page{idx}.png"
        img.save(str(preview_path), "PNG")

    # 「印」の位置を自動検出
    detected = find_stamp_position(str(pdf_path), keyword="印")

    return jsonify({
        "ok": True,
        "session_id": session_id,
        "pages": len(images),
        "previews": [f"/api/preview/{session_id}/{i}" for i in range(len(images))],
        "detected_stamp_pos": detected,   # {"x_ratio", "y_ratio", "page"} or null
    })


@app.route("/api/preview/<session_id>/<int:page_idx>")
def api_preview(session_id: str, page_idx: int):
    """プレビュー画像を返す"""
    preview_path = UPLOAD_DIR / f"{session_id}_page{page_idx}.png"
    if not preview_path.exists():
        return "Not found", 404
    return send_file(str(preview_path), mimetype="image/png")


# ─────────────────────────────────────────────
#  Stamp application
# ─────────────────────────────────────────────

@app.route("/api/stamp", methods=["POST"])
def api_stamp():
    """指定位置に押印してPDFを返す"""
    if not STAMP_PNG.exists():
        return jsonify({"ok": False, "error": "先に印鑑を準備してください"}), 400

    data = request.get_json(force=True)
    session_id = data.get("session_id")
    x_ratio = float(data.get("x_ratio", 0.5))
    y_ratio = float(data.get("y_ratio", 0.5))
    stamp_size_ratio = float(data.get("stamp_size_ratio", 0.10))  # デフォルト10%≈21mm
    page_index = data.get("page_index")
    if page_index is not None:
        page_index = int(page_index)

    pdf_path = UPLOAD_DIR / f"{session_id}.pdf"
    if not pdf_path.exists():
        return jsonify({"ok": False, "error": "PDFが見つかりません"}), 404

    output_path = UPLOAD_DIR / f"{session_id}_stamped.pdf"
    stamp_pdf(
        input_path=str(pdf_path),
        stamp_png_path=str(STAMP_PNG),
        output_path=str(output_path),
        x_ratio=x_ratio,
        y_ratio=y_ratio,
        stamp_size_ratio=stamp_size_ratio,
        page_index=page_index,
    )
    return send_file(
        str(output_path),
        mimetype="application/pdf",
        as_attachment=True,
        download_name="stamped.pdf",
    )


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
