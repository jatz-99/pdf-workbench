import { useEffect, useRef, useState } from "react";
import { Document, Page, Thumbnail } from "react-pdf";
import { clamp, selectionRect } from "../utils/selection";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.5;
export const ZOOM_STEP = 0.25;

const PAGE_DRAG_TYPE = "application/x-pdf-page";

const buttonClass =
  "rounded-lg border border-slate-600 px-3 py-2 text-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";

function LazyThumbnail({ pageNumber, active, onSelect, onReorder }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { rootMargin: "200px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(pageNumber)}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(PAGE_DRAG_TYPE, String(pageNumber));
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        setIsOver(false);
        const from = Number(event.dataTransfer.getData(PAGE_DRAG_TYPE));
        if (!from) return;
        event.preventDefault();
        event.stopPropagation();
        onReorder(from, pageNumber);
      }}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
      className={`block w-full rounded-md border-2 p-1 text-center transition ${
        active ? "border-blue-500" : "border-transparent hover:border-slate-600"
      } ${isOver ? "bg-blue-500/20" : ""}`}
    >
      <div className="flex min-h-24 items-center justify-center bg-slate-900">
        {visible && <Thumbnail pageNumber={pageNumber} width={96} />}
      </div>
      <span className="mt-1 block text-xs text-slate-400">{pageNumber}</span>
    </button>
  );
}

function PageForm({ pageNumber, numPages, onPageChange }) {
  // Remounted (via key) whenever the page changes, so the input resets itself
  const [pageInput, setPageInput] = useState(String(pageNumber));

  function submit(event) {
    event.preventDefault();
    const requested = Number(pageInput);
    if (Number.isInteger(requested) && requested >= 1 && requested <= numPages) {
      onPageChange(requested);
    } else {
      setPageInput(String(pageNumber));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(pageNumber - 1)}
        disabled={pageNumber <= 1}
        className={buttonClass}
        title="Previous page (←)"
      >
        Previous
      </button>
      <span className="text-sm text-slate-400">Page</span>
      <input
        type="number"
        min="1"
        max={numPages}
        value={pageInput}
        onChange={(event) => setPageInput(event.target.value)}
        aria-label="Page number"
        className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-center text-sm outline-none focus:border-blue-500"
      />
      <span className="text-sm text-slate-400">of {numPages}</span>
      <button
        type="submit"
        className="rounded-lg bg-slate-700 px-3 py-2 text-sm transition hover:bg-slate-600"
      >
        Go
      </button>
      <button
        type="button"
        onClick={() => onPageChange(pageNumber + 1)}
        disabled={pageNumber >= numPages}
        className={buttonClass}
        title="Next page (→)"
      >
        Next
      </button>
    </form>
  );
}

