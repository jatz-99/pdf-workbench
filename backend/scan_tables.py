"""Tables in scanned pages: find the ruled grid in the rendered image, then OCR the cells."""

import cv2
import numpy as np
from PIL import Image

import ocr

DPI = 200
MIN_CELL = 12  # px; smaller enclosed areas are specks, not cells
MAX_CELLS = 600
MAX_CELL_RETRIES = 100  # cells re-read one by one after the page-wide pass left them empty
MIN_INK_PIXELS = 40  # dark pixels needed for a cell to count as non-blank
LINE_GAP = 6  # px; cells whose edges are this close share a ruling line, so they share a table


def find_cells(gray: np.ndarray) -> tuple[list[tuple], np.ndarray]:
    """Enclosed rectangles bounded by long horizontal/vertical lines, plus the line mask."""
    height, width = gray.shape
    ink = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 10)
    horizontal = cv2.morphologyEx(
        ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(width // 25, 20), 1)))
    vertical = cv2.morphologyEx(
        ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(height // 25, 20))))
    grid = cv2.dilate(cv2.bitwise_or(horizontal, vertical), np.ones((3, 3), np.uint8))

    count, _, stats, _ = cv2.connectedComponentsWithStats(cv2.bitwise_not(grid), connectivity=4)
    cells = []
    for i in range(1, count):
        x, y, w, h, area = (int(v) for v in stats[i])
        if x == 0 or y == 0 or x + w >= width or y + h >= height:
            continue  # open to the page margin: the space around the table, not a cell
        if w < MIN_CELL or h < MIN_CELL or area < 0.7 * w * h:
            continue
        cells.append((x, y, x + w, y + h))
    return cells, grid


def drop_containers(cells: list[tuple]) -> list[tuple]:
    """Remove areas that merely surround other cells (e.g. the gap inside a page frame)."""
    def inside(a, b):
        return b[0] <= a[0] and b[1] <= a[1] and a[2] <= b[2] and a[3] <= b[3]

    return [c for c in cells if sum(1 for o in cells if o is not c and inside(o, c)) < 2]


def group_tables(cells: list[tuple]) -> list[list[tuple]]:
    """Group cells that touch (or nearly touch) into separate tables."""
    parent = list(range(len(cells)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, a in enumerate(cells):
        for j in range(i + 1, len(cells)):
            b = cells[j]
            if (a[0] - LINE_GAP <= b[2] and b[0] - LINE_GAP <= a[2]
                    and a[1] - LINE_GAP <= b[3] and b[1] - LINE_GAP <= a[3]):
                parent[find(j)] = find(i)
    groups: dict[int, list] = {}
    for i, cell in enumerate(cells):
        groups.setdefault(find(i), []).append(cell)
    return list(groups.values())


def layout(cells: list[tuple]) -> tuple[list[list[tuple]], int]:
    """Arrange a table's cells into rows of (column, cell), left to right."""
    rows: list[list[tuple]] = []
    for cell in sorted(cells, key=lambda c: (c[1], c[0])):
        centre = (cell[1] + cell[3]) / 2
        for row in rows:
            if row[0][1] < centre < row[0][3]:
                row.append(cell)
                break
        else:
            rows.append([cell])

    starts: list[int] = []
    for left in sorted(c[0] for c in cells):
        if not starts or left - starts[-1] > 8:
            starts.append(left)
    return [
        [(min(range(len(starts)), key=lambda k: abs(starts[k] - c[0])), c) for c in sorted(row)]
        for row in rows
    ], len(starts)


def cell_text(words: list[dict], cell: tuple) -> str:
    inside = [
        w for w in words
        if cell[0] <= w["left"] + w["width"] / 2 <= cell[2] and cell[1] <= w["top"] + w["height"] / 2 <= cell[3]
    ]
    lines: dict[tuple, list] = {}
    for word in inside:
        lines.setdefault(word["line"], []).append(word)
    ordered = sorted(lines.values(), key=lambda ws: min(w["top"] for w in ws))
    return "\n".join(" ".join(w["text"] for w in sorted(ws, key=lambda w: w["left"])) for ws in ordered)


def read_tables(image) -> list[list[list[str]]]:
    """Tables (rows of cell strings) found in a PIL image of a scanned page or selection."""
    gray = np.array(image.convert("L"))
    cells, grid = find_cells(gray)
    if not 4 <= len(cells) <= MAX_CELLS:
        return []
    tables = [t for t in group_tables(drop_containers(cells)) if len(t) >= 4]
    if not tables:
        return []

    clean = gray.copy()
    clean[grid > 0] = 255  # ruling lines confuse OCR, so read the text without them
    words = ocr.recognise_words(clean)

    retries = MAX_CELL_RETRIES

    def read(cell: tuple) -> str:
        nonlocal retries
        text = cell_text(words, cell)
        if text or retries <= 0:
            return text
        crop = clean[cell[1]:cell[3], cell[0]:cell[2]]
        if (crop < 128).sum() < MIN_INK_PIXELS:
            return ""  # blank cell
        retries -= 1
        return ocr.recognise_cell(Image.fromarray(crop))

    result = []
    for table in sorted(tables, key=lambda t: min(c[1] for c in t)):
        rows, columns = layout(table)
        result.append([
            [next((read(c) for k, c in row if k == col), "") for col in range(columns)]
            for row in rows
        ])
    return result
