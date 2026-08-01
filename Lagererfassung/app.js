const STORAGE_KEY = "lagererfassung-items-v1";
const HISTORY_KEY = "lagererfassung-history-v1";

const starterItems = [
  {
    id: crypto.randomUUID(),
    name: "Spanplattenschraube 4,0 x 40 TX20",
    sku: "BFS-0040",
    code: "BFS-0040",
    category: "Befestigungsmittel",
    unit: "Stk",
    quantity: 850,
    minimum: 250,
    location: "Regal B1",
    supplier: "Wuerth",
    note: "Standard fuer Montagearbeiten"
  },
  {
    id: crypto.randomUUID(),
    name: "Holzlatte 30 x 50 mm",
    sku: "MAT-3050",
    code: "MAT-3050",
    category: "Material",
    unit: "m",
    quantity: 120,
    minimum: 40,
    location: "Langgutlager",
    supplier: "Holzhandel",
    note: "Trocken lagern"
  },
  {
    id: crypto.randomUUID(),
    name: "Fischer UX 8 Universalduebel",
    sku: "BFD-UX8",
    code: "BFD-UX8",
    category: "Befestigungsmittel",
    unit: "Pkg",
    quantity: 18,
    minimum: 20,
    location: "Regal B3",
    supplier: "Fischer",
    note: "100 Stk je Packung"
  }
];

let items = normalizeItems(load(STORAGE_KEY, starterItems));
let history = load(HISTORY_KEY, []);
let activeView = "inventory";
let scanner = {
  detector: null,
  stream: null,
  mode: null,
  running: false
};

const elements = {
  tabs: document.querySelectorAll(".nav-tab"),
  views: {
    inventory: document.querySelector("#inventoryView"),
    movement: document.querySelector("#movementView"),
    history: document.querySelector("#historyView")
  },
  searchInput: document.querySelector("#searchInput"),
  totalItems: document.querySelector("#totalItems"),
  lowItems: document.querySelector("#lowItems"),
  newItemBtn: document.querySelector("#newItemBtn"),
  scanSearchBtn: document.querySelector("#scanSearchBtn"),
  itemForm: document.querySelector("#itemForm"),
  scanItemCodeBtn: document.querySelector("#scanItemCodeBtn"),
  cancelItemBtn: document.querySelector("#cancelItemBtn"),
  inventoryTable: document.querySelector("#inventoryTable"),
  emptyState: document.querySelector("#emptyState"),
  movementForm: document.querySelector("#movementForm"),
  movementItem: document.querySelector("#movementItem"),
  scanMovementBtn: document.querySelector("#scanMovementBtn"),
  historyList: document.querySelector("#historyList"),
  clearHistoryBtn: document.querySelector("#clearHistoryBtn"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  importCsvInput: document.querySelector("#importCsvInput"),
  scannerDialog: document.querySelector("#scannerDialog"),
  scannerTitle: document.querySelector("#scannerTitle"),
  scannerVideo: document.querySelector("#scannerVideo"),
  scannerStatus: document.querySelector("#scannerStatus"),
  closeScannerBtn: document.querySelector("#closeScannerBtn"),
  manualCodeInput: document.querySelector("#manualCodeInput"),
  useManualCodeBtn: document.querySelector("#useManualCodeBtn")
};

const itemFields = {
  id: document.querySelector("#itemId"),
  name: document.querySelector("#itemName"),
  sku: document.querySelector("#itemSku"),
  code: document.querySelector("#itemCode"),
  category: document.querySelector("#itemCategory"),
  unit: document.querySelector("#itemUnit"),
  quantity: document.querySelector("#itemQuantity"),
  minimum: document.querySelector("#itemMinimum"),
  location: document.querySelector("#itemLocation"),
  supplier: document.querySelector("#itemSupplier"),
  note: document.querySelector("#itemNote")
};

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

elements.searchInput.addEventListener("input", renderInventory);
elements.newItemBtn.addEventListener("click", () => showItemForm());
elements.scanSearchBtn.addEventListener("click", () => openScanner("search"));
elements.scanItemCodeBtn.addEventListener("click", () => openScanner("item"));
elements.scanMovementBtn.addEventListener("click", () => openScanner("movement"));
elements.cancelItemBtn.addEventListener("click", hideItemForm);
elements.itemForm.addEventListener("submit", saveItem);
elements.movementForm.addEventListener("submit", saveMovement);
elements.clearHistoryBtn.addEventListener("click", clearHistory);
elements.exportCsvBtn.addEventListener("click", exportCsv);
elements.importCsvInput.addEventListener("change", importCsv);
elements.closeScannerBtn.addEventListener("click", closeScanner);
elements.useManualCodeBtn.addEventListener("click", () => applyScannedCode(elements.manualCodeInput.value.trim()));
elements.scannerDialog.addEventListener("close", stopScanner);

render();

function load(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeItems(rawItems) {
  return rawItems.map((item) => ({
    ...item,
    code: item.code || item.sku || item.id
  }));
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function setView(view) {
  activeView = view;
  elements.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  Object.entries(elements.views).forEach(([key, element]) => {
    element.classList.toggle("active", key === view);
  });
  render();
}

function render() {
  renderSummary();
  renderInventory();
  renderMovementOptions();
  renderHistory();
}

function renderSummary() {
  elements.totalItems.textContent = items.length;
  elements.lowItems.textContent = items.filter((item) => Number(item.quantity) < Number(item.minimum)).length;
}

function renderInventory() {
  const searchTerm = elements.searchInput.value.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    return [item.name, item.sku, item.code, item.category, item.location, item.supplier, item.note]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm);
  });

  elements.inventoryTable.innerHTML = "";
  elements.emptyState.classList.toggle("hidden", filteredItems.length > 0);

  filteredItems
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .forEach((item) => {
      const row = document.createElement("tr");
      const isLow = Number(item.quantity) < Number(item.minimum);
      row.innerHTML = `
        <td>
          <div class="item-title">${escapeHtml(item.name)}</div>
          <div class="item-sub">${escapeHtml(item.sku || "ohne Nummer")} · Code: ${escapeHtml(item.code || "-")}${item.note ? " · " + escapeHtml(item.note) : ""}</div>
        </td>
        <td>${escapeHtml(item.category)}</td>
        <td><span class="stock-pill ${isLow ? "stock-low" : "stock-ok"}">${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</span></td>
        <td>${formatNumber(item.minimum)} ${escapeHtml(item.unit)}</td>
        <td>${escapeHtml(item.location || "-")}</td>
        <td>${escapeHtml(item.supplier || "-")}</td>
        <td>
          <div class="row-actions">
            <button class="secondary" data-action="edit" data-id="${item.id}" type="button">Bearbeiten</button>
            <button class="secondary danger" data-action="delete" data-id="${item.id}" type="button">Loeschen</button>
          </div>
        </td>
      `;
      elements.inventoryTable.appendChild(row);
    });

  elements.inventoryTable.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "edit") editItem(button.dataset.id);
      if (button.dataset.action === "delete") deleteItem(button.dataset.id);
    });
  });
}

