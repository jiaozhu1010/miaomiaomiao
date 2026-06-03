#!/usr/bin/env python3
"""
物流面单 OCR 识别脚本 — 增强版
- 小字体：多级放大 + 多阈值二值化合并
- 大图片：重叠分块处理，保留细节不缩放
- 更多单号：OCR 字符纠错 + 模糊前缀匹配
用法:
  python ocr_shipping.py --mode tracking <image_path>
  python ocr_shipping.py --mode shipping <image_path>
"""

import argparse
import json
import math
import os
import re
import sys
import tempfile

try:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# ── OCR 字符纠错映射 ──
OCR_DIGIT_MAP = {
    'O': '0', 'Q': '0', 'D': '0', 'U': '0',
    'I': '1', 'L': '1', '|': '1', 'l': '1',
    'S': '5', 's': '5',
    'B': '8',
    'Z': '2', 'z': '2',
    'G': '6',
    'A': '4',
    'T': '7',
}

# 常见前缀误读 → 正确前缀
FUZZY_PREFIX_MAP = {
    '0PK': 'DPK', 'OPK': 'DPK', 'DPK': 'DPK',
    'DPI': 'DPL', 'DP1': 'DPL', 'DPL': 'DPL',
    '0PL': 'DPL', 'OPL': 'DPL',
}


def correct_ocr_digits(chunk):
    """将 OCR 误读的数字字符纠正为正确数字。"""
    result = []
    for ch in chunk:
        if ch.isdigit():
            result.append(ch)
        else:
            corrected = OCR_DIGIT_MAP.get(ch.upper(), '')
            result.append(corrected)
    return ''.join(result)


def get_ocr_prefix(text, index):
    """在文本的指定位置尝试识别 DPK/DPL 前缀（含模糊匹配）。"""
    if index + 3 > len(text):
        return ''
    chunk = text[index:index + 3].upper()
    return FUZZY_PREFIX_MAP.get(chunk, '')


def extract_tracking_codes_smart(text):
    """
    智能提取 DPK/DPL 单号 — 模拟前端 extractSmartTrackingCodes 逻辑。
    扫描全文，对每个可能的 DPK/DPL 位置尝试读取后续 12 位数字（含纠错）。
    """
    compact = re.sub(r'[^A-Za-z0-9|]', '', text).upper()
    found = []
    seen = set()

    i = 0
    while i < len(compact) - 2:
        prefix = get_ocr_prefix(compact, i)
        if not prefix:
            i += 1
            continue

        # 读取后续最多 30 个字符，提取数字
        tail = compact[i + 3:i + 33]
        digits = ''
        for offset, ch in enumerate(tail):
            # 如果遇到下一个前缀，停止
            if offset > 0 and get_ocr_prefix(compact, i + 3 + offset):
                break
            corrected = correct_ocr_digits(ch)
            if corrected:
                digits += corrected
            if len(digits) == 12:
                code = f"{prefix}{digits}"
                if code not in seen:
                    seen.add(code)
                    found.append(code)
                break

        i += 1

    return found


def preprocess_for_ocr(img, target_min_width=2400, threshold=90):
    """
    对 PIL Image 做增强预处理，返回处理后的 PIL Image。
    - 放大到 target_min_width（如果原图更小）
    - 灰度化 + 自适应直方图拉伸
    - Unsharp Mask 锐化
    - 二值化增强（可指定阈值）
    """
    w, h = img.size

    # 放大过小的图片
    if w < target_min_width:
        scale = target_min_width / w
        new_w = target_min_width
        new_h = int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    # 转为灰度
    if img.mode != 'L':
        img = img.convert('L')

    # 自适应直方图拉伸
    img = ImageOps.autocontrast(img, cutoff=2)

    # Unsharp Mask 锐化
    blurred = img.filter(ImageFilter.GaussianBlur(radius=1.5))
    img = Image.blend(img, blurred, -0.4)

    # 二值化增强
    img = img.point(lambda p: 0 if p < threshold else (255 if p > 210 else p))

    return img


def ocr_on_image(img, ocr):
    """
    对单个 PIL Image 运行 PaddleOCR predict，返回 [(bbox, (text, conf)), ...]。
    先将图片写入临时文件（PaddleOCR 需要文件路径）。
    """
    tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
    try:
        img.save(tmp.name, 'PNG', optimize=True)
        raw = ocr.predict(tmp.name)
        return _normalize_predict(raw)
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


