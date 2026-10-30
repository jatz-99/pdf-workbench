import io
import os
import time

from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation

import main
import ocr
import pytest
import storage
from conftest import make_pdf


def extract(client, document_id, **overrides):
    body = {
        "extraction_scope": "document",
        "extraction_type": "text",
        "document_id": document_id,
        "page_number": 1,
        **overrides,
    }
    return client.post("/extract", json=body)


def test_upload_returns_id_and_page_count(upload):
    data = upload(make_pdf(["one", "two", "three"]))
    assert data["pages"] == 3
    assert (storage.UPLOAD_DIR / f"{data['document_id']}.pdf").is_file()


def test_upload_rejects_non_pdf(client):
    response = client.post("/upload", files={"file": ("a.pdf", b"hello", "application/pdf")})
    assert response.status_code == 400
    response = client.post("/upload", files={"file": ("a.txt", make_pdf(["x"]), "text/plain")})
    assert response.status_code == 400


def test_upload_size_limit(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 100)
    response = client.post("/upload", files={"file": ("big.pdf", make_pdf(["x"]), "application/pdf")})
    assert response.status_code == 413
    assert list(storage.UPLOAD_DIR.glob("*.pdf")) == []


def test_extract_text_single_page(client, upload):
    doc = upload(make_pdf(["hello world", "second page"]))
    response = extract(client, doc["document_id"], page_number=2)
    assert response.json() == {"detected_type": "text", "data": "second page"}


def test_extract_text_page_range_and_all(client, upload):
    doc = upload(make_pdf(["alpha", "beta", "gamma"]))
    data = extract(client, doc["document_id"], page_start=2, page_end=3).json()
    assert "--- Page 2 ---\nbeta" in data["data"] and "--- Page 3 ---\ngamma" in data["data"]
    assert "alpha" not in data["data"]
    assert "gamma" in extract(client, doc["document_id"], page_start=1).json()["data"]


def test_extract_range_validation(client, upload):
    doc = upload(make_pdf(["a", "b"]))
    assert extract(client, doc["document_id"], page_start=2, page_end=1).status_code == 422
    assert extract(client, doc["document_id"], page_start=1, page_end=5).status_code == 422
    assert extract(client, doc["document_id"], page_number=9).status_code == 422


def test_extract_region_text(client, upload):
    doc = upload(make_pdf(["hello world"]))
    # the text sits near the top-left; the lower half of the page is empty
    empty = extract(client, doc["document_id"], extraction_scope="region",
                    x_percent=0, y_percent=0.5, width_percent=1, height_percent=0.5).json()
    assert empty["data"] == ""
    full = extract(client, doc["document_id"], extraction_scope="region",
                   x_percent=0, y_percent=0, width_percent=1, height_percent=0.5).json()
    assert full["data"] == "hello world"


def test_region_requires_coordinates(client, upload):
    doc = upload(make_pdf(["x"]))
    assert extract(client, doc["document_id"], extraction_scope="region").status_code == 422


def test_unknown_and_invalid_document(client):
    assert extract(client, "00000000-0000-4000-8000-000000000000").status_code == 404
    assert extract(client, "not-a-uuid").status_code == 422


def test_tables_and_images_include_pages(client, upload):
    doc = upload(make_pdf(["a", "b"]))
    data = extract(client, doc["document_id"], extraction_type="tables", page_start=1, page_end=2).json()
    assert data["detected_type"] == "table" and data["data"] == [] and data["pages"] == []


def test_delete_document(client, upload):
    doc = upload(make_pdf(["x"]))
    assert client.get(f"/document/{doc['document_id']}/file").status_code == 200
    assert client.delete(f"/document/{doc['document_id']}").json() == {"deleted": True}
    assert client.get(f"/document/{doc['document_id']}/file").status_code == 404


def test_cleanup_removes_only_old_documents(upload):
    old = upload(make_pdf(["old"]))["document_id"]
    new = upload(make_pdf(["new"]))["document_id"]
    past = time.time() - 3 * 3600
    os.utime(storage.UPLOAD_DIR / f"{old}.pdf", (past, past))
    assert storage.cleanup_old_documents(3600) == 1
    assert not (storage.UPLOAD_DIR / f"{old}.pdf").exists()
    assert (storage.UPLOAD_DIR / f"{new}.pdf").exists()


