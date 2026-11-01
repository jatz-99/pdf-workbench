import { useState } from "react";
import { card, chip, eyebrow, inputClass, primaryButton } from "./ui";

const CONTENT_TYPES = [
  ["text", "Text"],
  ["tables", "Tables"],
  ["images", "Images"],
];

const PAGE_MODES = [
  ["page", "Current page"],
  ["all", "All pages"],
  ["range", "Page range"],
];

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
  const [contentType, setContentType] = useState("text");

  return (
    <section className={card}>
      <p className={eyebrow}>Extract</p>
      <h2 className="mt-1 text-2xl">What do you need?</h2>

      {showForm && (
        <>
          <p className="mt-1 text-sm text-muted">
            Pick where to extract from and what to pull out.
          </p>

          <div className="mt-5">
            <p className={`${eyebrow} mb-2`}>Area</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Extraction area">
              <button
                type="button"
                onClick={() => onScopeChange("document")}
                aria-pressed={scope === "document"}
                className={chip(scope === "document")}
              >
                Entire pages
              </button>
              <button
                type="button"
                onClick={() => onScopeChange("region")}
                aria-pressed={scope === "region"}
                className={chip(scope === "region")}
              >
                Selected region
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-subtle">
              {scope === "document"
                ? "Process all matching content on the chosen pages."
                : "Draw a rectangle on the current PDF page. The type is detected for you."}
            </p>
          </div>

          {scope === "document" && (
            <div className="mt-5">
              <p className={`${eyebrow} mb-2`}>Pages</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Pages to extract from">
                {PAGE_MODES.map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onRangeChange({ ...range, mode })}
                    aria-pressed={range.mode === mode}
                    className={chip(range.mode === mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {range.mode === "range" && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted">
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

          {scope === "document" && (
            <div className="mt-5">
              <p className={`${eyebrow} mb-2`}>Content</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Content type">
                {CONTENT_TYPES.map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setContentType(type)}
                    aria-pressed={contentType === type}
                    className={chip(contentType === type)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              disabled={disabled || isExtracting}
              onClick={() => onExtract(scope === "document" ? contentType : "smart")}
              className={`${primaryButton} w-full`}
            >
              {isExtracting
                ? "Extracting..."
                : scope === "document"
                  ? `Extract ${CONTENT_TYPES.find(([type]) => type === contentType)[1].toLowerCase()}`
                  : "Smart extract selection"}
            </button>

            {!hasDocument && (
              <p className="mt-3 text-xs text-warn">Upload a PDF to enable extraction.</p>
            )}
            {hasDocument && scope === "region" && !hasSelection && (
              <p className="mt-3 text-xs text-warn">
                Select a rectangular region on the PDF first.
              </p>
            )}
          </div>
        </>
      )}

      {message && (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-line bg-bg p-3 text-sm leading-5 text-fg-soft"
        >
          {message}
        </p>
      )}
    </section>
  );
}
