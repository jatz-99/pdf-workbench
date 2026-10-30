import { formatFileSize } from "../utils/exporters";
import { card } from "./ui";

export default function DocumentInfo({ file, numPages }) {
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Document Information</h2>

      {file ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-slate-500">Filename</p>
            <p className="mt-1 break-all text-sm">{file.name}</p>
          </div>
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">Pages</p>
              <p className="mt-1 text-sm">{numPages ?? "Loading..."}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">File size</p>
              <p className="mt-1 text-sm">{formatFileSize(file.size)}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No document uploaded yet.</p>
      )}
    </section>
  );
}
