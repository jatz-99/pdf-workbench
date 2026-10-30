import { card, inputClass, primaryButton } from "./ui";

const scopeButton = (active) =>
  `rounded-lg border px-3 py-3 text-sm font-medium transition ${
    active
      ? "border-blue-500 bg-blue-600/10 text-blue-300"
      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
  }`;

export default function ExtractionPanel({
  showForm,
  hasDocument,
  hasSelection,
  scope,
  onScopeChange,
  range,
  onRangeChange,
  numPages,
  disabled,
  isExtracting,
  onExtract,
  message,
}) {
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Extraction Actions</h2>

      {showForm && (
        <>
          <p className="mt-1 text-sm text-slate-400">
            Choose a content type and where to extract it from.
          </p>

          <div className="mt-5">
            <p className="mb-3 text-sm font-medium text-slate-300">Extraction Scope</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onScopeChange("document")}
                aria-pressed={scope === "document"}
                className={scopeButton(scope === "document")}
              >
                Entire Page
              </button>
              <button
                type="button"
                onClick={() => onScopeChange("region")}
                aria-pressed={scope === "region"}
                className={scopeButton(scope === "region")}
              >
                Selected Region
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              {scope === "document"
                ? "Process all matching content on the chosen pages."
                : "Draw a rectangle on the current PDF page to choose the area to process."}
            </p>
          </div>

          {scope === "document" && (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="range-mode">
                Pages
              </label>
              <select
                id="range-mode"
                value={range.mode}
                onChange={(event) => onRangeChange({ ...range, mode: event.target.value })}
                className={`${inputClass} w-full`}
              >
                <option value="page">Current page</option>
                <option value="all">All pages</option>
                <option value="range">Page range…</option>
              </select>

              {range.mode === "range" && (
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                  <input
                    type="number"
                    min="1"
                    max={numPages ?? undefined}
                    value={range.from}
                    onChange={(event) => onRangeChange({ ...range, from: event.target.value })}
                    aria-label="First page"
                    className={`${inputClass} w-20 text-center`}
                  />
                  to
                  <input
                    type="number"
                    min="1"
                    max={numPages ?? undefined}
                    value={range.to}
                    onChange={(event) => onRangeChange({ ...range, to: event.target.value })}
                    aria-label="Last page"
                    className={`${inputClass} w-20 text-center`}
                  />
                </div>
              )}
            </div>
          )}

          <div className="mt-6">
            {scope === "document" ? (
              <>
                <p className="mb-3 text-sm font-medium text-slate-300">Select content type</p>
                <div className="flex flex-col gap-3">
                  {[
                    ["text", "Extract Text"],
                    ["tables", "Extract Tables"],
                    ["images", "Extract Images"],
                  ].map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      disabled={disabled || isExtracting}
                      onClick={() => onExtract(type)}
                      className={primaryButton}
                    >
                      {isExtracting ? "Extracting..." : label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                disabled={disabled || isExtracting}
                onClick={() => onExtract("smart")}
                className={primaryButton}
              >
                {isExtracting ? "Detecting..." : "Smart Extract Selection"}
              </button>
            )}

            {!hasDocument && (
              <p className="mt-3 text-xs text-amber-400">Upload a PDF to enable extraction.</p>
            )}
            {hasDocument && scope === "region" && !hasSelection && (
              <p className="mt-3 text-xs text-amber-400">
                Select a rectangular region on the PDF first.
              </p>
            )}
          </div>
        </>
      )}

      {message && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm leading-5 text-slate-300"
        >
          {message}
        </p>
      )}
    </section>
  );
}
