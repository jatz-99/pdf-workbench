import { formatFileSize } from "../utils/exporters";
import { card, eyebrow } from "./ui";

export default function DocumentInfo({ file, numPages }) {
  return (
    <section className={card}>
      <p className={eyebrow}>Document</p>
      <h2 className="mt-1 text-2xl">Details</h2>

      {file ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-subtle">Filename</p>
            <p className="mt-1 break-all text-sm">{file.name}</p>
          </div>
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-xs text-subtle">Pages</p>
              <p className="mt-1 text-sm">{numPages ?? "Loading..."}</p>
            </div>
            <div>
              <p className="text-xs text-subtle">File size</p>
              <p className="mt-1 text-sm">{formatFileSize(file.size)}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-subtle">No document uploaded yet.</p>
      )}
    </section>
  );
}
