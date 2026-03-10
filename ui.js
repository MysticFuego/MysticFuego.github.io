import { saveProgress } from "./db.js";

/**
 * Renders the summary section showing total, collected, and favorite counts.
 * @param {HTMLElement} container - The DOM element to render the summary into.
 * @param {Array} entities - The static entity data.
 * @param {Array} mergedData - The merged entity and progress data.
 */
export function renderSummary(container, entities, mergedData) {
  const total = entities.length;
  const collected = mergedData.filter((x) => x.progress.collected).length;
  const favorites = mergedData.filter((x) => x.progress.favorite).length;

  container.innerHTML = `
    <strong>Total:</strong> ${total}
    &nbsp; | &nbsp;
    <strong>Collected:</strong> ${collected}
    &nbsp; | &nbsp;
    <strong>Favorites:</strong> ${favorites}
  `;
}

/**
 * Renders the list of entity cards with their progress controls.
 * @param {HTMLElement} container - The DOM element to render the list into.
 * @param {string} gameKey - The key of the game.
 * @param {Array} mergedData - The merged entity and progress data.
 * @param {function} refreshCallback - Callback function to refresh the UI after saving.
 */
export function renderEntityList(container, gameKey, mergedData, refreshCallback) {
  container.innerHTML = "";

  for (const item of mergedData) {
    const card = document.createElement("article");
    card.className = "card";

    const tagsHtml = (item.tags || [])
      .map(tag => `<span class="tag">${tag}</span>`)
      .join("");

    card.innerHTML = `
      <h3>${item.name}</h3>
      <div>${tagsHtml}</div>
      <p><strong>ID:</strong> ${item.id}</p>
      ${item.category ? `<p><strong>Category:</strong> ${item.category}</p>` : ""}
      ${item.description ? `<p>${item.description}</p>` : ""}

      <label>
        <input type="checkbox" class="collected-checkbox" ${item.progress.collected ? "checked" : ""}>
        Collected
      </label>

      <label>
        <input type="checkbox" class="favorite-checkbox" ${item.progress.favorite ? "checked" : ""}>
        Favorite
      </label>

      <label>
        Level:
        <input type="number" class="level-input" min="0" value="${item.progress.level}">
      </label>

      <label>
        Notes:
        <textarea class="notes-input">${item.progress.notes}</textarea>
      </label>

      <button class="save-btn">Save</button>
    `;

    const saveBtn = card.querySelector(".save-btn");
    const collectedCheckbox = card.querySelector(".collected-checkbox");
    const favoriteCheckbox = card.querySelector(".favorite-checkbox");
    const levelInput = card.querySelector(".level-input");
    const notesInput = card.querySelector(".notes-input");

    saveBtn.addEventListener("click", async () => {
      const record = {
        entityId: item.id,
        collected: collectedCheckbox.checked,
        favorite: favoriteCheckbox.checked,
        level: Number(levelInput.value) || 0,
        notes: notesInput.value.trim()
      };

      await saveProgress(gameKey, record);
      await refreshCallback();
    });

    container.appendChild(card);
  }
}