import os
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from pdf2image import convert_from_path

from stamp_creator import create_kaku_in, save_stamp
from pdf_stamper import stamp_pdf

app = Flask(__name__)

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

STAMP_PNG = UPLOAD_DIR / "stamp.png"


def _allowed_pdf(filename: str) -> bool:
    return filename.lower().endswith(".pdf")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/create-stamp", methods=["POST"])
def api_create_stamp():
    """印鑑画像を生成して保存する"""
    data = request.get_json(force=True)
    lines = data.get("lines", ["株式会社", "チュラビタ"])
    size_px = int(data.get("size_px", 400))

    img = create_kaku_in(lines=lines, size_px=size_px)
    save_stamp(img, str(STAMP_PNG))
    return jsonify({"ok": True, "message": "印鑑を作成しました"})


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """PDFをアップロードし、1ページ目のプレビュー画像をBase64で返す"""
    if "pdf" not in request.files:
        return jsonify({"ok": False, "error": "ファイルがありません"}), 400

    f = request.files["pdf"]
    if not _allowed_pdf(f.filename):
        return jsonify({"ok": False, "error": "PDFファイルのみ対応しています"}), 400

    session_id = uuid.uuid4().hex
    pdf_path = UPLOAD_DIR / f"{session_id}.pdf"
    f.save(str(pdf_path))

    # 全ページをプレビュー用PNG に変換
    images = convert_from_path(str(pdf_path), dpi=120)
    preview_paths = []
    for idx, img in enumerate(images):
        preview_path = UPLOAD_DIR / f"{session_id}_page{idx}.png"
        img.save(str(preview_path), "PNG")
        preview_paths.append(f"/api/preview/{session_id}/{idx}")

    return jsonify({
        "ok": True,
        "session_id": session_id,
        "pages": len(images),
        "previews": preview_paths,
    })


@app.route("/api/stamp-preview")
def api_stamp_preview():
    """生成済み印鑑画像を返す（オーバーレイ表示用）"""
    if not STAMP_PNG.exists():
        return "Not found", 404
    return send_file(str(STAMP_PNG), mimetype="image/png")


@app.route("/api/preview/<session_id>/<int:page_idx>")
def api_preview(session_id: str, page_idx: int):
    """プレビュー画像を返す"""
    preview_path = UPLOAD_DIR / f"{session_id}_page{page_idx}.png"
    if not preview_path.exists():
        return "Not found", 404
    return send_file(str(preview_path), mimetype="image/png")


@app.route("/api/stamp", methods=["POST"])
def api_stamp():
    """指定位置に押印してPDFを返す"""
    if not STAMP_PNG.exists():
        return jsonify({"ok": False, "error": "先に印鑑を作成してください"}), 400

    data = request.get_json(force=True)
    session_id = data.get("session_id")
    x_ratio = float(data.get("x_ratio", 0.5))
    y_ratio = float(data.get("y_ratio", 0.5))
    page_index = data.get("page_index")  # None = 全ページ
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
