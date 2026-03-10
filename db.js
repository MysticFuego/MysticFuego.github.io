const DB_NAME = "dual_game_tracker_db";
const DB_VERSION = 1;

const STORE_NAMES = {
  game1: "game1_progress",
  game2: "game2_progress"
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      for (const storeName of Object.values(STORE_NAMES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: "entityId" });
          store.createIndex("collected", "collected", { unique: false });
          store.createIndex("favorite", "favorite", { unique: false });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(gameKey, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES[gameKey], mode);
    const store = tx.objectStore(STORE_NAMES[gameKey]);
    const result = callback(store);

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllProgress(gameKey) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES[gameKey], "readonly");
    const store = tx.objectStore(STORE_NAMES[gameKey]);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getProgressById(gameKey, entityId) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES[gameKey], "readonly");
    const store = tx.objectStore(STORE_NAMES[gameKey]);
    const request = store.get(entityId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProgress(gameKey, record) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES[gameKey], "readwrite");
    const store = tx.objectStore(STORE_NAMES[gameKey]);
    store.put(record);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function bulkImportProgress(gameKey, records) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES[gameKey], "readwrite");
    const store = tx.objectStore(STORE_NAMES[gameKey]);

    for (const record of records) {
      store.put(record);
    }

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearProgress(gameKey) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES[gameKey], "readwrite");
    const store = tx.objectStore(STORE_NAMES[gameKey]);
    store.clear();

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}