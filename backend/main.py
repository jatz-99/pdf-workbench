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


def image_to_data_url(image: dict) -> str | None:
    """Convert an embedded PDF image stream into a browser-displayable data URL."""
    stream = image.get("stream")
    if stream is None:
        return None

    filters = {
        str(item[0] if isinstance(item, tuple) else item).lstrip("/")
        for item in (stream.get_filters() or [])
    }
    if "DCTDecode" in filters:
        image_bytes = stream.get_rawdata()
        media_type = "image/jpeg"
    elif "JPXDecode" in filters:
        image_bytes = stream.get_rawdata()
        media_type = "image/jp2"
    else:
        try:
            decoded = stream.get_data()
            width, height = image["srcsize"]
            color_space = image.get("colorspace")
            channels = 1 if color_space in (None, "DeviceGray", "/DeviceGray") else 3
            mode = "L" if channels == 1 else "RGB"
            decoded_image = Image.frombytes(mode, (width, height), decoded)
            output = io.BytesIO()
            decoded_image.save(output, format="PNG")
            image_bytes = output.getvalue()
            media_type = "image/png"
        except Exception:
            return None

    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


def extract_images(page, bbox: tuple[float, float, float, float]) -> list[str]:
    """Return every embedded image that intersects the requested area."""
    selection_x0, selection_top, selection_x1, selection_bottom = bbox
    image_data_urls = []

    for image in page.images:
        overlap_width = max(
            0,
            min(selection_x1, image["x1"]) - max(selection_x0, image["x0"]),
        )
        overlap_height = max(
            0,
            min(selection_bottom, image["bottom"]) - max(selection_top, image["top"]),
        )
        if overlap_width > 0 and overlap_height > 0:
            image_data = image_to_data_url(image)
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
                bbox = (
                    request.x_percent * page.width,
                    request.y_percent * page.height,
                    (request.x_percent + request.width_percent) * page.width,
                    (request.y_percent + request.height_percent) * page.height,
                )
            cropped_page = page.crop(bbox)

            if request.extraction_type == "smart":
                table_data = cropped_page.extract_tables()
                if table_data:
                    return {"detected_type": "table", "data": table_data}

                image_data = extract_images(page, bbox)
                if image_data:
                    return {"detected_type": "image", "data": image_data}

            if request.extraction_type == "tables":
                table_data = cropped_page.extract_tables()
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