function renderMovementOptions() {
  elements.movementItem.innerHTML = "";

  if (items.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Bitte zuerst Artikel anlegen";
    option.value = "";
    elements.movementItem.appendChild(option);
    return;
  }

  items
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} (${formatNumber(item.quantity)} ${item.unit})`;
      elements.movementItem.appendChild(option);
    });
}

function renderHistory() {
  elements.historyList.innerHTML = "";

  if (history.length === 0) {
    elements.historyList.innerHTML = '<p class="empty-state">Noch keine Buchungen vorhanden.</p>';
    return;
  }

  history.slice(0, 60).forEach((entry) => {
    const row = document.createElement("article");
    row.className = "history-entry";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(entry.itemName)}</strong>
        <span>${escapeHtml(entry.reason || "ohne Grund")} · ${new Date(entry.date).toLocaleString("de-AT")}</span>
      </div>
      <strong>${entry.type === "in" ? "+" : "-"}${formatNumber(entry.quantity)} ${escapeHtml(entry.unit)}</strong>
    `;
    elements.historyList.appendChild(row);
  });
}

function showItemForm(item = null) {
  elements.itemForm.classList.remove("hidden");
  itemFields.id.value = item?.id || "";
  itemFields.name.value = item?.name || "";
  itemFields.sku.value = item?.sku || "";
  itemFields.code.value = item?.code || item?.sku || "";
  itemFields.category.value = item?.category || "Material";
  itemFields.unit.value = item?.unit || "Stk";
  itemFields.quantity.value = item?.quantity ?? 0;
  itemFields.minimum.value = item?.minimum ?? 0;
  itemFields.location.value = item?.location || "";
  itemFields.supplier.value = item?.supplier || "";
  itemFields.note.value = item?.note || "";
  itemFields.name.focus();
}

function hideItemForm() {
  elements.itemForm.classList.add("hidden");
  elements.itemForm.reset();
  itemFields.id.value = "";
}

function saveItem(event) {
  event.preventDefault();
  const id = itemFields.id.value || crypto.randomUUID();
  const item = {
    id,
    name: itemFields.name.value.trim(),
    sku: itemFields.sku.value.trim(),
    code: itemFields.code.value.trim() || itemFields.sku.value.trim() || id,
    category: itemFields.category.value,
    unit: itemFields.unit.value,
    quantity: Number(itemFields.quantity.value),
    minimum: Number(itemFields.minimum.value),
    location: itemFields.location.value.trim(),
    supplier: itemFields.supplier.value.trim(),
    note: itemFields.note.value.trim()
  };

  const existingIndex = items.findIndex((current) => current.id === id);
  if (existingIndex >= 0) {
    items[existingIndex] = item;
  } else {
    items.push(item);
  }

  persist();
  hideItemForm();
  render();
}

function editItem(id) {
  const item = items.find((current) => current.id === id);
  if (item) showItemForm(item);
}

function deleteItem(id) {
  const item = items.find((current) => current.id === id);
  if (!item || !confirm(`Artikel "${item.name}" wirklich loeschen?`)) return;

  items = items.filter((current) => current.id !== id);
  persist();
  render();
}

