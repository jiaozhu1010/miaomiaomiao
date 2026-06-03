#!/usr/bin/env python3
"""
服务端条码解码器 — 给喵码生成器用
使用 opencv 预处理 + pyzbar 解码 CODE128 条码，提取 DPK/DPL 单号
用法:
  python barcode_decoder.py <image_path>
输出 JSON: {"codes": ["DPK123456789012", ...]}
"""

import json
import re
import sys

try:
    import cv2
    import numpy as np
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    from pyzbar.pyzbar import decode as pyzbar_decode
    HAS_PYZBAR = True
except ImportError:
    HAS_PYZBAR = False


# ── 单号提取 ──

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

FUZZY_PREFIX_MAP = {
    '0PK': 'DPK', 'OPK': 'DPK', 'DPK': 'DPK',
    'DPI': 'DPL', 'DP1': 'DPL', 'DPL': 'DPL',
    '0PL': 'DPL', 'OPL': 'DPL',
}


def clean_barcode_text(text):
    """清洗条码原始输出：去除非字母数字字符，尝试修正 OCR 误读"""
    return re.sub(r'[^A-Za-z0-9]', '', str(text))


def extract_tracking_codes(text):
    """从文本中提取 DPK/DPL 单号（与前端逻辑一致）"""
    compact = re.sub(r'[^A-Za-z0-9|]', '', str(text)).upper()
    found = []
    seen = set()

    for i in range(len(compact) - 2):
        chunk = compact[i:i + 3]
        prefix = FUZZY_PREFIX_MAP.get(chunk, '')
        if not prefix:
            continue

        tail = compact[i + 3:i + 33]
        digits = ''
        for offset, ch in enumerate(tail):
            if offset > 0:
                next_prefix = FUZZY_PREFIX_MAP.get(compact[i + 3 + offset:i + 6 + offset], '')
                if next_prefix:
                    break
            if ch.isdigit():
                digits += ch
            elif ch in OCR_DIGIT_MAP:
                digits += OCR_DIGIT_MAP[ch]
            if len(digits) == 12:
                code = f"{prefix}{digits}"
                if code not in seen:
                    seen.add(code)
                    found.append(code)
                break

    return found


# ── 图像预处理 ──

def preprocess_variants(gray):
    """生成多种预处理变体，提升条码解码命中率"""
    variants = []

    # 变体1：原始灰度
    variants.append(("原始灰度", gray))

    # 变体2-4：不同阈值二值化
    for thresh in [80, 110, 140]:
        _, binary = cv2.threshold(gray, thresh, 255, cv2.THRESH_BINARY)
        variants.append((f"二值化(t={thresh})", binary))

    # 变体5：自适应二值化
    adaptive = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 5
    )
    variants.append(("自适应二值化", adaptive))

    # 变体6：Otsu 二值化
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(("Otsu", otsu))

    # 变体7：锐化 + Otsu
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    sharpened = cv2.addWeighted(gray, 1.8, blurred, -0.8, 0)
    _, sharp_otsu = cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(("锐化+Otsu", sharp_otsu))

    # 变体8：膨胀（连接断裂的条码线段）
    kernel = np.ones((3, 1), np.uint8)
    dilated = cv2.dilate(otsu, kernel, iterations=1)
    variants.append(("Otsu+膨胀", dilated))

    return variants


def rotate_image(img, angle):
    """旋转图片（保持内容完整）"""
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos = abs(matrix[0, 0])
    sin = abs(matrix[0, 1])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)
    matrix[0, 2] += new_w / 2 - center[0]
    matrix[1, 2] += new_h / 2 - center[1]
    return cv2.warpAffine(img, matrix, (new_w, new_h), borderValue=255)


def decode_with_pyzbar(image_path):
    """主解码函数：多预处理 + 多角度尝试"""
    if not HAS_CV2 or not HAS_PYZBAR:
        return {"codes": [], "raw_texts": [], "error": "缺少 opencv 或 pyzbar 依赖"}

    # 读取图片
    img = cv2.imread(image_path)
    if img is None:
        return {"codes": [], "raw_texts": [], "error": f"无法读取图片: {image_path}"}

    h, w = img.shape[:2]
    all_raw = []
    all_codes = []
    seen_raw = set()

    def try_decode(cv_img, label=""):
        """对一张 opencv 图片尝试 pyzbar 解码，返回是否找到任何条码数据"""
        results = pyzbar_decode(cv_img)
        for r in results:
            raw = r.data.decode('utf-8', errors='ignore').strip()
            rtype = r.type or 'UNKNOWN'
            if raw and raw not in seen_raw:
                seen_raw.add(raw)
                entry = clean_barcode_text(raw)
                all_raw.append(entry)
                codes = extract_tracking_codes(raw)
                for c in codes:
                    if c not in all_codes:
                        all_codes.append(c)
                if codes:
                    print(f"  ✓ [{label}] {rtype}: {raw} → {codes}", file=sys.stderr)
                else:
                    print(f"  ○ [{label}] {rtype}: {raw} (无DPK/DPL)", file=sys.stderr)
        return len(results) > 0

    # ── 极速预检：0° + 90° 检测图中是否有条码（覆盖横竖两个方向）──
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    has_any_barcode = bool(pyzbar_decode(gray)) or bool(pyzbar_decode(otsu))

    if not has_any_barcode:
        # 0° 没找到 → 试试 90° 旋转（条码可能是竖的）
        gray90 = cv2.cvtColor(rotate_image(img, 90), cv2.COLOR_BGR2GRAY)
        _, otsu90 = cv2.threshold(gray90, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        has_any_barcode = bool(pyzbar_decode(gray90)) or bool(pyzbar_decode(otsu90))

    if not has_any_barcode:
        print("  ⚡ 0°+90° 均未检测到条形码，跳过解码", file=sys.stderr)
        return {"codes": [], "raw_texts": []}

    # ── 有条码！完整流水线：所有角度 + 所有变体提取 DPK/DPL 单号 ──
    print("  🔍 检测到条形码，开始多角度深度解码...", file=sys.stderr)

    # 对每个角度，跑全部预处理变体
    for angle in [0, 90, 180, 270]:
        if angle == 0:
            rotated = img
        else:
            rotated = rotate_image(img, angle)
        gray_rot = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY)

        for vname, variant in preprocess_variants(gray_rot):
            try_decode(variant, f"{angle}° {vname}")
        try_decode(gray_rot, f"{angle}° 灰度直解")

        if all_codes:
            break  # 找到单号了就停

    return {
        "codes": all_codes,
        "raw_texts": list(set(all_raw))
    }


def main():
    if len(sys.argv) < 2:
        result = {"codes": [], "raw_texts": [], "error": "用法: python barcode_decoder.py <image_path>"}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    image_path = sys.argv[1]

    if not HAS_CV2:
        result = {"codes": [], "raw_texts": [], "error": "opencv-python-headless 未安装"}
    elif not HAS_PYZBAR:
        result = {"codes": [], "raw_texts": [], "error": "pyzbar 未安装；请先安装 libzbar + pyzbar"}
    else:
        result = decode_with_pyzbar(image_path)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