export default function Viewer({
  file,
  numPages,
  pageNumber,
  zoom,
  scope,
  selection,
  loadError,
  onSelectionChange,
  onPageChange,
  onReorder,
  onZoomChange,
  onLoadSuccess,
  onLoadError,
  placeholder,
}) {
  const [scrollElement, setScrollElement] = useState(null);
  const overlayRef = useRef(null);
  const [fitWidth, setFitWidth] = useState(450);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);

  const pageWidth = Math.round(fitWidth * zoom);
  const rect = selectionRect(selection);

  // Fit the page to the available width at 100% zoom
  useEffect(() => {
    const element = scrollElement;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = Math.floor(entry.contentRect.width) - 48;
      setFitWidth(Math.max(300, Math.min(available, 900)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollElement]);

  // Ctrl/Cmd + wheel zooms the page instead of the whole browser
  useEffect(() => {
    const element = scrollElement;
    if (!element) return;
    function onWheel(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoomChange((previous) =>
        clamp(previous + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), MIN_ZOOM, MAX_ZOOM)
      );
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [scrollElement, onZoomChange]);

  function pointToFraction(event) {
    const bounds = overlayRef.current.getBoundingClientRect();
    return [
      clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    ];
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const [x, y] = pointToFraction(event);
    onSelectionChange({
      page: pageNumber,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
    setIsDrawing(true);
  }

  // Keep tracking the drag outside the page, clamped to its edges
  useEffect(() => {
    if (!isDrawing) return;
    function onMove(event) {
      if (!overlayRef.current) return;
      const [x, y] = pointToFraction(event);
      onSelectionChange((previous) =>
        previous ? { ...previous, currentX: x, currentY: y } : null
      );
    }
    function onUp() {
      setIsDrawing(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDrawing, onSelectionChange]);

  const ready = file && numPages;

  return (
    <section className="flex flex-col border-b border-slate-700 bg-slate-800 lg:col-span-2 lg:border-r lg:border-b-0">
      {/* Viewer toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-6 py-4">
        <div>
          <h2 className="font-semibold">Document Preview</h2>
          <p className="mt-1 text-xs text-slate-500">
            {file ? file.name : "Upload a PDF to get started"}
          </p>
        </div>

        {ready && (
          <div className="flex flex-wrap items-center gap-3">
            <PageForm
              key={pageNumber}
              pageNumber={pageNumber}
              numPages={numPages}
              onPageChange={onPageChange}
            />

            <div className="flex items-center gap-1" role="group" aria-label="Zoom">
              <button
                type="button"
                onClick={() => onZoomChange((z) => clamp(z - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
                disabled={zoom <= MIN_ZOOM}
                aria-label="Zoom out"
                title="Zoom out (-)"
                className={buttonClass}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => onZoomChange(1)}
                title="Fit to width (0)"
                className="w-16 rounded-lg border border-slate-600 px-2 py-2 text-sm transition hover:bg-slate-700"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => onZoomChange((z) => clamp(z + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
                disabled={zoom >= MAX_ZOOM}
                aria-label="Zoom in"
                title="Zoom in (+)"
                className={buttonClass}
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowThumbnails((value) => !value)}
              aria-pressed={showThumbnails}
              className={buttonClass}
            >
              Thumbnails
            </button>
          </div>
        )}
      </div>

      <div className="flex min-h-[650px] flex-1 bg-slate-950">
        {loadError ? (
          <div className="m-auto max-w-md p-6 text-center">
            <p className="text-lg font-semibold text-red-400">Unable to display PDF</p>
            <p className="mt-2 text-sm text-slate-400">{loadError}</p>
          </div>
        ) : !file ? (
          <div className="m-auto p-6">{placeholder}</div>
        ) : (
          <Document
            file={file}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            className="flex min-w-0 flex-1"
            loading={<p className="m-auto py-10 text-sm text-slate-400">Loading PDF...</p>}
            error={<p className="m-auto py-10 text-sm text-red-400">Failed to render this PDF.</p>}
          >
            {ready && showThumbnails && (
              <nav
                aria-label="Page thumbnails"
                className="relative hidden w-32 shrink-0 border-r border-slate-800 sm:block"
              >
                {/* Absolutely positioned so the strip matches the page area's height and scrolls inside it */}
                <div className="absolute inset-0 space-y-2 overflow-y-auto p-2">
                  {Array.from({ length: numPages }, (_, index) => (
                    <LazyThumbnail
                      key={index}
                      pageNumber={index + 1}
                      active={index + 1 === pageNumber}
                      onSelect={onPageChange}
                      onReorder={onReorder}
                    />
                  ))}
                </div>
              </nav>
            )}

            <div ref={setScrollElement} className="min-w-0 flex-1 overflow-auto p-6">
              <div className="mx-auto w-fit">
                <div className="relative inline-block align-top">
                  <Page
                    pageNumber={pageNumber}
                    width={pageWidth}
                    className="pdf-page select-none"
                    renderTextLayer={scope === "region"}
                  />

                  {/* Selection overlay (only in region mode) */}
                  {scope === "region" && (
                    <div
                      ref={overlayRef}
                      className="absolute inset-0 z-10 cursor-crosshair touch-none select-none"
                      onPointerDown={handlePointerDown}
                      onContextMenu={(event) => event.preventDefault()}
                    >
                      {rect && selection.page === pageNumber && (
                        <div
                          className="pointer-events-none absolute border-2 border-blue-400 bg-blue-400/10"
                          style={{
                            left: `${rect.x * 100}%`,
                            top: `${rect.y * 100}%`,
                            width: `${rect.width * 100}%`,
                            height: `${rect.height * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Document>
        )}
      </div>

      {file && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 px-6 py-3 text-xs text-slate-500">
          <span>
            {numPages ? `${numPages} page${numPages === 1 ? "" : "s"}` : "Reading document..."}
          </span>
          <span>
            {scope !== "region"
              ? "Entire page mode"
              : isDrawing
                ? "Drawing selection..."
                : "Drag across the PDF to select a region (Esc to clear)"}
          </span>
        </div>
      )}
    </section>
  );
}
