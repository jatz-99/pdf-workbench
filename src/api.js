const apiUrl = () => (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

const OFFLINE_MESSAGE =
  "Could not connect to the backend. Start FastAPI on port 8000 and try again.";

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${apiUrl()}${path}`, options);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 502 || response.status === 503) {
      if (!body?.detail) {
        throw new Error(
          "The FastAPI backend is not running. Start it on port 8000 and try again."
        );
      }
    }
    const detail = body?.detail;
    const message = typeof detail === "string" ? detail : detail?.message;
    const error = new Error(message ?? `Backend returned status ${response.status}.`);
    if (detail?.code) error.code = detail.code;
    throw error;
  }
  return response;
}

function json(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function fileForm(file, password) {
  const formData = new FormData();
  formData.append("file", file);
  if (password) formData.append("password", password);
  return { method: "POST", body: formData };
}

export async function uploadPdf(file, password) {
  const data = await (await request("/upload", fileForm(file, password))).json();
  if (!data.document_id) {
    throw new Error("The backend did not return a document ID.");
  }
  return data;
}

export async function fetchDocumentFile(documentId, name) {
  const response = await request(`/document/${documentId}/file`);
  const blob = await response.blob();
  return new File([blob], name, { type: "application/pdf" });
}

export function deleteDocument(documentId) {
  return request(`/document/${documentId}`, { method: "DELETE" }).catch(
    () => null
  );
}

export async function extract(payload, signal) {
  return (await request("/extract", { ...json(payload), signal })).json();
}

export async function editDocument(documentId, body) {
  return (await request(`/document/${documentId}/ops`, json(body))).json();
}

export async function mergeDocument(documentId, file) {
  return (
    await request(`/document/${documentId}/merge`, fileForm(file))
  ).json();
}

export async function exportXlsx(tables) {
  return (await request("/export/xlsx", json({ tables }))).blob();
}
