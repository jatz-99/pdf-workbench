"""Optional OCR for scanned pages, using the Tesseract binary through pytesseract."""

import os
import shutil

OCR_LANG = os.environ.get("OCR_LANG", "eng")
OCR_DPI = 300
MIN_WORD_CONFIDENCE = 30


def available() -> bool:
    if shutil.which("tesseract") is None:
        return False
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        return False
    return True


def recognise(image) -> tuple[str, float, int]:
    """OCR a PIL image. Returns (text, mean word confidence 0-100, word count)."""
    import pytesseract

    data = pytesseract.image_to_data(image, lang=OCR_LANG, output_type=pytesseract.Output.DICT)
    lines: dict[tuple, list[str]] = {}
    confidences = []
    for i, word in enumerate(data["text"]):
        word = word.strip()
        confidence = float(data["conf"][i])
        if not word or confidence < MIN_WORD_CONFIDENCE:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)
        confidences.append(confidence)
    text = "\n".join(" ".join(words) for words in lines.values())
    mean = sum(confidences) / len(confidences) if confidences else 0.0
    return text, mean, len(confidences)


def recognise_words(image) -> list[dict]:
    """OCR a PIL image into words with pixel boxes: text, line key, left, top, width, height."""
    import pytesseract

    data = pytesseract.image_to_data(image, lang=OCR_LANG, output_type=pytesseract.Output.DICT)
    words = []
    for i, word in enumerate(data["text"]):
        word = word.strip()
        if not word or float(data["conf"][i]) < MIN_WORD_CONFIDENCE:
            continue
        words.append({
            "text": word,
            "line": (data["block_num"][i], data["par_num"][i], data["line_num"][i]),
            "left": data["left"][i], "top": data["top"][i],
            "width": data["width"][i], "height": data["height"][i],
        })
    return words


def recognise_cell(image) -> str:
    """OCR a small PIL image holding one block of text (a table cell), white-padded for Tesseract."""
    import pytesseract
    from PIL import Image

    padded = Image.new("L", (image.width + 20, image.height + 20), 255)
    padded.paste(image, (10, 10))
    return pytesseract.image_to_string(padded, lang=OCR_LANG, config="--psm 6").strip()