def test_ops_rotate_delete_keep(client, upload):
    doc = upload(make_pdf(["a", "b", "c"]))["document_id"]

    deleted = client.post(f"/document/{doc}/ops", json={"op": "delete", "pages": [2]}).json()
    assert deleted["pages"] == 2
    assert "c" in extract(client, deleted["document_id"], page_number=2).json()["data"]

    kept = client.post(f"/document/{doc}/ops", json={"op": "keep", "pages": [3, 1]}).json()
    assert kept["pages"] == 2
    assert extract(client, kept["document_id"], page_number=1).json()["data"] == "a"

    rotated = client.post(f"/document/{doc}/ops", json={"op": "rotate", "pages": [1], "angle": 90}).json()
    assert rotated["pages"] == 3

    assert client.post(f"/document/{doc}/ops", json={"op": "delete", "pages": [1, 2, 3]}).status_code == 422
    assert client.post(f"/document/{doc}/ops", json={"op": "delete", "pages": [9]}).status_code == 422
    assert client.post(f"/document/{doc}/ops", json={"op": "rotate", "pages": [1], "angle": 45}).status_code == 422


def test_merge(client, upload):
    doc = upload(make_pdf(["a", "b"]))["document_id"]
    response = client.post(
        f"/document/{doc}/merge", files={"file": ("x.pdf", make_pdf(["c"]), "application/pdf")}
    )
    assert response.status_code == 200 and response.json()["pages"] == 3
    assert len(list(storage.UPLOAD_DIR.glob("*.pdf"))) == 2  # temp upload removed


def test_export_xlsx_does_not_create_formulas(client):
    from io import BytesIO
    from openpyxl import load_workbook

    response = client.post("/export/xlsx", json={"tables": [[["=1+1", "ok"], ["a", None]]]})
    assert response.status_code == 200
    sheet = load_workbook(BytesIO(response.content))["Table 1"]
    assert sheet["A1"].data_type == "s" and sheet["A1"].value == "=1+1"
    assert client.post("/export/xlsx", json={"tables": []}).status_code == 422


def test_cluster_boxes_merges_touching_only():
    boxes = [[0, 0, 10, 10, 1], [12, 0, 20, 10, 1], [200, 200, 210, 210, 1]]
    merged = sorted(main.cluster_boxes(boxes, gap=6))
    assert len(merged) == 2 and merged[0][:4] == [0, 0, 20, 10] and merged[0][4] == 2



def make_text_and_image_pdf() -> bytes:
    """'hello' at the top left with a small picture right below it (612x792 page)."""
    picture = io.BytesIO()
    Image.new("RGB", (60, 60), "red").save(picture, format="PDF", resolution=72)
    base = PdfReader(io.BytesIO(make_pdf(["hello"]))).pages[0]
    base.merge_transformed_page(
        PdfReader(picture).pages[0], Transformation().translate(72, 600)
    )
    writer = PdfWriter()
    writer.add_page(base)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def test_smart_region_text_near_image_stays_text(client, upload):
    doc = upload(make_text_and_image_pdf())["document_id"]
    # Mostly text, clipping the top of the picture (picture spans y 132-192pt from the top)
    around_text = dict(extraction_scope="region", extraction_type="smart",
                       x_percent=0.05, y_percent=0.06, width_percent=0.5, height_percent=0.2)
    data = extract(client, doc, **around_text).json()
    assert data["detected_type"] == "text" and "hello" in data["data"]

    # Selection filled by the picture still returns the image
    on_picture = dict(around_text, x_percent=0.1, y_percent=0.17, width_percent=0.08, height_percent=0.07)
    assert extract(client, doc, **on_picture).json()["detected_type"] == "image"


def test_ops_reorder(client, upload):
    doc = upload(make_pdf(["a", "b", "c"]))["document_id"]
    response = client.post(f"/document/{doc}/ops", json={"op": "reorder", "pages": [3, 1, 2]})
    assert response.status_code == 200 and response.json()["pages"] == 3
    new_id = response.json()["document_id"]
    texts = [extract(client, new_id, page_number=n).json()["data"] for n in (1, 2, 3)]
    assert texts == ["c", "a", "b"]
    for bad in ([1, 2], [1, 1, 2], [1, 2, 4], []):
        assert client.post(f"/document/{doc}/ops", json={"op": "reorder", "pages": bad}).status_code == 422


def test_edit_errors_do_not_leak_details(client, upload, monkeypatch):
    doc = upload(make_pdf(["a"]))["document_id"]

    def boom(*args, **kwargs):
        raise RuntimeError("secret /internal/path")

    monkeypatch.setattr(main.ops, "rotate", boom)
    response = client.post(f"/document/{doc}/ops", json={"op": "rotate", "pages": [1]})
    assert response.status_code == 500 and "secret" not in response.text

    monkeypatch.setattr(main, "extract_single_page", boom)
    response = extract(client, doc)
    assert response.status_code == 500 and "secret" not in response.text


