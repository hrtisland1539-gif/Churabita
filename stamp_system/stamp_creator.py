from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
STAMP_COLOR = (204, 0, 0, 255)       # 赤 (不透明)
STAMP_COLOR_ALPHA = (204, 0, 0, 200) # 赤 (半透明プレビュー用)


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def _draw_vertical_text(draw: ImageDraw.ImageDraw, text: str,
                        cx: int, top_y: int, font: ImageFont.FreeTypeFont,
                        fill: tuple, char_gap: int = 6) -> None:
    """各文字を縦に並べて描画する（Pillowは縦書き非対応のため個別描画）"""
    for i, char in enumerate(text):
        bb = font.getbbox(char)
        cw = bb[2] - bb[0]
        ch = bb[3] - bb[1]
        draw.text((cx - cw // 2, top_y + i * (ch + char_gap)), char, font=font, fill=fill)


def _text_block_height(text: str, font: ImageFont.FreeTypeFont, char_gap: int = 6) -> int:
    total = 0
    for i, char in enumerate(text):
        bb = font.getbbox(char)
        ch = bb[3] - bb[1]
        total += ch + (char_gap if i < len(text) - 1 else 0)
    return total


def create_kaku_in(
    lines: list[str],
    size_px: int = 400,
    color: tuple = STAMP_COLOR,
) -> Image.Image:
    """
    角印（正方形の会社印）のPNG画像を生成する。

    lines: 縦書きで表示するテキストのリスト（列ごと）
           例: ["株式会社", "チュラビタ"] → 2列の縦書き
    size_px: 画像の一辺のピクセル数
    color: 印鑑の色 (R, G, B, A)
    """
    img = Image.new("RGBA", (size_px, size_px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 二重枠の描画
    outer_margin = int(size_px * 0.04)
    outer_lw = max(4, int(size_px * 0.012))
    inner_gap = int(size_px * 0.03)
    inner_lw = max(2, int(size_px * 0.006))

    # 外枠
    draw.rectangle(
        [outer_margin, outer_margin, size_px - outer_margin, size_px - outer_margin],
        outline=color, width=outer_lw,
    )
    # 内枠
    inner_margin = outer_margin + outer_lw + inner_gap
    draw.rectangle(
        [inner_margin, inner_margin, size_px - inner_margin, size_px - inner_margin],
        outline=color, width=inner_lw,
    )

    # テキスト領域
    text_area_size = size_px - 2 * (inner_margin + inner_lw + int(size_px * 0.04))
    n_cols = len(lines)

    # 各列を等幅で配置
    col_width = text_area_size // n_cols
    text_area_left = (size_px - text_area_size) // 2
    text_area_top = (size_px - text_area_size) // 2

    for col_idx, line_text in enumerate(lines):
        if not line_text:
            continue
        cx = text_area_left + col_width * col_idx + col_width // 2

        # フォントサイズをテキスト長さに合わせて自動調整
        font_size = int(text_area_size / max(len(line_text), 1) * 0.85)
        font_size = min(font_size, int(col_width * 0.75))
        font_size = max(font_size, 10)
        font = _load_font(font_size)

        block_h = _text_block_height(line_text, font)
        top_y = text_area_top + (text_area_size - block_h) // 2
        _draw_vertical_text(draw, line_text, cx, top_y, font, color)

    return img


def save_stamp(img: Image.Image, output_path: str) -> None:
    img.save(output_path, "PNG")
