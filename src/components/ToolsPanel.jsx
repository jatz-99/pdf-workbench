import { useRef, useState } from "react";
import { editDocument, mergeDocument } from "../api";
import { movePage } from "../utils/pages";
import { downloadBlob } from "../utils/exporters";
import { card, inputClass, secondaryButton } from "./ui";

export default function ToolsPanel({
  file,
  documentId,
  pageNumber,
  numPages,
  onDocumentChanged,
  busy,
  setBusy,
  undoCount,
  onUndo,
}) {
  const [keepFrom, setKeepFrom] = useState("");
  const [keepTo, setKeepTo] = useState("");
  const [error, setError] = useState("");
  const mergeInput = useRef(null);

  const disabled = !documentId || !numPages || busy;
  const baseName = file?.name.replace(/\.pdf$/i, "") ?? "document";

  async function run(action, suffix, page) {
    setBusy(true);
    setError("");
    try {
      const response = await action();
      await onDocumentChanged(response, suffix ? `${baseName}-${suffix}.pdf` : file.name, page);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  const edit = (body, suffix, page) =>
    run(() => editDocument(documentId, body), suffix, page);

  function movePageBy(offset) {
    const target = pageNumber + offset;
    edit({ op: "reorder", pages: movePage(numPages, pageNumber, target) }, undefined, target);
  }

  function keepPages(event) {
    event.preventDefault();
    const from = Number(keepFrom);
    const to = Number(keepTo || keepFrom);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > numPages) {
      setError(`Enter a valid page range between 1 and ${numPages}.`);
      return;
    }
    const pages = Array.from({ length: to - from + 1 }, (_, index) => from + index);
    edit({ op: "keep", pages }, `pages-${from}-${to}`);
  }

  function handleMerge(event) {
    const other = event.target.files?.[0];
    event.target.value = "";
    if (other) run(() => mergeDocument(documentId, other), "merged");
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">PDF Tools</h2>
      <p className="mt-1 text-sm text-slate-400">
        Edits create a new version of the document. Download it when you are done.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => edit({ op: "rotate", pages: [pageNumber], angle: -90 })}
          className={secondaryButton}
        >
          Rotate ⟲
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => edit({ op: "rotate", pages: [pageNumber], angle: 90 })}
          className={secondaryButton}
        >
          Rotate ⟳
        </button>
        <button
          type="button"
          disabled={disabled || numPages < 2}
          onClick={() => edit({ op: "delete", pages: [pageNumber] })}
          className={secondaryButton}
        >
          Delete page
        </button>
        <button
          type="button"
          disabled={disabled || pageNumber <= 1}
          onClick={() => movePageBy(-1)}
          className={secondaryButton}
          title="Move this page up (or drag thumbnails)"
        >
          Move up ↑
        </button>
        <button
          type="button"
          disabled={disabled || pageNumber >= numPages}
          onClick={() => movePageBy(1)}
          className={secondaryButton}
          title="Move this page down (or drag thumbnails)"
        >
          Move down ↓
        </button>
        <button
          type="button"
          disabled={busy || undoCount === 0}
          onClick={async () => {
            setError("");
            await onUndo();
          }}
          className={secondaryButton}
          title="Undo last edit (Ctrl+Z)"
        >
          Undo{undoCount > 0 ? ` (${undoCount})` : ""}
        </button>
      </div>

      <form onSubmit={keepPages} className="mt-3 flex items-center gap-2 text-sm text-slate-400">
        <span>Keep pages</span>
        <input
          type="number"
          min="1"
          max={numPages ?? undefined}
          value={keepFrom}
          onChange={(event) => setKeepFrom(event.target.value)}
          aria-label="First page to keep"
          className={`${inputClass} w-16 text-center`}
        />
        <span>to</span>
        <input
          type="number"
          min="1"
          max={numPages ?? undefined}
          value={keepTo}
          onChange={(event) => setKeepTo(event.target.value)}
          aria-label="Last page to keep"
          className={`${inputClass} w-16 text-center`}
        />
        <button type="submit" disabled={disabled || !keepFrom} className={secondaryButton}>
          Split
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => mergeInput.current.click()}
          className={secondaryButton}
        >
          Merge another PDF…
        </button>
        <input
          ref={mergeInput}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleMerge}
          className="hidden"
          aria-label="PDF to merge"
        />
        <button
          type="button"
          disabled={!file}
          onClick={() => downloadBlob(file, file.name)}
          className={secondaryButton}
        >
          Download PDF
        </button>
      </div>

      {busy && <p className="mt-3 text-xs text-slate-400">Working...</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
