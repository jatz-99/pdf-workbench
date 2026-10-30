import { useState } from "react";
import {
  copyToClipboard,
  downloadBlob,
  downloadDataUrl,
  downloadText,
  tablesToCsv,
  tablesToTsv,
} from "../utils/exporters";
import { exportXlsx } from "../api";
import { card, secondaryButton, smallButton } from "./ui";

export default function ResultPanel({ result, onClear }) {
  const [status, setStatus] = useState("");

  async function copy(text) {
    setStatus((await copyToClipboard(text)) ? "Copied to clipboard." : "Copy failed.");
  }

  async function downloadXlsx() {
    try {
      downloadBlob(await exportXlsx(result.data), "extracted-tables.xlsx");
    } catch (error) {
      setStatus(error.message);
    }
  }

  const imageName = (dataUrl, index) =>
    `extracted-image-${index + 1}.${dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png"}`;

  function downloadAllImages() {
    // Stagger the clicks so browsers don't drop back-to-back downloads
    result.data.forEach((image, index) => {
      setTimeout(() => downloadDataUrl(image, imageName(image, index)), index * 250);
    });
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Extraction Result</h2>

      {result.detected_type === "text" && (
        <>
          {result.ocr && (
            <p className="mt-3 text-xs text-amber-300">
              This page is a scan, so the text was recognised with OCR and may contain mistakes.
            </p>
          )}
          {result.scanned && (
            <p className="mt-3 text-xs text-amber-300">
              {result.ocr_available
                ? "This area looks like a scanned image and OCR was skipped."
                : "This area looks like a scanned image, but OCR is not installed on the server (Tesseract is required)."}
            </p>
          )}
          <textarea
            readOnly
            value={result.data}
            aria-label="Extracted text"
            className="mt-4 min-h-48 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm leading-6 text-slate-200 outline-none"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(result.data)}
              disabled={!result.data}
              className={secondaryButton}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => downloadText(result.data, "extracted-text.txt")}
              disabled={!result.data}
              className={secondaryButton}
            >
              Download Text
            </button>
          </div>
        </>
      )}

      {result.detected_type === "table" && (
        <>
          <div className="mt-4 space-y-4 overflow-auto">
            {result.data.map((table, tableIndex) => (
              <div key={tableIndex}>
                {result.pages?.[tableIndex] && result.pages.length > 1 && (
                  <p className="mb-1 text-xs text-slate-500">Page {result.pages[tableIndex]}</p>
                )}
                <table className="w-full border-collapse text-left text-sm">
                  <tbody>
                    {table.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="border border-slate-700 px-3 py-2">
                            {cell ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          {result.data.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => copy(tablesToTsv(result.data))} className={secondaryButton}>
                Copy
              </button>
              <button
                type="button"
                onClick={() => downloadText(tablesToCsv(result.data), "extracted-table.csv", "text/csv")}
                className={secondaryButton}
              >
                CSV
              </button>
              <button type="button" onClick={downloadXlsx} className={secondaryButton}>
                Excel
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadText(
                    JSON.stringify(result.data, null, 2),
                    "extracted-tables.json",
                    "application/json"
                  )
                }
                className={secondaryButton}
              >
                JSON
              </button>
            </div>
          )}
        </>
      )}

      {result.detected_type === "image" && (
        <>
          <div className="mt-4 grid gap-4">
            {result.data.map((image, index) => (
              <div key={index}>
                {result.pages?.length > 1 && (
                  <p className="mb-1 text-xs text-slate-500">Page {result.pages[index]}</p>
                )}
                <img
                  src={image}
                  alt={`Extracted image ${index + 1}`}
                  className="max-h-96 max-w-full rounded-lg object-contain"
                />
                <button
                  type="button"
                  onClick={() => downloadDataUrl(image, imageName(image, index))}
                  className={`${smallButton} mt-2`}
                >
                  Download Image {index + 1}
                </button>
              </div>
            ))}
          </div>
          {result.data.length > 1 && (
            <button type="button" onClick={downloadAllImages} className={`${secondaryButton} mt-4`}>
              Download All Images
            </button>
          )}
        </>
      )}

      {status && (
        <p role="status" className="mt-3 text-xs text-slate-400">
          {status}
        </p>
      )}

      <button type="button" onClick={onClear} className={`${secondaryButton} mt-4`}>
        Choose Another Extraction
      </button>
    </section>
  );
}

export function HistoryPanel({ history, activeId, onSelect }) {
  if (history.length < 2) return null;
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">History</h2>
      <ul className="mt-3 space-y-1">
        {history.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry)}
              aria-current={entry.id === activeId ? "true" : undefined}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-700 ${
                entry.id === activeId ? "bg-slate-700 text-blue-300" : "text-slate-300"
              }`}
            >
              {entry.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
