import { useCallback, useEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { checkHealth, deleteDocument, editDocument, extract, fetchDocumentFile, uploadPdf } from "./api";
import { HeroIllustration, LogoMark, Upload } from "./components/Icons";
import { primaryButton } from "./components/ui";
import PasswordDialog from "./components/PasswordDialog";
import DocumentInfo from "./components/DocumentInfo";
import ExtractionPanel from "./components/ExtractionPanel";
import ThemeToggle from "./components/ThemeToggle";
import ResultPanel, { HistoryPanel } from "./components/ResultPanel";
import ToolsPanel from "./components/ToolsPanel";
import Viewer, { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "./components/Viewer";
import { movePage } from "./utils/pages";
import { clamp, isUsableRect, selectionRect } from "./utils/selection";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const STORAGE_KEY = "pdf-workbench:document";
const MAX_HISTORY = 10;
const MAX_UNDO = 10;

function readSavedDocument() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function App() {
  // Document state: { file, id, pages }
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set while a protected PDF waits for its password: { file, error, submitting }
  const [passwordPrompt, setPasswordPrompt] = useState(null);
  // Earlier versions of the document, newest last: { id, name, pages, page }
  const [undoStack, setUndoStack] = useState([]);

  // Selection state (fractions of the page)
  const [selection, setSelection] = useState(null);

  // Extraction state
  const [extractionScope, setExtractionScope] = useState("document");
  const [range, setRange] = useState({ mode: "page", from: "1", to: "1" });
  const [extractionMessage, setExtractionMessage] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeHistoryId, setActiveHistoryId] = useState(null);

  const extractionController = useRef(null);
  const uploadToken = useRef(0);
  const uploadInput = useRef(null);
  const [backendUp, setBackendUp] = useState(null);

  // Check the backend on load, when the tab regains focus, and again soon while it looks offline
  useEffect(() => {
    let cancelled = false;
    let timer;
    const poll = async () => {
      clearTimeout(timer);
      const up = await checkHealth();
      if (cancelled) return;
      setBackendUp(up);
      timer = setTimeout(poll, up ? 30000 : 5000);
    };
    poll();
    window.addEventListener("focus", poll);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", poll);
    };
  }, []);

  const pdfFile = doc?.file ?? null;
  const documentId = doc?.id ?? null;

  const rect = selectionRect(selection);
  const hasSelection = isUsableRect(rect) && selection.page === pageNumber;
  const isExtractDisabled =
    !pdfFile || !documentId || (extractionScope === "region" && !hasSelection);

  // Abort the in-flight request so a late response can't land on a different page
  const cancelExtraction = useCallback(() => {
    extractionController.current?.abort();
    extractionController.current = null;
    setIsExtracting(false);
  }, []);

  function resetResults() {
    cancelExtraction();
    setExtractionMessage("");
    setResult(null);
    setActiveHistoryId(null);
  }

  // Load a document into the viewer
  function openDocument(next) {
    cancelExtraction();
    setDoc(next);
    setNumPages(next?.pages ?? null);
    setPageNumber(1);
    setSelection(null);
    setLoadError("");
    setHistory([]);
    resetResults();
    setRange({ mode: "page", from: "1", to: String(next?.pages ?? 1) });
  }

  // Handle PDF upload (file picker or drag and drop)
  async function handleFile(file, password) {
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setLoadError("Please upload a valid PDF file.");
      return;
    }

    const token = ++uploadToken.current;
    const retrying = !!password;
    if (!retrying) {
      setPasswordPrompt(null);
      openDocument({ file, id: null, pages: null });
      setExtractionMessage("Uploading PDF...");
    } else {
      setPasswordPrompt({ file, error: "", submitting: true });
    }

    try {
      const data = await uploadPdf(file, password);
      if (token !== uploadToken.current) return;
      const previousId = documentId;
      const staleVersions = undoStack;
      setUndoStack([]);
      // An unlocked upload is stored without encryption; show that copy, not the original
      const shown = retrying ? await fetchDocumentFile(data.document_id, file.name) : file;
      if (token !== uploadToken.current) return;
      setPasswordPrompt(null);
      openDocument({ file: shown, id: data.document_id, pages: data.pages });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ id: data.document_id, name: file.name })
      );
      if (previousId) deleteDocument(previousId);
      staleVersions.forEach((version) => deleteDocument(version.id));
      setExtractionMessage("PDF uploaded. Select an area or choose an extraction.");
    } catch (error) {
      if (token !== uploadToken.current) return;
      if (error.code === "password_required" || error.code === "incorrect_password") {
        setPasswordPrompt({ file, error: error.code === "incorrect_password" ? error.message : "", submitting: false });
        setLoadError("");
        setDoc(null);
        setExtractionMessage("");
        return;
      }
      console.error("Upload error:", error);
      setPasswordPrompt(null);
      setLoadError(error.message);
      setDoc(null);
      setExtractionMessage("");
    }
  }

  // A server-side edit (rotate, split, merge, ...) produced a new document.
  // The previous version is kept so the edit can be undone.
  async function handleDocumentChanged(response, name, page = pageNumber) {
    const file = await fetchDocumentFile(response.document_id, name);
    if (documentId) {
      const kept = [
        ...undoStack,
        { id: documentId, name: pdfFile.name, pages: numPages, page: pageNumber },
      ];
      kept.splice(0, Math.max(kept.length - MAX_UNDO, 0)).forEach((old) => deleteDocument(old.id));
      setUndoStack(kept);
    }
    openDocument({ file, id: response.document_id, pages: response.pages });
    setPageNumber(clamp(page, 1, response.pages));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: response.document_id, name }));
  }

  async function handleUndo() {
    const previous = undoStack[undoStack.length - 1];
    if (!previous || busy) return;
    setBusy(true);
    try {
      const file = await fetchDocumentFile(previous.id, previous.name);
      const currentId = documentId;
      setUndoStack((stack) => stack.slice(0, -1));
      openDocument({ file, id: previous.id, pages: previous.pages });
      setPageNumber(clamp(previous.page, 1, previous.pages));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: previous.id, name: previous.name }));
      if (currentId) deleteDocument(currentId);
    } catch {
      // The old version expired on the server, so it can no longer be restored
      setUndoStack((stack) => stack.filter((entry) => entry.id !== previous.id));
      setExtractionMessage("That earlier version is no longer available.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReorder(from, to) {
    if (!documentId || busy || from === to) return;
    setBusy(true);
    try {
      const response = await editDocument(documentId, {
        op: "reorder",
        pages: movePage(numPages, from, to),
      });
      await handleDocumentChanged(response, pdfFile.name, to);
    } catch (error) {
      setExtractionMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  // Restore the last document after a page reload
  useEffect(() => {
    const saved = readSavedDocument();
    if (!saved?.id) return;
    let cancelled = false;
    fetchDocumentFile(saved.id, saved.name ?? "document.pdf")
      .then((file) => {
        if (!cancelled) openDocument({ file, id: saved.id, pages: null });
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDocumentLoadSuccess({ numPages: total }) {
    setNumPages(total);
    setLoadError("");
    setRange((previous) => ({ ...previous, to: String(total) }));
  }

  function onDocumentLoadError(error) {
    console.error("PDF loading error:", error);
    setLoadError("Unable to load this PDF. Please try another file.");
  }

  function goToPage(requested) {
    if (!numPages) return;
    const next = clamp(requested, 1, numPages);
    if (next === pageNumber) return;
    setPageNumber(next);
    setSelection(null);
    resetResults();
  }

  function handleScopeChange(scope) {
    setExtractionScope(scope);
    setSelection(null);
    resetResults();
  }

  // Page(s)/region for extraction requests, computed at click time
  function getScopePayload() {
    if (extractionScope === "region") {
      return {
        extraction_scope: "region",
        page_number: selection.page,
        x_percent: rect.x,
        y_percent: rect.y,
        width_percent: rect.width,
        height_percent: rect.height,
      };
    }
    const payload = { extraction_scope: "document", page_number: pageNumber };
    if (range.mode === "all") {
      return { ...payload, page_start: 1, page_end: numPages };
    }
    if (range.mode === "range") {
      const from = Number(range.from);
      const to = Number(range.to);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > numPages) {
        return { error: `Enter a valid page range between 1 and ${numPages}.` };
      }
      return { ...payload, page_start: from, page_end: to };
    }
    return payload;
  }

  function describeScope(payload) {
    if (payload.extraction_scope === "region") return `region, page ${payload.page_number}`;
    if (payload.page_start) return `pages ${payload.page_start}–${payload.page_end}`;
    return `page ${payload.page_number}`;
  }

  async function handleExtract(type) {
    if (isExtractDisabled || isExtracting) return;

    const scopePayload = getScopePayload();
    if (scopePayload.error) {
      setExtractionMessage(scopePayload.error);
      return;
    }

    const controller = new AbortController();
    extractionController.current = controller;
    setIsExtracting(true);
    setExtractionMessage("Sending extraction request...");

    try {
      const data = await extract(
        { ...scopePayload, extraction_type: type, document_id: documentId },
        controller.signal
      );

      const isEmpty =
        !data.detected_type || (Array.isArray(data.data) && data.data.length === 0);
      const entry = {
        id: Date.now(),
        label: `${data.detected_type ?? "result"} · ${describeScope(scopePayload)}`,
        result: data,
      };
      setResult(data);
      setActiveHistoryId(entry.id);
      setHistory((previous) => [entry, ...previous].slice(0, MAX_HISTORY));
      setExtractionMessage(
        data.ocr
          ? `Detected ${data.detected_type} (OCR).`
          : isEmpty
          ? `No ${data.detected_type ?? "content"} found in the selected area.`
          : `Detected ${data.detected_type}.`
      );
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Extraction error:", error);
      setExtractionMessage(error.message || "The extraction request failed.");
    } finally {
      if (extractionController.current === controller) {
        extractionController.current = null;
        setIsExtracting(false);
      }
    }
  }

  function clearResult() {
    setResult(null);
    setActiveHistoryId(null);
    setExtractionMessage("");
  }

  // Keep user edits in the history entry so they survive switching between results
  function updateResultData(data) {
    const withEdit = (value) => ({ ...value, data, originalData: value.originalData ?? value.data });
    setResult((previous) => (previous ? withEdit(previous) : previous));
    setHistory((previous) =>
      previous.map((entry) =>
        entry.id === activeHistoryId ? { ...entry, result: withEdit(entry.result) } : entry
      )
    );
  }

  function clearSelection() {
    setSelection(null);
    setExtractionMessage("");
  }

  function selectHistoryEntry(entry) {
    setResult(entry.result);
    setActiveHistoryId(entry.id);
    setExtractionMessage("");
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target;
      if (
        (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z" &&
        !target.isContentEditable && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (
        event.ctrlKey || event.metaKey || event.altKey ||
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        return;
      }
      switch (event.key) {
        case "ArrowLeft":
        case "PageUp":
          goToPage(pageNumber - 1);
          break;
        case "ArrowRight":
        case "PageDown":
          goToPage(pageNumber + 1);
          break;
        case "Escape":
          clearSelection();
          break;
        case "+":
        case "=":
          setZoom((z) => clamp(z + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
          break;
        case "-":
          setZoom((z) => clamp(z - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
          break;
        case "0":
          setZoom(1);
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Drag and drop
  function onDragOver(event) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setIsDragging(true);
  }

  function onDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div
      className="min-h-screen bg-bg text-fg"
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed border-accent bg-bg/80 text-xl font-semibold text-accent">
          Drop a PDF to open it
        </div>
      )}

      {passwordPrompt && (
        <PasswordDialog
          fileName={passwordPrompt.file.name}
          error={passwordPrompt.error}
          busy={passwordPrompt.submitting}
          onSubmit={(password) => handleFile(passwordPrompt.file, password)}
          onCancel={() => {
            uploadToken.current++;
            setPasswordPrompt(null);
          }}
        />
      )}

      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="text-3xl leading-none">PDF Workbench</h1>
            <p className="mt-1 text-sm text-muted">
              Extract text, tables and images from your documents.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-on-primary transition hover:bg-primary-hover">
            <Upload className="h-4 w-4" />
            Upload PDF
            <input
              ref={uploadInput}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
              className="hidden"
            />
          </label>
        </div>
      </header>

      {/* Main workspace */}
      <main className="grid min-h-[calc(100vh-100px)] grid-cols-1 lg:grid-cols-3">
        <Viewer
          file={documentId ? pdfFile : null}
          numPages={numPages}
          pageNumber={pageNumber}
          zoom={zoom}
          scope={extractionScope}
          selection={selection}
          loadError={loadError}
          onSelectionChange={setSelection}
          onPageChange={goToPage}
          onReorder={handleReorder}
          onZoomChange={setZoom}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          placeholder={
            <div className="mx-auto grid max-w-3xl items-center gap-8 rounded-3xl border-2 border-dashed border-line-strong bg-surface p-8 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  Extract anything
                </p>
                <h2 className="mt-3 text-4xl leading-tight sm:text-5xl">
                  Every page holds something useful.
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted">
                  Drop a PDF anywhere on this page, preview it, select a region and pull out
                  the text, tables or images you need.
                </p>
                <button
                  type="button"
                  onClick={() => uploadInput.current?.click()}
                  className={`${primaryButton} mt-6 inline-flex items-center gap-2`}
                >
                  <Upload className="h-4 w-4" />
                  Upload a PDF
                </button>
              </div>
              <div className="hidden md:block">
                <HeroIllustration />
              </div>
            </div>
          }
        />

        {/* Right: Controls */}
        <aside className="space-y-6 bg-bg p-6">
          <DocumentInfo file={pdfFile} numPages={numPages} />

          <ExtractionPanel
            showForm={!result}
            hasDocument={!!pdfFile}
            hasSelection={hasSelection}
            scope={extractionScope}
            onScopeChange={handleScopeChange}
            range={range}
            onRangeChange={setRange}
            numPages={numPages}
            disabled={isExtractDisabled}
            isExtracting={isExtracting}
            onExtract={handleExtract}
            message={extractionMessage}
          />

          {result && (
            <ResultPanel result={result} onChange={updateResultData} onClear={clearResult} />
          )}

          <HistoryPanel history={history} activeId={activeHistoryId} onSelect={selectHistoryEntry} />

          <ToolsPanel
            file={pdfFile}
            documentId={documentId}
            pageNumber={pageNumber}
            numPages={numPages}
            onDocumentChanged={handleDocumentChanged}
            busy={busy}
            setBusy={setBusy}
            undoCount={undoStack.length}
            onUndo={handleUndo}
          />
        </aside>
      </main>

      {/* Feature highlights (empty state only) */}
      {!pdfFile && (
        <section className="grid gap-4 border-t border-line px-6 py-8 sm:grid-cols-3">
          {[
            ["01", "Select what matters", "Draw a box around a table, paragraph or figure, or process whole pages and ranges."],
            ["02", "Edit before you export", "Fix text and table cells in place, then copy or download TXT, CSV, XLSX or JSON."],
            ["03", "Handle scans too", "Scanned pages are read with OCR, and password-protected PDFs open with your password."],
          ].map(([number, title, body]) => (
            <div key={number} className="rounded-3xl border border-line bg-surface p-6">
              <p className="text-sm font-semibold text-accent">{number}</p>
              <h3 className="mt-2 font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-4 text-xs text-subtle">
        <span>PDF Workbench · Your files stay on your own server and are deleted automatically.</span>
        <span className="inline-flex items-center gap-2" role="status">
          <span
            className={`h-2 w-2 rounded-full ${
              backendUp === null ? "bg-subtle" : backendUp ? "bg-emerald-500" : "bg-danger"
            }`}
          />
          {backendUp === null ? "Checking backend…" : backendUp ? "Backend connected" : "Backend offline"}
        </span>
      </footer>
    </div>
  );
}

export default App;
