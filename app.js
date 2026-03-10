import {
  getAllProgress,
  bulkImportProgress,
  clearProgress
} from "./db.js";

import {
  renderSummary,
  renderEntityList
} from "./ui.js";

const gameSelect = document.getElementById("gameSelect");
const searchInput = document.getElementById("searchInput");
const entityList = document.getElementById("entityList");
const summary = document.getElementById("summary");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const resetBtn = document.getElementById("resetBtn");

// Cache to store loaded game data so we don't fetch it multiple times
const gameDataCache = {};

/**
 * Loads entity data for a specific game from the JSON file.
 * Uses a cache to avoid redundant network requests.
 * @param {string} gameKey - The key of the game (e.g., "MSM", "Pocket").
 * @returns {Promise<Array>} A promise that resolves with the entity data.
 */
async function loadGameData(gameKey) {
  if (gameDataCache[gameKey]) return gameDataCache[gameKey];

  const response = await fetch(`./data/${gameKey}/entities.json`);
  if (!response.ok) {
    throw new Error(`Failed to load data for ${gameKey}`);
  }

  const data = await response.json();
  gameDataCache[gameKey] = data;
  return data;
}

/**
 * Merges static entity data with user progress records.
 * @param {Array} entities - The static entity data.
 * @param {Array} progressRecords - The user's progress records.
 * @returns {Array} An array of merged entity objects.
 */
function mergeEntitiesWithProgress(entities, progressRecords) {
  const progressMap = new Map(progressRecords.map(p => [p.entityId, p]));

  return entities.map(entity => ({
    ...entity,
    progress: progressMap.get(entity.id) || {
      entityId: entity.id,
      collected: false,
      favorite: false,
      level: 0,
      notes: ""
    }
  }));
}

/**
 * Refreshes the UI by loading data, merging progress, filtering, and rendering.
 */
async function refresh() {
  const gameKey = gameSelect.value;
  const searchTerm = searchInput.value.trim().toLowerCase();

  const entities = await loadGameData(gameKey);
  const progress = await getAllProgress(gameKey);

  let merged = mergeEntitiesWithProgress(entities, progress);

  if (searchTerm) {
    merged = merged.filter(item =>
      item.name.toLowerCase().includes(searchTerm) ||
      item.id.toLowerCase().includes(searchTerm) ||
      (item.category && item.category.toLowerCase().includes(searchTerm)) ||
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
    );
  }

  renderSummary(summary, entities, mergeEntitiesWithProgress(entities, progress));
  renderEntityList(entityList, gameKey, merged, refresh);
}

/**
 * Triggers a download of a JSON file with the provided data.
 * @param {string} filename - The name of the file to download.
 * @param {Object} data - The data to serialize as JSON.
 */
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

// Event listener for exporting the current game's save data
exportBtn.addEventListener("click", async () => {
  const gameKey = gameSelect.value;
  const progress = await getAllProgress(gameKey);

  const exportData = {
    game: gameKey,
    exportedAt: new Date().toISOString(),
    progress
  };

  downloadJson(`${gameKey}_save.json`, exportData);
});

// Event listener for triggering the file input when the import button is clicked
importBtn.addEventListener("click", () => {
  importFile.click();
});

// Event listener for handling the selected import file
importFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.game || !Array.isArray(data.progress)) {
      throw new Error("Invalid save file format.");
    }

    if (data.game !== gameSelect.value) {
      throw new Error("This save file is for a different game.");
    }

    await bulkImportProgress(data.game, data.progress);
    await refresh();
    alert("Save imported.");
  } catch (error) {
    console.error(error);
    alert(`Import failed: ${error.message}`);
  } finally {
    importFile.value = "";
  }
});

// Event listener for resetting the current game's save data
resetBtn.addEventListener("click", async () => {
  const gameKey = gameSelect.value;
  const confirmed = confirm(`Delete all local progress for ${gameKey}?`);

  if (!confirmed) return;

  await clearProgress(gameKey);
  await refresh();
});

gameSelect.addEventListener("change", refresh);
searchInput.addEventListener("input", refresh);

refresh().catch(error => {
  console.error(error);
  entityList.innerHTML = `<p>Failed to load app data.</p>`;
});