def _normalize_predict(raw):
    """Convert PaddleOCR predict() output to legacy format: [(bbox, (text, conf)), ...]"""
    if not raw:
        return []
    lines = []
    for page in raw:
        rec_texts = page.get('rec_texts', [])
        rec_scores = page.get('rec_scores', [])
        dt_polys = page.get('dt_polys', [])
        for i, text in enumerate(rec_texts):
            bbox = dt_polys[i] if i < len(dt_polys) else [[0, 0], [0, 0], [0, 0], [0, 0]]
            conf = rec_scores[i] if i < len(rec_scores) else 0.0
            lines.append((bbox, (text, conf)))
    return lines


def get_ocr():
    """惰性加载 PaddleOCR，优化检测参数以识别更小字体和更多文本区域。"""
    from paddleocr import PaddleOCR
    return PaddleOCR(
        lang='ch',
        use_textline_orientation=True,
        use_angle_cls=True,           # 新增：处理旋转文本
        text_det_thresh=0.15,         # 降低：检测更小的文本（原 0.25）
        text_det_box_thresh=0.25,     # 降低：更宽松的文本框过滤（原 0.4）
        text_recognition_batch_size=12,  # 增大批处理（原 6）
    )


# ── 大图分块处理 ──

def tile_image(img, tile_width=3000, overlap=0.25):
    """
    将大图水平切分为多个重叠块，Y 轴根据宽高比自适应切分。
    返回 [(tile_image, (x_offset, y_offset)), ...]
    """
    w, h = img.size
    tiles = []

    # 水平方向切分
    step_x = int(tile_width * (1 - overlap))
    x_starts = list(range(0, w, step_x))

    # 垂直方向：如果图片很高，也切分
    tile_height = int(tile_width * 1.5)  # 每块高度 = 宽度 * 1.5
    step_y = int(tile_height * (1 - overlap))
    y_starts = list(range(0, h, step_y))

    for y0 in y_starts:
        for x0 in x_starts:
            x1 = min(x0 + tile_width, w)
            y1 = min(y0 + tile_height, h)
            # 跳过太小的边缘块
            if (x1 - x0) < tile_width * 0.3 or (y1 - y0) < tile_height * 0.3:
                continue
            tile = img.crop((x0, y0, x1, y1))
            tiles.append((tile, (x0, y0)))

    return tiles


# ── 模式函数 ──

def mode_tracking(image_path):
    """提取 DPK/DPL 单号（增强版：多阈值合并 + 大图分块）。"""
    if not HAS_PIL:
        # 无 PIL 时的兜底
        ocr = get_ocr()
        raw = ocr.predict(image_path)
        results = _normalize_predict(raw)
        all_text = ' '.join(line[1][0] for line in results)
        codes = extract_tracking_codes_smart(all_text)
        return {"codes": codes, "raw_text": all_text}

    img = Image.open(image_path).convert('RGB')
    w, h = img.size
    all_codes = []
    all_text_parts = []

    ocr = get_ocr()

    # ── 策略1：多阈值预处理 + 全图 OCR ──
    thresholds = [70, 100, 130]
    for thresh in thresholds:
        try:
            processed = preprocess_for_ocr(img.copy(), target_min_width=2400, threshold=thresh)
            results = ocr_on_image(processed, ocr)
            text = ' '.join(line[1][0] for line in results)
            all_text_parts.append(text)
        except Exception:
            continue

    # ── 策略2：大图分块处理 ──
    if w > 2800 or h > 4000:
        tiles = tile_image(img, tile_width=2800, overlap=0.25)
        for tile, (ox, oy) in tiles:
            try:
                processed_tile = preprocess_for_ocr(tile.copy(), target_min_width=2000, threshold=90)
                results = ocr_on_image(processed_tile, ocr)
                text = ' '.join(line[1][0] for line in results)
                all_text_parts.append(text)
            except Exception:
                continue

    combined_text = ' '.join(all_text_parts)
    codes = extract_tracking_codes_smart(combined_text)

    return {"codes": codes, "raw_text": combined_text}


