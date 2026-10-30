const NUMERIC = /^[+-]?\d+([.,]\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;

// Spreadsheets run cells starting with = + - @ as formulas; neutralise them
export function safeCell(value) {
  const text = String(value ?? "");
  return FORMULA_START.test(text) && !NUMERIC.test(text) ? `'${text}` : text;
}

export function tablesToCsv(tables) {
  return tables
    .flatMap((table) => [
      ...table.map((row) =>
        row.map((cell) => `"${safeCell(cell).replaceAll('"', '""')}"`).join(",")
      ),
      "",
    ])
    .join("\n");
}

export function tablesToTsv(tables) {
  return tables
    .map((table) =>
      table
        .map((row) =>
          row.map((cell) => String(cell ?? "").replace(/[\t\r\n]+/g, " ")).join("\t")
        )
        .join("\n")
    )
    .join("\n\n");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text, filename, type = "text/plain") {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
