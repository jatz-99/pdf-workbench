import base64
import io
import re
from pathlib import Path
import shutil
import uuid

from PIL import Image  # type: ignore[reportMissingImports]

UPLOAD_DIR = Path(__file__).resolve().parent / "temp_documents"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)



from fastapi import FastAPI, HTTPException,UploadFile,File  # type: ignore[reportMissingImports]
from fastapi.middleware.cors import CORSMiddleware  # type: ignore[reportMissingImports]
from pydantic import BaseModel, ConfigDict, Field  # type: ignore[reportMissingImports]
import pdfplumber  # type: ignore[reportMissingImports]

app = FastAPI(title="PDF Workbench API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Expected data from the React frontend
class ExtractionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extraction_scope: str = Field(pattern="^(document|region)$")
    extraction_type: str = Field(pattern="^(text|tables|images|smart)$")
    document_id: str = Field(min_length=1)
    page_number: int = Field(default=1, ge=1)
    x_percent: float | None = Field(default=None, ge=0, le=1)
    y_percent: float | None = Field(default=None, ge=0, le=1)
    width_percent: float | None = Field(default=None, gt=0, le=1)
    height_percent: float | None = Field(default=None, gt=0, le=1)


IMAGE_RENDER_DPI = 150
FRAME_FRACTION = 0.75  # vector shapes covering this much of the page are page frames


def bbox_overlap(a: tuple, b: tuple) -> bool:
    """True when two (x0, top, x1, bottom) boxes share some area."""
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def png_data_url(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def render_region_data_url(page, bbox: tuple) -> str | None:
    """Render part of the page to a PNG; works for any image or vector drawing."""
    try:
        x0, top, x1, bottom = bbox
        x0, top = max(x0, 0), max(top, 0)
        x1, bottom = min(x1, page.width), min(bottom, page.height)
        if x1 - x0 < 1 or bottom - top < 1:
            return None
        rendered = page.crop((x0, top, x1, bottom)).to_image(resolution=IMAGE_RENDER_DPI)
        return png_data_url(rendered.original.convert("RGB"))
    except Exception:
        return None


def image_to_data_url(page, image: dict) -> str | None:
    """Return an embedded image as a browser-displayable data URL."""
    stream = image.get("stream")
    if stream is not None:
        # pdfminer reports filter names as PSLiteral objects, not plain strings
        filters = set()
        for item in stream.get_filters() or []:
            name = item[0] if isinstance(item, tuple) else item
            filters.add(str(getattr(name, "name", name)).lstrip("/"))

        # Plain JPEGs can be served untouched, keeping original quality
        if "DCTDecode" in filters and len(filters) == 1:
            raw = stream.get_rawdata()
            try:
                with Image.open(io.BytesIO(raw)) as jpeg:
                    if jpeg.mode in ("RGB", "L"):
                        return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
            except Exception:
                pass  # CMYK or damaged JPEG: fall through to rendering

        # Raw 8-bit gray/RGB pixel data
        if not filters & {"DCTDecode", "JPXDecode", "JBIG2Decode", "CCITTFaxDecode"}:
            try:
                width, height = image["srcsize"]
                color_space = str(image.get("colorspace"))
                bits = image.get("bits", 8)
                data = stream.get_data()
                if bits == 8 and "Indexed" not in color_space:
                    if len(data) == width * height and "Gray" in color_space:
                        return png_data_url(Image.frombytes("L", (width, height), data))
                    if len(data) == width * height * 3 and "RGB" in color_space:
                        return png_data_url(Image.frombytes("RGB", (width, height), data))
            except Exception:
                pass

    # Anything else (CMYK, indexed, masks, JPX, ...): render how the page shows it
    return render_region_data_url(
        page, (image["x0"], image["top"], image["x1"], image["bottom"])
    )


def is_page_frame(obj: dict, page) -> bool:
    return (
        obj["object_type"] in ("rect", "line", "curve")
        and obj["width"] >= page.width * FRAME_FRACTION
        and obj["height"] >= page.height * FRAME_FRACTION
    )


def clean_table(rows: list) -> list:
    """Normalise cells to strings and drop completely empty rows and columns."""
    rows = [[(cell or "").strip() for cell in row] for row in rows]
    rows = [row for row in rows if any(row)]
    if not rows:
        return []
    keep = [i for i in range(max(map(len, rows))) if any(i < len(r) and r[i] for r in rows)]
    return [[row[i] if i < len(row) else "" for i in keep] for row in rows]


def is_real_table(rows: list) -> bool:
    """Reject false positives such as charts, boxes and layout borders."""
    if len(rows) < 2 or len(rows[0]) < 2:
        return False
    cells = [cell for row in rows for cell in row]
    return sum(1 for cell in cells if cell) / len(cells) >= 0.3


def detect_tables(page) -> list:
    """Ruled tables found on the whole page, with page frames ignored."""
    content = page.filter(lambda obj: not is_page_frame(obj, page))
    tables = []
    for table in content.find_tables():
        if is_real_table(clean_table(table.extract())):
            tables.append(table)
    return tables


def extract_tables(page, bbox: tuple, strict_borderless: bool = False) -> list:
    """Tables intersecting bbox. Partially selected tables keep only the selected cells."""
    results = []
    for table in detect_tables(page):
        if not bbox_overlap(table.bbox, bbox):
            continue
        grid = table.extract()
        masked = []
        for row, values in zip(table.rows, grid):
            masked_row = []
            for cell, value in zip(row.cells, values):
                if cell is None:
                    masked_row.append(None)
                    continue
                center_x, center_y = (cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2
                inside = bbox[0] <= center_x <= bbox[2] and bbox[1] <= center_y <= bbox[3]
                masked_row.append(value if inside else None)
            masked.append(masked_row)
        rows = clean_table(masked)
        if rows:
            results.append(rows)

    if not results and strict_borderless:
        # Borderless tables: align columns by text position, inside the chosen area only
        cropped = page.crop(bbox)
        words = cropped.extract_words()
        text_settings = {"vertical_strategy": "text", "horizontal_strategy": "text"}
        for table in cropped.find_tables(text_settings):
            # Real columns fall between words; prose gets cut through the middle of words
            boundaries = {c[0] for row in table.rows for c in row.cells if c} | {
                c[2] for row in table.rows for c in row.cells if c
            }
            if any(w["x0"] + 1 < x < w["x1"] - 1 for w in words for x in boundaries):
                continue
            rows = clean_table(table.extract())
            if is_real_table(rows) and sum(1 for r in rows for c in r if c) / sum(len(r) for r in rows) >= 0.6:
                results.append(rows)
    return results


def find_vector_figures(page) -> list:
    """Bounding boxes of charts/diagrams drawn with vector shapes (not table borders)."""
    shapes = [
        obj for obj in page.rects + page.curves + page.lines
        if not is_page_frame(obj, page)
    ]
    boxes = [[o["x0"], o["top"], o["x1"], o["bottom"], 1] for o in shapes]

    # Merge shapes that touch or nearly touch into clusters
    gap = 6
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if (min(a[2], b[2]) + gap > max(a[0], b[0])
                        and min(a[3], b[3]) + gap > max(a[1], b[1])):
                    boxes[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]),
                                max(a[3], b[3]), a[4] + b[4]]
                    del boxes[j]
                    merged = True
                    break
            if merged:
                break

    table_boxes = [t.bbox for t in detect_tables(page)]
    figures = []
    for x0, top, x1, bottom, count in boxes:
        if count < 5 or (x1 - x0) < 40 or (bottom - top) < 40:
            continue
        # Include nearby axis labels and legends in the picture
        pad = 30
        figure = (max(x0 - pad, 0), max(top - pad, 0),
                  min(x1 + pad, page.width), min(bottom + pad, page.height))
        if any(bbox_overlap(figure, t) for t in table_boxes):
            continue
        figures.append(figure)
    return figures


def extract_images(page, bbox: tuple[float, float, float, float]) -> list[str]:
    """Every embedded image and vector figure that intersects the requested area."""
    image_data_urls = []

    for image in page.images:
        image_box = (image["x0"], image["top"], image["x1"], image["bottom"])
        if bbox_overlap(bbox, image_box):
            image_data = image_to_data_url(page, image)
            if image_data:
                image_data_urls.append(image_data)

    for figure in find_vector_figures(page):
        if bbox_overlap(bbox, figure):
            image_data = render_region_data_url(page, figure)
            if image_data:
                image_data_urls.append(image_data)

    return image_data_urls


@app.get("/")
def home():
    return {"message": "PDF Workbench Backend is running!"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/upload")
def upload_pdf(file: UploadFile = File(...)):
    # 1. Check that a file was provided
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file was provided."
        )

    # 2. Check that the uploaded file is a PDF
    if Path(file.filename).suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed."
        )

    # Check the file content really is a PDF, not just named like one
    header = file.file.read(1024)
    file.file.seek(0)
    if b"%PDF-" not in header:
        file.file.close()
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid PDF."
        )

    # 3. Generate a unique ID
    document_id = str(uuid.uuid4())

    # 4. Create a safe server-side filename
    file_path = UPLOAD_DIR / f"{document_id}.pdf"

    # 5. Save the uploaded file
    try:
        with file_path.open("wb") as destination:
            shutil.copyfileobj(file.file, destination)
    except Exception:
        # Remove a partially written file if saving fails
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to save the uploaded PDF."
        )
    finally:
        file.file.close()

    # 6. Return the document ID to React
    return {
        "document_id": document_id
    }