def find_value_near_label(results, label_keywords, value_pattern=None):
    """在 OCR 结果中查找标签附近的数值/文本。"""
    if not results:
        return ''

    label_idx = None
    for i, line in enumerate(results):
        text = line[1][0]
        for kw in label_keywords:
            if kw in text:
                label_idx = i
                break
        if label_idx is not None:
            break

    if label_idx is None:
        all_text = ' '.join(line[1][0] for line in results)
        if value_pattern:
            match = re.search(value_pattern, all_text)
            return match.group(0) if match else ''
        return ''

    label_box = results[label_idx][0]
    label_text = results[label_idx][1][0]
    label_center_y = (label_box[0][1] + label_box[2][1]) / 2
    label_right_x = max(p[0] for p in label_box)

    candidates = []
    for i, line in enumerate(results):
        if i == label_idx:
            if value_pattern:
                remaining = label_text
                for kw in label_keywords:
                    remaining = remaining.replace(kw, '')
                match = re.search(value_pattern, remaining)
                if match:
                    return match.group(0)
            continue

        box = line[0]
        text_val = line[1][0]
        line_center_y = (box[0][1] + box[2][1]) / 2
        line_left_x = min(p[0] for p in box)

        y_diff = abs(line_center_y - label_center_y)
        if y_diff < 40:
            if line_left_x > label_right_x - 20:
                if value_pattern:
                    match = re.search(value_pattern, text_val)
                    if match:
                        candidates.append((abs(line_left_x - label_right_x), match.group(0)))
                else:
                    candidates.append((abs(line_left_x - label_right_x), text_val))

    if candidates:
        candidates.sort(key=lambda x: x[0])
        return candidates[0][1]

    for i, line in enumerate(results):
        if i == label_idx:
            continue
        box = line[0]
        text_val = line[1][0]
        line_center_y = (box[0][1] + box[2][1]) / 2
        if line_center_y > label_center_y and line_center_y - label_center_y < 50:
            if value_pattern:
                match = re.search(value_pattern, text_val)
                if match:
                    return match.group(0)
            else:
                return text_val

    return ''


def mode_shipping(image_path):
    """提取完整物流面单信息（增强版）。"""
    if not HAS_PIL:
        ocr = get_ocr()
        raw = ocr.predict(image_path)
        results = _normalize_predict(raw)
        all_text = ' '.join(line[1][0] for line in results)
        codes = extract_tracking_codes_smart(all_text)
        return _build_shipping_result(results, codes, all_text)

    img = Image.open(image_path).convert('RGB')
    w, h = img.size
    all_text_parts = []
    all_results = []

    ocr = get_ocr()

    # 多阈值全图 OCR
    for thresh in [70, 100]:
        try:
            processed = preprocess_for_ocr(img.copy(), target_min_width=2400, threshold=thresh)
            results = ocr_on_image(processed, ocr)
            all_results.extend(results)
            all_text_parts.append(' '.join(line[1][0] for line in results))
        except Exception:
            continue

    # 大图分块
    if w > 2800 or h > 4000:
        tiles = tile_image(img, tile_width=2800, overlap=0.25)
        for tile, (ox, oy) in tiles:
            try:
                processed_tile = preprocess_for_ocr(tile.copy(), target_min_width=2000, threshold=90)
                results = ocr_on_image(processed_tile, ocr)
                all_results.extend(results)
                all_text_parts.append(' '.join(line[1][0] for line in results))
            except Exception:
                continue

    combined_text = ' '.join(all_text_parts)
    codes = extract_tracking_codes_smart(combined_text)
    return _build_shipping_result(all_results, codes, combined_text)


def _build_shipping_result(ocr_lines, codes, all_text):
    """从 OCR 结果中构建 shipping 返回数据。"""
    weight_str = find_value_near_label(ocr_lines, ['总重量', '重量', '计费重量'], r'\d+\.?\d*')
    amount_str = find_value_near_label(ocr_lines, ['现付金额', '金额', '运费', '合计'], r'\d+\.?\d*')
    product_str = find_value_near_label(ocr_lines, ['销售产品', '产品', '品名'])
    country_str = find_value_near_label(ocr_lines, ['目的国家', '目的地', '国家', '目的国'])

    weight_kg = ''
    if weight_str:
        try:
            weight_kg = str(math.ceil(float(weight_str)))
        except ValueError:
            weight_kg = weight_str

    amount_yuan = ''
    if amount_str:
        try:
            amount_yuan = str(int(round(float(amount_str))))
        except ValueError:
            amount_yuan = amount_str

    items = []
    for code in codes:
        items.append({
            "code": code,
            "weight": weight_kg,
            "amount": amount_yuan,
            "product": product_str,
            "country": country_str
        })

    if not items and (weight_str or amount_str or product_str):
        items.append({
            "code": "",
            "weight": weight_kg,
            "amount": amount_yuan,
            "product": product_str,
            "country": country_str
        })

    return {"items": items, "raw_text": all_text}


def main():
    parser = argparse.ArgumentParser(description='物流面单 OCR 识别（增强版）')
    parser.add_argument('--mode', required=True, choices=['tracking', 'shipping'],
                        help='识别模式: tracking (仅单号) 或 shipping (完整物流信息)')
    parser.add_argument('image', help='图片文件路径')
    args = parser.parse_args()

    try:
        if args.mode == 'tracking':
            result = mode_tracking(args.image)
        else:
            result = mode_shipping(args.image)

        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        error_result = {"error": str(e), "codes": [], "items": [], "raw_text": ""}
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
