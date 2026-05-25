import fitz  # PyMuPDF


def stamp_pdf(
    input_path: str,
    stamp_png_path: str,
    output_path: str,
    x_ratio: float,
    y_ratio: float,
    stamp_size_ratio: float = 0.15,
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

        # クリック位置を中心として印鑑を配置（PDF座標は左上原点）
        x0 = x_ratio * pw - stamp_size / 2
        y0 = y_ratio * ph - stamp_size / 2
        x1 = x0 + stamp_size
        y1 = y0 + stamp_size

        rect = fitz.Rect(x0, y0, x1, y1)
        page.insert_image(rect, filename=stamp_png_path, overlay=True)

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
