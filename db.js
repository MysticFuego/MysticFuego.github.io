const DB_NAME = "dual_game_tracker_db";
const DB_VERSION = 1;

// Map game keys to their respective IndexedDB object store names
const STORE_NAMES = {
  MSM: "MSM_progress",
  Pocket: "Pocket_progress"
};

/**
 * Opens the IndexedDB database and handles schema upgrades.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
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

/**
 * Helper function to execute a transaction on a specific object store.
 * @param {string} gameKey - The key of the game (e.g., "MSM", "Pocket").
 * @param {string} mode - The transaction mode ("readonly" or "readwrite").
 * @param {function} callback - The function to execute with the store.
 * @returns {Promise<any>} A promise that resolves with the result of the callback.
 */
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

/**
 * Retrieves all progress records for a specific game.
 * @param {string} gameKey - The key of the game.
 * @returns {Promise<Array>} A promise that resolves with an array of progress records.
 */
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

/**
 * Retrieves a specific progress record by its entity ID.
 * @param {string} gameKey - The key of the game.
 * @param {string} entityId - The ID of the entity.
 * @returns {Promise<Object|null>} A promise that resolves with the progress record or null.
 */
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

/**
 * Saves a single progress record to the database.
 * @param {string} gameKey - The key of the game.
 * @param {Object} record - The progress record to save.
 * @returns {Promise<boolean>} A promise that resolves to true on success.
 */
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

/**
 * Imports multiple progress records into the database at once.
 * @param {string} gameKey - The key of the game.
 * @param {Array} records - An array of progress records to import.
 * @returns {Promise<boolean>} A promise that resolves to true on success.
 */
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

/**
 * Clears all progress records for a specific game.
 * @param {string} gameKey - The key of the game.
 * @returns {Promise<boolean>} A promise that resolves to true on success.
 */
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