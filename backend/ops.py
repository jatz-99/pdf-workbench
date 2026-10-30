"""PDF editing operations. Each one reads a source PDF and writes a new PDF."""

from pathlib import Path

from pypdf import PdfReader, PdfWriter # pyright: ignore[reportMissingImports]


def _write(writer, dst: Path) -> None:
    with dst.open("wb") as handle:
        writer.write(handle)


def _check_pages(pages: list[int], total: int) -> None:
    if not pages:
        raise ValueError("No pages were given.")
    for number in pages:
        if number < 1 or number > total:
            raise ValueError(f"Page {number} does not exist in this document.")


def rotate(src: Path, dst: Path, pages: list[int], angle: int) -> int:
    if angle % 90 != 0:
        raise ValueError("Rotation must be a multiple of 90 degrees.")
    reader = PdfReader(src)
    _check_pages(pages, len(reader.pages))
    writer = PdfWriter()
    for index, page in enumerate(reader.pages, start=1):
        writer.add_page(page)
        if index in pages:
            writer.pages[-1].rotate(angle)
    _write(writer, dst)
    return len(writer.pages)


def keep(src: Path, dst: Path, pages: list[int]) -> int:
    """New PDF holding only the given pages (split / extract)."""
    reader = PdfReader(src)
    _check_pages(pages, len(reader.pages))
    writer = PdfWriter()
    for number in sorted(set(pages)):
        writer.add_page(reader.pages[number - 1])
    _write(writer, dst)
    return len(writer.pages)


def delete(src: Path, dst: Path, pages: list[int]) -> int:
    reader = PdfReader(src)
    _check_pages(pages, len(reader.pages))
    if len(set(pages)) >= len(reader.pages):
        raise ValueError("Cannot delete every page of the document.")
    writer = PdfWriter()
    for index, page in enumerate(reader.pages, start=1):
        if index not in pages:
            writer.add_page(page)
    _write(writer, dst)
    return len(writer.pages)


def merge(paths: list[Path], dst: Path) -> int:
    writer = PdfWriter()
    for path in paths:
        for page in PdfReader(path).pages:
            writer.add_page(page)
    _write(writer, dst)
    return len(writer.pages)


def reorder(src: Path, dst: Path, pages: list[int]) -> int:
    """New PDF with pages in the given order. `pages` must list every page exactly once."""
    reader = PdfReader(src)
    total = len(reader.pages)
    if sorted(pages) != list(range(1, total + 1)):
        raise ValueError("The new order must list every page exactly once.")
    writer = PdfWriter()
    for number in pages:
        writer.add_page(reader.pages[number - 1])
    _write(writer, dst)
    return len(writer.pages)