function saveMovement(event) {
  event.preventDefault();
  const item = items.find((current) => current.id === elements.movementItem.value);
  if (!item) return;

  const quantityInput = document.querySelector("#movementQuantity");
  const typeInput = document.querySelector("#movementType");
  const reasonInput = document.querySelector("#movementReason");
  const quantity = Number(quantityInput.value);
  const multiplier = typeInput.value === "in" ? 1 : -1;
  const nextQuantity = Number(item.quantity) + quantity * multiplier;

  if (nextQuantity < 0) {
    alert("Der Bestand kann nicht unter 0 gebucht werden.");
    return;
  }

  item.quantity = nextQuantity;
  history.unshift({
    id: crypto.randomUUID(),
    itemId: item.id,
    itemName: item.name,
    type: typeInput.value,
    quantity,
    unit: item.unit,
    reason: reasonInput.value.trim(),
    date: new Date().toISOString()
  });

  quantityInput.value = "";
  reasonInput.value = "";
  persist();
  render();
}

function clearHistory() {
  if (!history.length || !confirm("Den gesamten Buchungsverlauf loeschen?")) return;
  history = [];
  persist();
  renderHistory();
}

function exportCsv() {
  const header = ["Name", "Artikelnummer", "QR-/Barcode", "Kategorie", "Einheit", "Bestand", "Mindestbestand", "Lagerort", "Lieferant", "Notiz"];
  const rows = items.map((item) => [
    item.name,
    item.sku,
    item.code,
    item.category,
    item.unit,
    item.quantity,
    item.minimum,
    item.location,
    item.supplier,
    item.note
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lagerbestand-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
    const imported = lines.slice(1).map(parseCsvLine).filter((row) => row[0]).map((row) => ({
      id: crypto.randomUUID(),
      name: row[0] || "",
      sku: row[1] || "",
      code: row[2] || row[1] || crypto.randomUUID(),
      category: row[3] || "Material",
      unit: row[4] || "Stk",
      quantity: Number(String(row[5] || 0).replace(",", ".")),
      minimum: Number(String(row[6] || 0).replace(",", ".")),
      location: row[7] || "",
      supplier: row[8] || "",
      note: row[9] || ""
    }));

    if (imported.length) {
      items = imported;
      persist();
      render();
    }
    event.target.value = "";
  };
  reader.readAsText(file, "utf-8");
}

async function openScanner(mode) {
  scanner.mode = mode;
  elements.manualCodeInput.value = "";
  elements.scannerTitle.textContent = mode === "movement" ? "Artikel fuer Buchung scannen" : "Code scannen";
  elements.scannerStatus.textContent = "Kamera wird gestartet...";

  if (!("BarcodeDetector" in window)) {
    elements.scannerStatus.textContent = "Dein Browser unterstuetzt den Kamerascan hier nicht. Du kannst den Code manuell eingeben.";
    elements.scannerDialog.showModal();
    return;
  }

  try {
    scanner.detector = new BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "ean_8", "code_39"] });
    scanner.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    elements.scannerVideo.srcObject = scanner.stream;
    await elements.scannerVideo.play();
    scanner.running = true;
    elements.scannerDialog.showModal();
    elements.scannerStatus.textContent = "Code in den Rahmen halten.";
    scanFrame();
  } catch {
    elements.scannerDialog.showModal();
    elements.scannerStatus.textContent = "Kamera konnte nicht gestartet werden. Code bitte manuell eingeben.";
  }
}

async function scanFrame() {
  if (!scanner.running || !scanner.detector) return;

  try {
    const codes = await scanner.detector.detect(elements.scannerVideo);
    if (codes.length > 0) {
      applyScannedCode(codes[0].rawValue);
      return;
    }
  } catch {
    elements.scannerStatus.textContent = "Scanner sucht weiter...";
  }

  requestAnimationFrame(scanFrame);
}

function applyScannedCode(rawCode) {
  const code = rawCode.trim();
  if (!code) return;

  if (scanner.mode === "item") {
    itemFields.code.value = code;
  }

  if (scanner.mode === "search") {
    elements.searchInput.value = code;
    setView("inventory");
  }

  if (scanner.mode === "movement") {
    const item = findItemByCode(code);
    if (item) {
      elements.movementItem.value = item.id;
      setView("movement");
    } else {
      elements.scannerStatus.textContent = `Kein Artikel fuer Code "${code}" gefunden.`;
      elements.manualCodeInput.value = code;
      return;
    }
  }

  closeScanner();
  render();
}

function findItemByCode(code) {
  const normalizedCode = code.trim().toLowerCase();
  return items.find((item) => {
    return [item.code, item.sku, item.id].some((value) => String(value || "").trim().toLowerCase() === normalizedCode);
  });
}

function closeScanner() {
  stopScanner();
  if (elements.scannerDialog.open) elements.scannerDialog.close();
}

function stopScanner() {
  scanner.running = false;
  if (scanner.stream) {
    scanner.stream.getTracks().forEach((track) => track.stop());
  }
  scanner.stream = null;
  elements.scannerVideo.srcObject = null;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function formatNumber(value) {
  return Number(value).toLocaleString("de-AT", { maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
