// Keeps a copy of the open PDF in the browser (IndexedDB) so a reload can restore it
// even when the server has already deleted its copy (e.g. a free host that restarts).
const DB_NAME = "pdf-workbench";
const STORE = "files";
const KEY = "current";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function saveFile(file) {
  try {
    await withStore("readwrite", (store) => store.put(file, KEY));
  } catch {
    // Storage unavailable or full: the reload fallback just won't be there
  }
}

export async function loadFile() {
  try {
    const stored = await withStore("readonly", (store) => store.get(KEY));
    return stored instanceof Blob ? stored : null;
  } catch {
    return null;
  }
}

export async function clearFile() {
  try {
    await withStore("readwrite", (store) => store.delete(KEY));
  } catch {
    // nothing to clear
  }
}