def test_extract_timeout(client, upload, monkeypatch):
    doc = upload(make_pdf(["a", "b"]))["document_id"]
    monkeypatch.setattr(main, "EXTRACT_TIMEOUT_SECONDS", -1)
    assert extract(client, doc, page_start=1, page_end=2).status_code == 504


def make_scanned_pdf(text: str = "Invoice total 1250 dollars") -> bytes:
    """A page that is one picture of text, with no real text characters."""
    from PIL import ImageDraw, ImageFont

    page = Image.new("RGB", (1240, 1754), "white")
    ImageDraw.Draw(page).text((100, 150), text, fill="black", font=ImageFont.load_default(size=56))
    out = io.BytesIO()
    page.save(out, format="PDF", resolution=150)
    return out.getvalue()


needs_ocr = pytest.mark.skipif(not ocr.available(), reason="Tesseract is not installed")


@needs_ocr
def test_text_on_scanned_page_uses_ocr(client, upload):
    doc = upload(make_scanned_pdf())["document_id"]
    data = extract(client, doc).json()
    assert data["detected_type"] == "text" and data.get("ocr") is True
    assert "Invoice" in data["data"] and "1250" in data["data"]

    region = extract(client, doc, extraction_scope="region",
                     x_percent=0, y_percent=0, width_percent=1, height_percent=0.2).json()
    assert "Invoice" in region["data"]


@needs_ocr
def test_smart_mode_reads_scanned_text_but_keeps_photos_as_images(client, upload):
    doc = upload(make_scanned_pdf())["document_id"]
    assert extract(client, doc, extraction_type="smart").json()["detected_type"] == "text"

    photo = io.BytesIO()
    Image.effect_noise((600, 600), 80).convert("RGB").save(photo, format="PDF", resolution=72)
    photo_doc = upload(photo.getvalue())["document_id"]
    assert extract(client, photo_doc, extraction_type="smart").json()["detected_type"] == "image"


def test_scanned_page_without_ocr_is_flagged(client, upload, monkeypatch):
    doc = upload(make_scanned_pdf())["document_id"]
    monkeypatch.setattr(ocr, "available", lambda: False)
    data = extract(client, doc).json()
    assert data["data"] == "" and data["scanned"] is True and data["ocr_available"] is False
    assert "ocr" not in data


def test_ocr_can_be_switched_off(client, upload, monkeypatch):
    doc = upload(make_scanned_pdf())["document_id"]
    monkeypatch.setattr(ocr, "available", lambda: True)
    data = extract(client, doc, use_ocr=False).json()
    assert data["data"] == "" and data["scanned"] is True and "ocr" not in data


def test_real_text_never_triggers_ocr(client, upload):
    doc = upload(make_pdf(["hello"]))["document_id"]
    data = extract(client, doc).json()
    assert data == {"detected_type": "text", "data": "hello"}


def encrypted_pdf(user_password: str, owner_password: str | None = None) -> bytes:
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(make_pdf(["secret one", "secret two"]))))
    writer.encrypt(user_password, owner_password, algorithm="AES-256")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def post_upload(client, content, password=None):
    data = {"password": password} if password is not None else None
    return client.post("/upload", files={"file": ("locked.pdf", content, "application/pdf")}, data=data)


def test_upload_encrypted_requires_password(client):
    response = post_upload(client, encrypted_pdf("hunter2"))
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "password_required"
    assert list(storage.UPLOAD_DIR.glob("*")) == []


def test_upload_encrypted_wrong_password(client):
    response = post_upload(client, encrypted_pdf("hunter2"), password="nope")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "incorrect_password"
    assert list(storage.UPLOAD_DIR.glob("*")) == []


def test_upload_encrypted_correct_password_stores_unlocked_copy(client):
    response = post_upload(client, encrypted_pdf("hunter2"), password="hunter2")
    assert response.status_code == 200
    data = response.json()
    assert data["pages"] == 2
    stored = storage.UPLOAD_DIR / f"{data['document_id']}.pdf"
    assert not PdfReader(stored).is_encrypted
    assert extract(client, data["document_id"], page_number=2).json()["data"] == "secret two"
    assert [p.name for p in storage.UPLOAD_DIR.glob("*")] == [stored.name]


def test_upload_owner_only_protection_needs_no_password(client):
    response = post_upload(client, encrypted_pdf("", owner_password="owner"))
    assert response.status_code == 200
    assert response.json()["pages"] == 2