@app.post("/extract")
def extract(request: ExtractionRequest):
    try:
        document_uuid = uuid.UUID(request.document_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Invalid document ID.") from error

    file_path = UPLOAD_DIR / f"{document_uuid}.pdf"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Uploaded document not found.")

    try:
        with pdfplumber.open(file_path) as pdf:
            if request.page_number > len(pdf.pages):
                raise HTTPException(
                    status_code=422,
                    detail=f"Page {request.page_number} does not exist in this document.",
                )

            page = pdf.pages[request.page_number - 1]
            bbox = (0, 0, page.width, page.height)
            if request.extraction_scope == "region":
                if any(
                    value is None
                    for value in (
                        request.x_percent,
                        request.y_percent,
                        request.width_percent,
                        request.height_percent,
                    )
                ):
                    raise HTTPException(
                        status_code=422,
                        detail="Region extraction requires page and rectangle coordinates.",
                    )
                assert request.x_percent is not None
                assert request.y_percent is not None
                assert request.width_percent is not None
                assert request.height_percent is not None
                # Clamp to the page so selections dragged past the edge don't fail
                bbox = (
                    request.x_percent * page.width,
                    request.y_percent * page.height,
                    min(request.x_percent + request.width_percent, 1) * page.width,
                    min(request.y_percent + request.height_percent, 1) * page.height,
                )
            cropped_page = page.crop(bbox)

            if request.extraction_type == "smart":
                table_data = extract_tables(page, bbox)
                if table_data:
                    return {"detected_type": "table", "data": table_data}

                image_data = extract_images(page, bbox)
                if image_data:
                    return {"detected_type": "image", "data": image_data}

            if request.extraction_type == "tables":
                table_data = extract_tables(
                    page, bbox, strict_borderless=request.extraction_scope == "region"
                )
                return {"detected_type": "table", "data": table_data}

            if request.extraction_type == "images":
                image_data = extract_images(page, bbox)
                return {"detected_type": "image", "data": image_data}

            extracted_text = cropped_page.extract_text() or ""
            cleaned_text = re.sub(r"[ \t]+\n", "\n", extracted_text)
            cleaned_text = re.sub(r"\n{3,}", "\n\n", cleaned_text).strip()
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract content from the PDF: {error}",
        ) from error

    return {"detected_type": "text", "data": cleaned_text}