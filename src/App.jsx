import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

function App() {
  // PDF state
  const [pdfFile, setPdfFile] = useState(null);
  const [documentId, setDocumentId] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageWidth, setPageWidth] = useState(450);
  const [pageHeight, setPageHeight] = useState(450);
  const [loadError, setLoadError] = useState("");

  // Selection state
  const [selection, setSelection] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Extraction state
  const [extractionScope, setExtractionScope] = useState("document");
  const [extractionMessage, setExtractionMessage] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState(null);

  // Handle PDF upload
  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setLoadError("Please upload a valid PDF file.");
      event.target.value = "";
      return;
    }

    setPdfFile(file);
    setDocumentId(null);
    setNumPages(null);
    setPageNumber(1);
    setPageInput("1");
    setSelection(null);
    setIsDrawing(false);
    setLoadError("");
    setExtractionMessage("");
    setResult(null);

    const apiUrl = (import.meta.env.VITE_API_URL ?? "/api").replace(
      /\/$/,
      ""
    );
    const formData = new FormData();
    formData.append("file", file);

    try {
      setExtractionMessage("Uploading PDF...");
      const response = await fetch(`${apiUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.detail ?? `Backend returned status ${response.status}.`
        );
      }

      const data = await response.json();
      if (!data.document_id) {
        throw new Error("The backend did not return a document ID.");
      }
      setDocumentId(data.document_id);
      setExtractionMessage("PDF uploaded. Select an area or choose an extraction.");
    } catch (error) {
      console.error("Upload error:", error);
      setLoadError(
        error instanceof TypeError
          ? "Could not connect to the backend. Start FastAPI on port 8000 and try again."
          : error instanceof Error
            ? error.message
            : "The PDF upload failed."
      );
      setPdfFile(null);
      setDocumentId(null);
    }
  }

  // PDF successfully loaded
  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setPageNumber(1);
    setPageInput("1");
    setLoadError("");
  }

  // PDF loading failed
  function onDocumentLoadError(error) {
    console.error("PDF loading error:", error);
    setLoadError("Unable to load this PDF. Please try another file.");
  }

  // Navigate to the previous page
  function goToPreviousPage() {
    if (pageNumber <= 1) return;

    const newPage = pageNumber - 1;

    setPageNumber(newPage);
    setPageInput(String(newPage));
    setSelection(null);
    setExtractionMessage("");
    setResult(null);
  }

  // Navigate to the next page
  function goToNextPage() {
    if (!numPages || pageNumber >= numPages) return;

    const newPage = pageNumber + 1;

    setPageNumber(newPage);
    setPageInput(String(newPage));
    setSelection(null);
    setExtractionMessage("");
    setResult(null);
  }

  // Jump to a specific page
  function goToSelectedPage(event) {
    event.preventDefault();

    const requestedPage = Number(pageInput);

    if (
      !Number.isInteger(requestedPage) ||
      requestedPage < 1 ||
      requestedPage > numPages
    ) {
      setPageInput(String(pageNumber));
      return;
    }

    setPageNumber(requestedPage);
    setPageInput(String(requestedPage));
    setSelection(null);
    setExtractionMessage("");
    setResult(null);
  }

  // Start drawing a selection rectangle
  function handleMouseDown(event) {
    if (event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setSelection({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      pageNumber,
    });

    setIsDrawing(true);
    setExtractionMessage("");
    setResult(null);
  }

  // Update the selection rectangle while dragging
  function handleMouseMove(event) {
    if (!isDrawing) return;

    const rect = event.currentTarget.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setSelection((previous) => {
      if (!previous) return null;

      return {
        ...previous,
        currentX: x,
        currentY: y,
      };
    });
  }

  // Finish drawing
  function handleMouseUp() {
    setIsDrawing(false);
  }

  // Change extraction scope
  function handleScopeChange(scope) {
    setExtractionScope(scope);
    setSelection(null);
    setIsDrawing(false);
    setExtractionMessage("");
    setResult(null);
  }

  // Determine whether the extraction buttons should be disabled
  const hasSelection =
    selection &&
    selection.pageNumber === pageNumber &&
    Math.abs(selection.currentX - selection.startX) > 0 &&
    Math.abs(selection.currentY - selection.startY) > 0;

  const isExtractDisabled =
    !pdfFile ||
    !documentId ||
    (extractionScope === "region" && !hasSelection);

  // Format file size
  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  // Selection rectangle dimensions
  const selectionLeft = selection
    ? Math.min(selection.startX, selection.currentX)
    : 0;

  const selectionTop = selection
    ? Math.min(selection.startY, selection.currentY)
    : 0;

  const selectionWidth = selection
    ? Math.abs(selection.currentX - selection.startX)
    : 0;

  const selectionHeight = selection
    ? Math.abs(selection.currentY - selection.startY)
    : 0;
  

  async function handleExtract(type) {
    if (isExtractDisabled || isExtracting) return;

    const apiUrl = (import.meta.env.VITE_API_URL ?? "/api").replace(
      /\/$/,
      ""
    );
    const payload = {
      extraction_scope: extractionScope,
      extraction_type: type,
      page_number: selection?.pageNumber ?? pageNumber,
      document_id: documentId,
      x_percent: hasSelection ? selectionLeft / pageWidth : null,
      y_percent: hasSelection ? selectionTop / pageHeight : null,
      width_percent: hasSelection ? selectionWidth / pageWidth : null,
      height_percent: hasSelection ? selectionHeight / pageHeight : null,
    };

    setIsExtracting(true);
    setExtractionMessage("Sending extraction request...");
    try {
      const response = await fetch(`${apiUrl}/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        if (response.status === 502 || response.status === 503) {
          throw new Error(
            "The FastAPI backend is not running. Start it on port 8000 and try again."
          );
        }
        throw new Error(
          errorBody?.detail ?? `Backend returned status ${response.status}.`
        );
      }

      const data = await response.json();

      setResult(data);
      const isEmpty =
        !data.detected_type ||
        (Array.isArray(data.data) && data.data.length === 0);
      setExtractionMessage(
        isEmpty
          ? `No ${data.detected_type ?? "content"} found in the selected area.`
          : `Detected ${data.detected_type}.`
      );
    } catch (error) {
      console.error("Extraction error:", error);
      setExtractionMessage(
        error instanceof TypeError
          ? "Could not connect to the backend. Start FastAPI on port 8000 and try again."
          : error instanceof Error
            ? error.message
            : "The extraction request failed."
      );
    } finally {
      setIsExtracting(false);
    }

  }

  function downloadCsv() {
    if (result?.detected_type !== "table") return;

    const csv = result.data
      .flatMap((table) => [
        ...table.map((row) =>
          row
            .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
            .join(",")
        ),
        "",
      ])
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "extracted-table.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearResult() {
    setResult(null);
    setExtractionMessage("");
  }
  





  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-slate-700 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            PDF Workbench
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Extract useful information from your documents.
          </p>
        </div>

        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700">
          Upload PDF

          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </header>

      {/* Main workspace */}
      <main className="grid min-h-[calc(100vh-100px)] grid-cols-1 lg:grid-cols-3">
        {/* Left: PDF Viewer */}
        <section className="border-b border-slate-700 bg-slate-800 lg:col-span-2 lg:border-r lg:border-b-0">
          {/* Viewer toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-6 py-4">
            <div>
              <h2 className="font-semibold">Document Preview</h2>

              <p className="mt-1 text-xs text-slate-500">
                {pdfFile
                  ? pdfFile.name
                  : "Upload a PDF to get started"}
              </p>
            </div>

            {pdfFile && numPages && (
              <form
                onSubmit={goToSelectedPage}
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  onClick={goToPreviousPage}
                  disabled={pageNumber <= 1}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <span className="text-sm text-slate-400">
                  Page
                </span>

                <input
                  type="number"
                  min="1"
                  max={numPages}
                  value={pageInput}
                  onChange={(event) =>
                    setPageInput(event.target.value)
                  }
                  aria-label="Page number"
                  className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-center text-sm outline-none focus:border-blue-500"
                />

                <span className="text-sm text-slate-400">
                  of {numPages}
                </span>

                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm transition hover:bg-slate-700"
                >
                  Go
                </button>

                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={pageNumber >= numPages}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </form>
            )}
          </div>

          {/* PDF canvas area */}
          <div className="flex min-h-[650px] justify-center overflow-auto bg-slate-900 p-6">
            {loadError ? (
              <div className="m-auto max-w-md text-center">
                <p className="text-lg font-semibold text-red-400">
                  Unable to display PDF
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  {loadError}
                </p>
              </div>
            ) : !pdfFile ? (
              <div className="m-auto max-w-md text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-2xl">
                  PDF
                </div>

                <h2 className="text-xl font-semibold">
                  Your document workspace
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Upload a PDF to preview its pages, select a region,
                  and choose what you want to extract.
                </p>
              </div>
            ) : (
              <div className="h-fit">
                <Document
                  file={pdfFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={
                    <p className="py-10 text-sm text-slate-400">
                      Loading PDF...
                    </p>
                  }
                  error={
                    <p className="py-10 text-sm text-red-400">
                      Failed to render this PDF.
                    </p>
                  }
                >
                  <div className="relative inline-block align-top">
                    <Page
                      pageNumber={pageNumber}
                      width={450}
                      onRenderSuccess={(page) => {
                        const viewport = page.getViewport({ scale: 1 });
                        setPageWidth(450);
                        setPageHeight(
                          (450 * viewport.height) / viewport.width
                        );
                      }}
                      className="pdf-page"
                    />

                    {/* Selection overlay (only in region mode) */}
                    {extractionScope === "region" && (
                    <div
                      className="absolute inset-0 z-10 cursor-crosshair"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onContextMenu={(event) =>
                        event.preventDefault()
                      }
                    >
                      {selection &&
                        selection.pageNumber === pageNumber &&
                        (isDrawing || hasSelection) && (
                          <div
                            className="pointer-events-none absolute border-2 border-blue-400 bg-blue-400/10"
                            style={{
                              left: selectionLeft,
                              top: selectionTop,
                              width: selectionWidth,
                              height: selectionHeight,
                            }}
                          />
                        )}
                    </div>
                    )}
                  </div>
                </Document>
              </div>
            )}
          </div>

          {/* Viewer footer */}
          {pdfFile && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 px-6 py-3 text-xs text-slate-500">
              <span>
                {numPages
                  ? `${numPages} page${numPages === 1 ? "" : "s"}`
                  : "Reading document..."}
              </span>

              <span>
                {extractionScope !== "region"
                  ? "Entire document mode"
                  : isDrawing
                    ? "Drawing selection..."
                    : "Drag across the PDF to select a region"}
              </span>
            </div>
          )}
        </section>

        {/* Right: Controls */}
        <aside className="space-y-6 bg-slate-800 p-6">
          {/* Document information */}
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">
              Document Information
            </h2>

            {pdfFile ? (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Filename</p>
                  <p className="mt-1 break-all text-sm">
                    {pdfFile.name}
                  </p>
                </div>

                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Pages</p>
                    <p className="mt-1 text-sm">
                      {numPages ?? "Loading..."}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">File size</p>
                    <p className="mt-1 text-sm">
                      {formatFileSize(pdfFile.size)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No document uploaded yet.
              </p>
            )}
          </section>

          {/* Extraction scope and actions */}
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">
              Extraction Actions
            </h2>

            {!result && (
              <>
                <p className="mt-1 text-sm text-slate-400">
                  Choose a content type and where to extract it from.
                </p>

                <div className="mt-5">
                  <p className="mb-3 text-sm font-medium text-slate-300">
                    Extraction Scope
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleScopeChange("document")}
                      aria-pressed={extractionScope === "document"}
                      className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${
                        extractionScope === "document"
                          ? "border-blue-500 bg-blue-600/10 text-blue-300"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      Entire Page
                    </button>

                    <button
                      type="button"
                      onClick={() => handleScopeChange("region")}
                      aria-pressed={extractionScope === "region"}
                      className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${
                        extractionScope === "region"
                          ? "border-blue-500 bg-blue-600/10 text-blue-300"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      Selected Region
                    </button>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {extractionScope === "document"
                      ? "Process all matching content on the current PDF page."
                      : "Draw a rectangle on the current PDF page to choose the area to process."}
                  </p>
                </div>

                <div className="mt-6">
                  {extractionScope === "document" ? (
                    <>
                      <p className="mb-3 text-sm font-medium text-slate-300">
                        Select content type
                      </p>
                      <div className="flex flex-col gap-3">
                        {[
                          ["text", "Extract Text"],
                          ["tables", "Extract Tables"],
                          ["images", "Extract Images"],
                        ].map(([type, label]) => (
                          <button
                            key={type}
                            type="button"
                            disabled={isExtractDisabled || isExtracting}
                            onClick={() => handleExtract(type)}
                            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                          >
                            {isExtracting ? "Extracting..." : label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isExtractDisabled || isExtracting}
                      onClick={() => handleExtract("smart")}
                      className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      {isExtracting
                        ? "Detecting..."
                        : "Smart Extract Selection"}
                    </button>
                  )}

                  {!pdfFile && (
                    <p className="mt-3 text-xs text-amber-400">
                      Upload a PDF to enable extraction.
                    </p>
                  )}

                  {pdfFile && extractionScope === "region" && !hasSelection && (
                    <p className="mt-3 text-xs text-amber-400">
                      Select a rectangular region on the PDF first.
                    </p>
                  )}
                </div>
              </>
            )}

            {extractionMessage && (
              <p
                role="status"
                className="mt-4 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm leading-5 text-slate-300"
              >
                {extractionMessage}
              </p>
            )}
          </section>

          {result && (
            <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold">Extraction Result</h2>
              {result.detected_type === "text" && (
                <textarea
                  readOnly
                  value={result.data}
                  aria-label="Extracted text"
                  className="mt-4 min-h-48 w-full resize-y rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm leading-6 text-slate-200 outline-none"
                />
              )}
              {result.detected_type === "table" && (
                <>
                  <div className="mt-4 space-y-4 overflow-auto">
                    {result.data.map((table, tableIndex) => (
                      <table
                        key={tableIndex}
                        className="w-full border-collapse text-left text-sm"
                      >
                        <tbody>
                          {table.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={cellIndex}
                                  className="border border-slate-700 px-3 py-2"
                                >
                                  {cell ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={downloadCsv}
                    className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium transition hover:bg-slate-800"
                  >
                    Download CSV
                  </button>
                </>
              )}
              {result.detected_type === "image" && (
                <div className="mt-4 grid gap-4">
                  {result.data.map((image, index) => (
                    <img
                      key={index}
                      src={image}
                      alt={`Extracted image ${index + 1}`}
                      className="max-h-96 max-w-full rounded-lg object-contain"
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={clearResult}
                className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium transition hover:bg-slate-800"
              >
                Choose Another Extraction
              </button>
            </section>
          )}

          {/* Selection coordinates */}
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                Selection Coordinates
              </h2>

              {hasSelection && (
                <button
                  type="button"
                  onClick={() => {
                    setSelection(null);
                    setIsDrawing(false);
                    setExtractionMessage("");
                    setResult(null);
                  }}
                  className="text-xs text-slate-400 transition hover:text-red-400"
                >
                  Clear
                </button>
              )}
            </div>

            {hasSelection ? (
              <>
                <p className="mt-2 text-xs text-blue-400">
                  Region selected on page {selection.pageNumber}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-500">Start X</p>
                    <p className="mt-1 text-sm font-medium">
                      {selection.startX.toFixed(1)} px
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-500">Start Y</p>
                    <p className="mt-1 text-sm font-medium">
                      {selection.startY.toFixed(1)} px
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-500">Width</p>
                    <p className="mt-1 text-sm font-medium">
                      {selectionWidth.toFixed(1)} px
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-500">Height</p>
                    <p className="mt-1 text-sm font-medium">
                      {selectionHeight.toFixed(1)} px
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  These are preview coordinates in pixels, not yet
                  converted to the PDF's internal coordinate system.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                No region selected. Drag across the PDF to select an
                area when using Selected Region mode.
              </p>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
