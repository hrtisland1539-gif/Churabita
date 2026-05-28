import fitz  # PyMuPDF

# 書類種別ごとのデフォルト押印位置
# 「印」マークが検出されない場合のフォールバック用
FALLBACK_POSITIONS = {
    "receipt": {"x_ratio": 0.874, "y_ratio": 0.228},   # 領収書: 会社情報欄の直下
    "delivery": {"x_ratio": 0.874, "y_ratio": 0.234},  # 納品書: 「印」マーク位置
}


def find_stamp_position(pdf_path: str, keyword: str = "印") -> dict | None:
    """
    PDF内でキーワード（デフォルト「印」）を検索し、
    その位置をページサイズで正規化した座標として返す。

    Returns:
        {"x_ratio": float, "y_ratio": float, "page": int} or None
    """
    doc = fitz.open(pdf_path)
    for page_idx, page in enumerate(doc):
        hits = page.search_for(keyword)
        if hits:
            rect = hits[0]  # 最初にヒットした位置
            pw = page.rect.width
            ph = page.rect.height
            cx = (rect.x0 + rect.x1) / 2
            cy = (rect.y0 + rect.y1) / 2
            doc.close()
            return {
                "x_ratio": cx / pw,
                "y_ratio": cy / ph,
                "page": page_idx,
            }
    doc.close()
    return None


def stamp_pdf(
    input_path: str,
    stamp_png_path: str,
    output_path: str,
    x_ratio: float,
    y_ratio: float,
    stamp_size_ratio: float = 0.10,
    page_index: int | None = None,
) -> None:
    """
    既存PDFの指定ページに印鑑を押印して保存する。

    x_ratio, y_ratio: クリック位置をページサイズで正規化した値 (0.0〜1.0)
                      クリック位置が印鑑の中心になる
    stamp_size_ratio: ページ幅に対する印鑑サイズの比率
    page_index: 押印するページ番号 (0始まり)。None の場合は全ページ
    """
    doc = fitz.open(input_path)

    for i, page in enumerate(doc):
        if page_index is not None and i != page_index:
            continue

        pw = page.rect.width
        ph = page.rect.height
        stamp_size = pw * stamp_size_ratio

        # クリック位置を中心として印鑑を配置（PyMuPDF は左上原点・Y軸下向き）
        x0 = x_ratio * pw - stamp_size / 2
        y0 = y_ratio * ph - stamp_size / 2
        x1 = x0 + stamp_size
        y1 = y0 + stamp_size

        rect = fitz.Rect(x0, y0, x1, y1)
        page.insert_image(rect, filename=stamp_png_path, overlay=True)

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
