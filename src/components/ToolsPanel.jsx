import { useRef, useState } from "react";
import { editDocument, mergeDocument } from "../api";
import { movePage } from "../utils/pages";
import { downloadBlob } from "../utils/exporters";
import { card, eyebrow, inputClass, secondaryButton } from "./ui";
import { ArrowDown, ArrowUp, Download, Merge, RotateLeft, RotateRight, Trash, Undo } from "./Icons";

const toolButton = `${secondaryButton} inline-flex items-center justify-center gap-2`;
const iconClass = "h-4 w-4";

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
      <p className={eyebrow}>Tools</p>
      <h2 className="mt-1 text-2xl">Edit this PDF</h2>
      <p className="mt-1 text-sm text-muted">
        Edits create a new version of the document. Download it when you are done.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => edit({ op: "rotate", pages: [pageNumber], angle: -90 })}
          className={toolButton}
        >
          <RotateLeft className={iconClass} /> Rotate left
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => edit({ op: "rotate", pages: [pageNumber], angle: 90 })}
          className={toolButton}
        >
          <RotateRight className={iconClass} /> Rotate right
        </button>
        <button
          type="button"
          disabled={disabled || numPages < 2}
          onClick={() => edit({ op: "delete", pages: [pageNumber] })}
          className={toolButton}
        >
          <Trash className={iconClass} /> Delete page
        </button>
        <button
          type="button"
          disabled={disabled || pageNumber <= 1}
          onClick={() => movePageBy(-1)}
          className={toolButton}
          title="Move this page up (or drag thumbnails)"
        >
          <ArrowUp className={iconClass} /> Move up
        </button>
        <button
          type="button"
          disabled={disabled || pageNumber >= numPages}
          onClick={() => movePageBy(1)}
          className={toolButton}
          title="Move this page down (or drag thumbnails)"
        >
          <ArrowDown className={iconClass} /> Move down
        </button>
        <button
          type="button"
          disabled={busy || undoCount === 0}
          onClick={async () => {
            setError("");
            await onUndo();
          }}
          className={toolButton}
          title="Undo last edit (Ctrl+Z)"
        >
          <Undo className={iconClass} /> Undo{undoCount > 0 ? ` (${undoCount})` : ""}
        </button>
      </div>

      <form onSubmit={keepPages} className="mt-3 flex items-center gap-2 text-sm text-muted">
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
        <button type="submit" disabled={disabled || !keepFrom} className={toolButton}>
          Split
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => mergeInput.current.click()}
          className={toolButton}
        >
          <Merge className={iconClass} /> Merge PDF…
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
          className={toolButton}
        >
          <Download className={iconClass} /> Download PDF
        </button>
      </div>

      {busy && <p className="mt-3 text-xs text-muted">Working...</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
