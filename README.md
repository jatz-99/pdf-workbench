# PDF Workbench

Upload a PDF, preview it, and pull out text, tables and images: from a whole page, a page range, or a region you draw. React + Vite frontend, FastAPI backend.

## Features

- **Viewer**: zoom (buttons, `+`/`-`/`0`, Ctrl+wheel), thumbnail sidebar, page navigation (`←`/`→`), drag-and-drop upload, restores the last document after a reload
- **Extraction**: text, tables (ruled and borderless), images and vector figures, "smart" detection for a drawn region
- **Scope**: current page, all pages, a page range, or a selected region (`Esc` clears it)
- **Results**: copy to clipboard, download as TXT / CSV / XLSX / JSON / PNG, extraction history for the session
- **PDF tools**: rotate, delete page, split (keep a range), merge, reorder pages by dragging thumbnails, undo
- **Scanned pages**: optional OCR (Tesseract) for pages with no text layer
- **Protected PDFs**: if a PDF needs a password, you're prompted for it and the server keeps an unlocked copy to work on. The password is used in memory only and is never stored or logged. Files that only restrict printing or editing open without a prompt.

## Run locally

```bash
# backend (Python 3.13+; OCR also needs the tesseract binary installed, e.g. apt install tesseract-ocr)
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to port 8000
```

Or with Docker: `docker compose up --build`, then open http://localhost:8080.

### Configuration (backend environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAX_UPLOAD_MB` | `50` | Maximum upload size |
| `DOCUMENT_TTL_MINUTES` | `120` | Uploaded files not used for this long are deleted (checked every 10 min) |
| `PDF_WORKBENCH_UPLOAD_DIR` | `backend/temp_documents` | Where PDFs are stored |
| `OCR_LANG` | `eng` | Tesseract language(s) used for OCR |
| `EXTRACT_TIMEOUT_SECONDS` | `60` | Maximum time for a single extraction request |

## Tests

```bash
npm test                                   # frontend (vitest)
cd backend && pip install -r requirements-dev.txt && python -m pytest
npm run lint
```

CI (`.github/workflows/ci.yml`) runs lint, tests and the build.

## Layout

```
src/                 React app (App.jsx wires components/ together; api.js talks to the backend)
backend/main.py      FastAPI app and extraction logic
backend/ops.py       PDF editing (rotate, delete, split, merge, reorder)
backend/ocr.py       optional OCR for scanned pages
backend/storage.py   uploaded-file storage and cleanup
```
