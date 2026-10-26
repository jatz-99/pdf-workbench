import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

function App() {
  // PDF state
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [loadError, setLoadError] = useState(null);

  // Selection state
  const [selection, setSelection] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const pdfUrlRef = useRef(null);

  // Handle PDF upload
  function handleFileChange(e) {
    const file = e.target.files[0];

    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }

    if (
      file &&
      (file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"))
    ) {
      const objectUrl = URL.createObjectURL(file);

      pdfUrlRef.current = objectUrl;

      setPdfFile(file);
      setPdfUrl(objectUrl);
      setNumPages(null);
      setPageNumber(1);
      setPageInput("1");
      setSelection(null);
      setIsDrawing(false);
      setLoadError(null);
    } else {
      setPdfFile(null);
      setPdfUrl(null);
      setNumPages(null);
      setPageNumber(1);
      setPageInput("1");
      setSelection(null);
      setIsDrawing(false);
      setLoadError(null);

      alert("Please select a valid PDF file.");
    }

    // Allows selecting the same file again
    e.target.value = "";
  }

  // Release the PDF object URL when the component unmounts
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
    };
  }, []);

  // PDF loading callbacks
  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setPageNumber(1);
    setPageInput("1");
    setSelection(null);
    setIsDrawing(false);
    setLoadError(null);
  }

  function onDocumentLoadError(error) {
    console.error("PDF loading error:", error);
    setLoadError("Failed to load this PDF. Please try another file.");
  }

  // Page navigation
  function goToPreviousPage() {
    const newPage = Math.max(pageNumber - 1, 1);

    setPageNumber(newPage);
    setPageInput(String(newPage));
    setSelection(null);
  }

  function goToNextPage() {
    const newPage = Math.min(pageNumber + 1, numPages);

    setPageNumber(newPage);
    setPageInput(String(newPage));
    setSelection(null);
  }

  function handlePageInputChange(e) {
    setPageInput(e.target.value);
  }

  function goToSelectedPage() {
    const selectedPage = Number(pageInput);

    if (
      pageInput.trim() !== "" &&
      Number.isInteger(selectedPage) &&
      selectedPage >= 1 &&
      selectedPage <= numPages
    ) {
      setPageNumber(selectedPage);
      setPageInput(String(selectedPage));
      setSelection(null);
    } else {
      alert(`Enter a page number between 1 and ${numPages}.`);
      setPageInput(String(pageNumber));
    }
  }

  function handlePageInputKeyDown(e) {
    if (e.key === "Enter") {
      goToSelectedPage();
    }
  }

  // Start drawing the selection rectangle
  function handleMouseDown(e) {
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSelection({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });

    setIsDrawing(true);
  }

  // Update the rectangle while dragging
  function handleMouseMove(e) {
    if (!isDrawing || !selection) return;

    const rect = e.currentTarget.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
    if (isDrawing) {
      setIsDrawing(false);
    }
  }

  return (
    <div className="h-screen w-full bg-slate-900 flex text-slate-100 p-3 gap-3">
      {/* Left Pane: PDF Viewer */}
      <div className="w-2/3 min-w-0 bg-slate-800 rounded-lg shadow-xl overflow-auto border border-slate-700">
        {pdfUrl ? (
          <div className="flex flex-col items-center p-4">
            <Document
              key={pdfUrl}
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <p className="text-slate-400 text-sm">
                  Loading your PDF...
                </p>
              }
              error={
                <p className="text-red-400 text-sm">
                  {loadError ??
                    "Failed to load the PDF. Please try another file."}
                </p>
              }
            >
              {/* PDF page and selection overlay */}
              <div className="relative inline-block">
                <Page
                  pageNumber={pageNumber}
                  width={450}
                  className="pdf-page"
                />

                {/* Ghost layer */}
                <div
                  className="absolute top-0 left-0 w-full h-full z-10 cursor-crosshair"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {/* Visible selection rectangle */}
                  {selection && (
                    <div
                      className="absolute border-2 border-emerald-400 bg-emerald-400/10 pointer-events-none"
                      style={{
                        left: Math.min(
                          selection.startX,
                          selection.currentX
                        ),
                        top: Math.min(
                          selection.startY,
                          selection.currentY
                        ),
                        width: Math.abs(
                          selection.currentX - selection.startX
                        ),
                        height: Math.abs(
                          selection.currentY - selection.startY
                        ),
                      }}
                    />
                  )}
                </div>
              </div>
            </Document>

            {numPages !== null && (
              <p className="text-slate-400 text-xs mt-3">
                Page {pageNumber} of {numPages}
              </p>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-slate-400 text-sm">
              Upload a PDF to get started
            </p>
          </div>
        )}
      </div>

      {/* Right Pane: Controls */}
      <div className="w-1/3 min-w-0 bg-slate-800 rounded-lg shadow-xl p-4 border border-slate-700 flex flex-col overflow-y-auto">
        <h1 className="text-xl font-semibold mb-2">
          PDF Workbench
        </h1>

        <p className="text-slate-400 text-sm mb-4">
          Extract text, tables, and images from your documents.
        </p>

        {/* File Upload */}
        <div className="border border-dashed border-slate-600 rounded-lg p-4 text-center">
          <p className="text-slate-300 text-sm mb-3 break-all">
            {pdfFile ? pdfFile.name : "Choose a PDF document"}
          </p>

          <label className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors">
            {pdfFile ? "Choose Another PDF" : "Upload PDF"}

            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          <p className="text-xs text-slate-500 mt-2">
            PDF files only
          </p>
        </div>

        {/* Page Navigation */}
        <div className="mt-4 rounded-lg bg-slate-900 p-3">
          <h2 className="text-sm font-medium mb-3">
            Page Navigation
          </h2>

          {numPages !== null ? (
            <>
              <label
                htmlFor="page-number"
                className="block text-sm text-slate-400 mb-2"
              >
                Select page (1–{numPages})
              </label>

              <div className="flex gap-2">
                <input
                  id="page-number"
                  type="number"
                  min={1}
                  max={numPages}
                  step={1}
                  value={pageInput}
                  onChange={handlePageInputChange}
                  onKeyDown={handlePageInputKeyDown}
                  placeholder="Enter page number"
                  className="w-full min-w-0 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />

                <button
                  onClick={goToSelectedPage}
                  className="rounded-md bg-blue-600 px-4 py-2 hover:bg-blue-700"
                >
                  Go
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={goToPreviousPage}
                  disabled={pageNumber <= 1}
                  className="rounded-md bg-slate-700 px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>

                <span className="text-sm text-slate-300 whitespace-nowrap">
                  {pageNumber} / {numPages}
                </span>

                <button
                  onClick={goToNextPage}
                  disabled={pageNumber >= numPages}
                  className="rounded-md bg-slate-700 px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              Upload a PDF to enable page navigation.
            </p>
          )}
        </div>

        {/* Document Information */}
        {pdfFile && numPages !== null && (
          <div className="mt-4 rounded-lg bg-slate-900 p-3">
            <h2 className="font-medium text-sm mb-2">
              Document Information
            </h2>

            <p className="text-xs text-slate-400 break-all">
              Filename: {pdfFile.name}
            </p>

            <p className="text-xs text-slate-400 mt-2">
              Pages: {numPages}
            </p>

            <p className="text-xs text-slate-400 mt-2">
              Size: {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        )}

        {/* Selection Information */}
        {selection && (
          <div className="mt-4 rounded-lg bg-slate-900 p-3">
            <h2 className="text-sm font-medium mb-2">
              Selection Coordinates
            </h2>

            <p className="text-xs text-slate-400">
              Start: ({selection.startX.toFixed(0)},{" "}
              {selection.startY.toFixed(0)})
            </p>

            <p className="text-xs text-slate-400 mt-1">
              Current: ({selection.currentX.toFixed(0)},{" "}
              {selection.currentY.toFixed(0)})
            </p>

            <p className="text-xs text-slate-400 mt-1">
              Status: {isDrawing ? "Drawing..." : "Selection finished"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App; 



