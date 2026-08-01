const STORAGE_KEY = "lagererfassung-items-v1";
const HISTORY_KEY = "lagererfassung-history-v1";
const WOOD_STORAGE_KEY = "lagererfassung-wood-v1";
const DEFAULT_IMPORT_FILE = "lagerartikel_import_rechnungen_2026-07-10.csv";
const CATALOG_IMPORT_FILE = "artikelkatalog_preisliste_2026-07-10.csv";
const WOOD_CATALOG_IMPORT_FILE = "holzkatalog_preislisten.csv";
const STARTER_SKUS = new Set(["BFS-0040", "MAT-3050", "BFD-UX8"]);
const currentRole = resolveCurrentRole();
const canSeePrices = ["admin", "teamleiter"].includes(currentRole);
const WOOD_SUBGROUPS = {
  Kantholz: ["Schalung", "Latten", "Kantholz Rauh", "KVH"],
  BSH: ["SI", "IQ"],
  Platten: ["3-Schicht", "OSB", "Agepan", "Schaltafel"],
  Daemmungen: ["Pavatex"],
  Hobelware: ["Fase (N+F)", "Raute", "Glattkant", "Latten gehobelt"],
  Sonstiges: ["Sonstiges"]
};

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

const starterWoodItems = [
  {
    id: crypto.randomUUID(),
    species: "Fichte",
    group: "Kantholz",
    subgroup: "KVH",
    name: "KVH",
    quality: "C24",
    thickness: "60",
    width: "120",
    length: "5000",
    pieces: 18,
    minimum: 8,
    unit: "Stk",
    supplier: "Holzhandel",
    note: "Vorschau fuer Konstruktionsholz"
  },
  {
    id: crypto.randomUUID(),
    species: "Fichte",
    group: "Kantholz",
    subgroup: "Latten",
    name: "Latte",
    quality: "rau",
    thickness: "30",
    width: "50",
    length: "4000",
    pieces: 42,
    minimum: 20,
    unit: "Stk",
    supplier: "Holzhandel",
    note: "Dachlatten / Unterkonstruktion"
  },
  {
    id: crypto.randomUUID(),
    species: "Fichte",
    group: "Kantholz",
    subgroup: "Schalung",
    name: "Schalung",
    quality: "Fichte",
    thickness: "24",
    width: "140",
    length: "4000",
    pieces: 65,
    minimum: 25,
    unit: "Stk",
    supplier: "Saegewerk",
    note: "Bretterbestand"
  },
  {
    id: crypto.randomUUID(),
    species: "Fichte",
    group: "BSH",
    subgroup: "SI",
    name: "BSH SI",
    quality: "SI",
    thickness: "120",
    width: "240",
    length: "6000",
    pieces: 0,
    minimum: 0,
    unit: "Stk",
    supplier: "Holzhandel",
    listed: false,
    note: "Hintergrundartikel"
  },
  {
    id: crypto.randomUUID(),
    species: "Fichte",
    group: "Platten",
    subgroup: "OSB",
    name: "OSB Platte",
    quality: "",
    thickness: "22",
    width: "1250",
    length: "2500",
    pieces: 0,
    minimum: 0,
    unit: "Stk",
    supplier: "Holzhandel",
    listed: false,
    note: "Hintergrundartikel"
  },
  {
    id: crypto.randomUUID(),
    species: "Fichte",
    group: "Daemmungen",
    subgroup: "Pavatex",
    name: "Pavatex Holzfaserdaemmung",
    quality: "",
    thickness: "60",
    width: "580",
    length: "1020",
    pieces: 0,
    minimum: 0,
    unit: "Stk",
    supplier: "Pavatex",
    listed: false,
    note: "Hintergrundartikel"
  }
];

let items = normalizeItems(load(STORAGE_KEY, starterItems));
let woodItems = mergeMissingWoodTemplates(normalizeWoodItems(load(WOOD_STORAGE_KEY, starterWoodItems)));
let history = load(HISTORY_KEY, []);
let activeView = "inventory";
let quickFilter = "all";
let woodQuickFilter = "all";
let woodSortDirection = "asc";
let showBackgroundItems = false;
let showBackgroundWoodItems = false;
let screwFilters = {
  thread: "all",
  head: "all",
  diameter: "all",
  length: "all"
};
let catalogPriceIndex = new Map();
let catalogPriceIndexPromise = null;
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
    wood: document.querySelector("#woodView"),
    movement: document.querySelector("#movementView"),
    history: document.querySelector("#historyView")
  },
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  subcategoryFilter: document.querySelector("#subcategoryFilter"),
  diameterFilter: document.querySelector("#diameterFilter"),
  lengthFilter: document.querySelector("#lengthFilter"),
  supplierFilter: document.querySelector("#supplierFilter"),
  unitFilter: document.querySelector("#unitFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  visibleItems: document.querySelector("#visibleItems"),
  showBackgroundItems: document.querySelector("#showBackgroundItems"),
  resetFiltersBtn: document.querySelector("#resetFiltersBtn"),
  quickFilters: document.querySelectorAll(".quick-filter"),
  subFilters: document.querySelectorAll(".sub-filter"),
  screwFilterPanel: document.querySelector("#screwFilterPanel"),
  screwDiameterButtons: document.querySelector("#screwDiameterButtons"),
  screwLengthButtons: document.querySelector("#screwLengthButtons"),
  totalItems: document.querySelector("#totalItems"),
  lowItems: document.querySelector("#lowItems"),
  newItemBtn: document.querySelector("#newItemBtn"),
  scanSearchBtn: document.querySelector("#scanSearchBtn"),
  resetInventoryBtn: document.querySelector("#resetInventoryBtn"),
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
  qrLabelsBtn: document.querySelector("#qrLabelsBtn"),
  qrLabelsDialog: document.querySelector("#qrLabelsDialog"),
  closeQrLabelsBtn: document.querySelector("#closeQrLabelsBtn"),
  printQrLabelsBtn: document.querySelector("#printQrLabelsBtn"),
  qrLabelScope: document.querySelector("#qrLabelScope"),
  qrLabelsGrid: document.querySelector("#qrLabelsGrid"),
  importCatalogBtn: document.querySelector("#importCatalogBtn"),
  importCsvInput: document.querySelector("#importCsvInput"),
  scannerDialog: document.querySelector("#scannerDialog"),
  scannerTitle: document.querySelector("#scannerTitle"),
  scannerVideo: document.querySelector("#scannerVideo"),
  scannerStatus: document.querySelector("#scannerStatus"),
  closeScannerBtn: document.querySelector("#closeScannerBtn"),
  manualCodeInput: document.querySelector("#manualCodeInput"),
  useManualCodeBtn: document.querySelector("#useManualCodeBtn"),
  correctionDialog: document.querySelector("#correctionDialog"),
  correctionForm: document.querySelector("#correctionForm"),
  correctionTitle: document.querySelector("#correctionTitle"),
  correctionItemId: document.querySelector("#correctionItemId"),
  correctionCurrent: document.querySelector("#correctionCurrent"),
  correctionDifference: document.querySelector("#correctionDifference"),
  correctionQuantity: document.querySelector("#correctionQuantity"),
  correctionReason: document.querySelector("#correctionReason"),
  correctionNote: document.querySelector("#correctionNote"),
  cancelCorrectionBtn: document.querySelector("#cancelCorrectionBtn"),
  cancelCorrectionBtnBottom: document.querySelector("#cancelCorrectionBtnBottom"),
  newWoodBtn: document.querySelector("#newWoodBtn"),
  woodForm: document.querySelector("#woodForm"),
  woodTable: document.querySelector("#woodTable"),
  woodEmptyState: document.querySelector("#woodEmptyState"),
  visibleWoodItems: document.querySelector("#visibleWoodItems"),
  showBackgroundWoodItems: document.querySelector("#showBackgroundWoodItems"),
  woodSpeciesFilter: document.querySelector("#woodSpeciesFilter"),
  woodGroupFilter: document.querySelector("#woodGroupFilter"),
  woodSubgroupFilter: document.querySelector("#woodSubgroupFilter"),
  woodThicknessFilter: document.querySelector("#woodThicknessFilter"),
  woodWidthFilter: document.querySelector("#woodWidthFilter"),
  woodLengthFilter: document.querySelector("#woodLengthFilter"),
  woodSupplierFilter: document.querySelector("#woodSupplierFilter"),
  woodSortSelect: document.querySelector("#woodSortSelect"),
  woodGuidedFilters: document.querySelector("#woodGuidedFilters"),
  resetWoodFiltersBtn: document.querySelector("#resetWoodFiltersBtn"),
  woodQuickFilters: document.querySelectorAll(".wood-quick-filter"),
  totalWoodItems: document.querySelector("#totalWoodItems"),
  lowWoodItems: document.querySelector("#lowWoodItems"),
  woodVolumeTotal: document.querySelector("#woodVolumeTotal"),
  cancelWoodBtn: document.querySelector("#cancelWoodBtn")
};

const itemFields = {
  id: document.querySelector("#itemId"),
  name: document.querySelector("#itemName"),
  shortCode: document.querySelector("#itemShortCode"),
  sku: document.querySelector("#itemSku"),
  code: document.querySelector("#itemCode"),
  category: document.querySelector("#itemCategory"),
  subcategory: document.querySelector("#itemSubcategory"),
  unit: document.querySelector("#itemUnit"),
  diameter: document.querySelector("#itemDiameter"),
  length: document.querySelector("#itemLength"),
  quantity: document.querySelector("#itemQuantity"),
  minimum: document.querySelector("#itemMinimum"),
  listPrice: document.querySelector("#itemListPrice"),
  purchasePrice: document.querySelector("#itemPurchasePrice"),
  discount: document.querySelector("#itemDiscount"),
  location: document.querySelector("#itemLocation"),
  supplier: document.querySelector("#itemSupplier"),
  listed: document.querySelector("#itemListed"),
  note: document.querySelector("#itemNote")
};

const woodFields = {
  id: document.querySelector("#woodId"),
  species: document.querySelector("#woodSpecies"),
  group: document.querySelector("#woodGroup"),
  subgroup: document.querySelector("#woodSubgroup"),
  name: document.querySelector("#woodName"),
  quality: document.querySelector("#woodQuality"),
  thickness: document.querySelector("#woodThickness"),
  width: document.querySelector("#woodWidth"),
  length: document.querySelector("#woodLength"),
  pieces: document.querySelector("#woodPieces"),
  minimum: document.querySelector("#woodMinimum"),
  unit: document.querySelector("#woodUnit"),
  supplier: document.querySelector("#woodSupplier"),
  note: document.querySelector("#woodNote")
};

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

elements.searchInput.addEventListener("input", renderInventory);
elements.categoryFilter.addEventListener("change", renderInventory);
elements.subcategoryFilter.addEventListener("change", renderInventory);
elements.diameterFilter.addEventListener("change", renderInventory);
elements.lengthFilter.addEventListener("change", renderInventory);
elements.supplierFilter.addEventListener("change", renderInventory);
elements.unitFilter.addEventListener("change", renderInventory);
elements.sortSelect.addEventListener("change", renderInventory);
elements.showBackgroundItems.addEventListener("change", () => {
  showBackgroundItems = elements.showBackgroundItems.checked;
  renderFilterOptions();
  renderScrewFilterButtons();
  renderInventory();
});
elements.resetFiltersBtn.addEventListener("click", resetFilters);
elements.quickFilters.forEach((button) => {
  button.addEventListener("click", () => {
    quickFilter = button.dataset.quickFilter;
    elements.quickFilters.forEach((item) => item.classList.toggle("active", item === button));
    elements.subFilters.forEach((item) => item.classList.remove("active"));
    if (quickFilter !== "schrauben") {
      elements.subcategoryFilter.value = "all";
      screwFilters = { thread: "all", head: "all", diameter: "all", length: "all" };
      renderScrewFilterButtons();
    }
    renderInventory();
  });
});
elements.screwFilterPanel.addEventListener("click", (event) => {
  const button = event.target.closest(".screw-filter");
  if (!button) return;

  quickFilter = "schrauben";
  elements.quickFilters.forEach((item) => item.classList.toggle("active", item.dataset.quickFilter === "schrauben"));
  elements.subFilters.forEach((item) => item.classList.remove("active"));
  elements.subcategoryFilter.value = "all";
  setScrewFilter(button.dataset.screwFilter, button.dataset.screwValue);
});
elements.subFilters.forEach((button) => {
  button.addEventListener("click", () => {
    quickFilter = "schrauben";
    elements.quickFilters.forEach((item) => item.classList.toggle("active", item.dataset.quickFilter === "schrauben"));
    elements.subFilters.forEach((item) => item.classList.toggle("active", item === button));
    elements.subcategoryFilter.value = button.dataset.subcategoryFilter;
    renderInventory();
  });
});
elements.newItemBtn.addEventListener("click", () => showItemForm());
elements.scanSearchBtn.addEventListener("click", () => openScanner("search"));
elements.scanItemCodeBtn.addEventListener("click", () => openScanner("item"));
elements.scanMovementBtn.addEventListener("click", () => openScanner("movement"));
elements.cancelItemBtn.addEventListener("click", hideItemForm);
elements.itemForm.addEventListener("submit", saveItem);
elements.movementForm.addEventListener("submit", saveMovement);
elements.clearHistoryBtn.addEventListener("click", clearHistory);
elements.exportCsvBtn.addEventListener("click", exportCsv);
elements.qrLabelsBtn.addEventListener("click", openQrLabelsDialog);
elements.closeQrLabelsBtn.addEventListener("click", () => elements.qrLabelsDialog.close());
elements.printQrLabelsBtn.addEventListener("click", () => window.print());
elements.qrLabelScope.addEventListener("change", renderQrLabels);
elements.resetInventoryBtn.addEventListener("click", () => rebuildInventoryFromInvoices());
elements.importCatalogBtn.addEventListener("click", loadCatalogItems);
elements.importCsvInput.addEventListener("change", importCsv);
elements.closeScannerBtn.addEventListener("click", closeScanner);
elements.useManualCodeBtn.addEventListener("click", () => applyScannedCode(elements.manualCodeInput.value.trim()));
elements.scannerDialog.addEventListener("close", stopScanner);
elements.correctionForm.addEventListener("submit", saveStockCorrection);
elements.correctionQuantity.addEventListener("input", updateCorrectionDifference);
elements.cancelCorrectionBtn.addEventListener("click", closeCorrectionDialog);
elements.cancelCorrectionBtnBottom.addEventListener("click", closeCorrectionDialog);
elements.newWoodBtn.addEventListener("click", () => showWoodForm());
elements.cancelWoodBtn.addEventListener("click", hideWoodForm);
elements.woodForm.addEventListener("submit", saveWoodItem);
elements.showBackgroundWoodItems.addEventListener("change", () => {
  showBackgroundWoodItems = elements.showBackgroundWoodItems.checked;
  renderWoodFilterOptions();
  renderWoodInventory();
});
[
  elements.woodSpeciesFilter,
  elements.woodGroupFilter,
  elements.woodSubgroupFilter,
  elements.woodThicknessFilter,
  elements.woodWidthFilter,
  elements.woodLengthFilter,
  elements.woodSupplierFilter
].forEach((select) => {
  select.addEventListener("change", () => {
    if (select === elements.woodGroupFilter) {
      woodQuickFilter = "all";
      elements.woodQuickFilters.forEach((button) => button.classList.toggle("active", button.dataset.woodQuickFilter === "all"));
      elements.woodSpeciesFilter.value = "all";
      elements.woodWidthFilter.value = "all";
      elements.woodThicknessFilter.value = "all";
    }
    if (select === elements.woodSpeciesFilter) {
      elements.woodWidthFilter.value = "all";
      elements.woodThicknessFilter.value = "all";
    }
    if (select === elements.woodWidthFilter) elements.woodThicknessFilter.value = "all";
    renderWoodFilterOptions();
    renderWoodInventory();
  });
});
elements.woodSortSelect.addEventListener("change", () => {
  woodSortDirection = "asc";
  renderWoodFilterOptions();
  renderWoodInventory();
});
elements.woodQuickFilters.forEach((button) => {
  button.addEventListener("click", () => {
    woodQuickFilter = button.dataset.woodQuickFilter;
    elements.woodGroupFilter.value = "all";
    elements.woodSpeciesFilter.value = "all";
    elements.woodWidthFilter.value = "all";
    elements.woodThicknessFilter.value = "all";
    elements.woodQuickFilters.forEach((item) => item.classList.toggle("active", item === button));
    renderWoodFilterOptions();
    renderWoodInventory();
  });
});
elements.woodGuidedFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-wood-filter-field]");
  if (!button) return;
  applyGuidedWoodFilter(button.dataset.woodFilterField, button.dataset.woodFilterValue);
});
elements.woodTable.closest("table").addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-wood-sort]");
  if (!trigger) return;
  setWoodSort(trigger.dataset.woodSort);
});
elements.woodTable.closest("table").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const trigger = event.target.closest("[data-wood-sort]");
  if (!trigger) return;
  event.preventDefault();
  setWoodSort(trigger.dataset.woodSort);
});
elements.resetWoodFiltersBtn.addEventListener("click", resetWoodFilters);
woodFields.group.addEventListener("change", () => updateWoodSubgroupOptions());
itemFields.sku.addEventListener("change", fillCurrentFormPricesFromCatalog);
itemFields.code.addEventListener("change", fillCurrentFormPricesFromCatalog);

applyPriceVisibility();
updateWoodSubgroupOptions();
render();
loadDefaultInvoiceItems();
hydrateExistingPrices();
loadWoodCatalogItems();

function resolveCurrentRole() {
  const urlRole = new URLSearchParams(window.location.search).get("role");
  const sessionRole = readSessionRole();
  return String(urlRole || sessionRole || "mitarbeiter").trim().toLowerCase();
}

function readSessionRole() {
  const sessionKeys = ["hbz_session_v1"];
  for (const storage of [sessionStorage, localStorage]) {
    for (const key of sessionKeys) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const session = JSON.parse(raw);
        return session?.role || session?.user?.role || "";
      } catch {
        // Keine gueltige Session, dann bleibt die Preisansicht gesperrt.
      }
    }
  }
  return "";
}

function applyPriceVisibility() {
  document.body.classList.toggle("hide-prices", !canSeePrices);
}

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
  return rawItems.map((item) => {
    const dimensions = detectDimensions(item);
    return {
      ...item,
      shortCode: item.shortCode || "",
      code: item.code || item.sku || item.id,
      subcategory: normalizeSubcategory(item.subcategory || detectSubcategory(item)),
      diameter: item.diameter || dimensions.diameter,
      length: item.length || dimensions.length,
      listed: Boolean(item.listed || item.isListed),
      listPrice: item.listPrice || "",
      purchasePrice: item.purchasePrice || "",
      discount: item.discount || "",
      note: cleanCatalogNote(item.note)
    };
  });
}

function normalizeWoodItems(rawWoodItems) {
  return rawWoodItems.map((item) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    sku: item.sku || "",
    species: item.species || detectWoodSpecies(item),
    group: normalizeWoodGroup(item.group || detectWoodGroup(item)),
    subgroup: normalizeWoodSubgroup(item.subgroup || detectWoodSubgroup(item), item.group || detectWoodGroup(item)),
    name: item.name || "",
    quality: item.quality || "",
    thickness: item.thickness || "",
    width: item.width || "",
    length: item.length || "",
    pieces: Number(item.pieces) || 0,
    minimum: Number(item.minimum) || 0,
    unit: item.unit || "Stk",
    supplier: item.supplier || "",
    purchasePrice: item.purchasePrice || "",
    priceUnit: item.priceUnit || "",
    listed: Boolean(item.listed || item.isListed),
    note: item.note || ""
  }));
}

function mergeMissingWoodTemplates(currentWoodItems) {
  const existingKeys = new Set(currentWoodItems.map(woodTemplateKey));
  const missingTemplates = normalizeWoodItems(starterWoodItems)
    .filter((item) => String(item.note || "").toLowerCase().includes("hintergrundartikel"))
    .filter((item) => !existingKeys.has(woodTemplateKey(item)));

  return [...currentWoodItems, ...missingTemplates];
}

function woodTemplateKey(item) {
  return [item.species, item.group, item.subgroup, item.name, item.thickness, item.width, item.length]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function rowsToWoodItems(rows) {
  return rows.filter((row) => row[0]).map((row) => ({
    id: crypto.randomUUID(),
    sku: row[0] || "",
    species: row[1] || "Fichte",
    group: normalizeWoodGroup(row[2] || "Sonstiges"),
    subgroup: row[3] || "Sonstiges",
    name: row[4] || "",
    quality: row[5] || "",
    thickness: row[6] || "",
    width: row[7] || "",
    length: row[8] || "",
    pieces: 0,
    minimum: 0,
    unit: row[9] || "Stk",
    supplier: row[10] || "",
    purchasePrice: row[11] || "",
    priceUnit: row[12] || "",
    listed: String(row[13] || "").toLowerCase() === "true",
    note: row[14] || "Hintergrundartikel aus Holzpreisliste"
  }));
}

async function loadWoodCatalogItems() {
  try {
    const response = await fetch(WOOD_CATALOG_IMPORT_FILE, { cache: "no-store" });
    if (!response.ok) return;

    const text = await response.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const catalogItems = normalizeWoodItems(rowsToWoodItems(lines.slice(1).map(parseCsvLine)));
    const changed = mergeWoodCatalogItems(catalogItems);
    if (changed > 0) {
      persist();
      renderWoodInventory();
    }
  } catch {
    // Holzpreislisten sind optional; ohne CSV bleibt die App normal nutzbar.
  }
}

function mergeWoodCatalogItems(catalogItems) {
  let changed = 0;
  const existingByKey = new Map(woodItems.map((item) => [woodCatalogKey(item), item]));
  const existingByIdentity = new Map(woodItems.map((item) => [woodCatalogIdentity(item), item]));

  catalogItems.forEach((catalogItem) => {
    const key = woodCatalogKey(catalogItem);
    const existing = existingByKey.get(key);
    if (existing) {
      Object.assign(existing, {
        sku: existing.sku || catalogItem.sku,
        supplier: existing.supplier || catalogItem.supplier,
        purchasePrice: existing.purchasePrice || catalogItem.purchasePrice,
        priceUnit: existing.priceUnit || catalogItem.priceUnit,
        note: existing.note || catalogItem.note
      });
      return;
    }

    const existingCatalogItem = existingByIdentity.get(woodCatalogIdentity(catalogItem));
    if (existingCatalogItem && canReplaceWoodCatalogItem(existingCatalogItem)) {
      Object.assign(existingCatalogItem, {
        sku: catalogItem.sku,
        species: catalogItem.species,
        group: catalogItem.group,
        subgroup: catalogItem.subgroup,
        name: catalogItem.name,
        quality: catalogItem.quality,
        thickness: catalogItem.thickness,
        width: catalogItem.width,
        length: catalogItem.length,
        unit: catalogItem.unit,
        supplier: catalogItem.supplier,
        purchasePrice: catalogItem.purchasePrice,
        priceUnit: catalogItem.priceUnit,
        note: catalogItem.note
      });
      existingByKey.set(key, existingCatalogItem);
      changed += 1;
      return;
    }

    woodItems.push(catalogItem);
    existingByKey.set(key, catalogItem);
    existingByIdentity.set(woodCatalogIdentity(catalogItem), catalogItem);
    changed += 1;
  });

  return changed;
}

function canReplaceWoodCatalogItem(item) {
  if (isListedWoodItem(item)) return false;
  if (Number(item.pieces) > 0 || Number(item.minimum) > 0) return false;
  return String(item.note || "").includes("Hintergrundartikel aus");
}

function woodCatalogKey(item) {
  return [
    item.sku,
    item.species,
    item.group,
    item.subgroup,
    item.name,
    item.thickness,
    item.width,
    item.length
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function woodCatalogIdentity(item) {
  return [
    item.sku,
    item.species,
    item.group,
    item.subgroup,
    item.name,
    item.quality
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function normalizeSubcategory(value) {
  return value === "Spanplattenschrauben" ? "Sonstiges" : value || "Sonstiges";
}

function normalizeWoodGroup(value) {
  if (value === "Bretter / Schalung") return "Kantholz";
  if (value === "Daemmung") return "Daemmungen";
  if (value === "Sonstiges Holz") return "Sonstiges";
  return value || "Sonstiges";
}

function normalizeWoodSubgroup(value, group) {
  const normalizedGroup = normalizeWoodGroup(group);
  const options = WOOD_SUBGROUPS[normalizedGroup] || WOOD_SUBGROUPS.Sonstiges;
  if (options.includes(value)) return value;
  if (normalizedGroup === "Kantholz" && group === "Bretter / Schalung") return "Schalung";
  return options[0];
}

function detectWoodGroup(item) {
  const text = `${item?.name || ""} ${item?.quality || ""} ${item?.note || ""}`.toLowerCase();
  if (["kvh", "bsh", "kantholz", "staffel", "latte", "pfette", "sparren", "konstruktionsholz"].some((term) => text.includes(term))) return "Kantholz";
  if (["schalung", "brett", "bretter", "diele"].some((term) => text.includes(term))) return "Bretter / Schalung";
  if (["platte", "osb", "pavatex", "sperrholz", "dreischicht"].some((term) => text.includes(term))) return "Platten";
  if (["daemmung", "dämmung", "holzfaser", "isolierung"].some((term) => text.includes(term))) return "Daemmung";
  return "Sonstiges Holz";
}

function detectWoodSpecies(item) {
  const text = `${item?.name || ""} ${item?.quality || ""} ${item?.note || ""}`.toLowerCase();
  if (text.includes("tanne")) return "Tanne";
  if (text.includes("laerche") || text.includes("lärche")) return "Laerche";
  if (text.includes("thermo")) return "Thermo";
  if (text.includes("fichte")) return "Fichte";
  return "Fichte";
}

function detectWoodGroup(item) {
  const text = `${item?.name || ""} ${item?.quality || ""} ${item?.note || ""}`.toLowerCase();
  if (["bsh", "si", "iq", "leimbinder", "brettschichtholz"].some((term) => text.includes(term))) return "BSH";
  if (["fase", "n+f", "raute", "glattkant", "gehobelt", "hobelware"].some((term) => text.includes(term))) return "Hobelware";
  if (["pavatex", "daemmung", "dämmung", "holzfaser", "isolierung"].some((term) => text.includes(term))) return "Daemmungen";
  if (["3-schicht", "dreischicht", "osb", "agepan", "schaltafel", "platte"].some((term) => text.includes(term))) return "Platten";
  if (["kvh", "kantholz", "staffel", "latte", "pfette", "sparren", "schalung", "brett", "bretter", "diele", "konstruktionsholz"].some((term) => text.includes(term))) return "Kantholz";
  return "Sonstiges";
}

function detectWoodSubgroup(item) {
  const text = `${item?.name || ""} ${item?.quality || ""} ${item?.note || ""}`.toLowerCase();
  const group = item?.group || detectWoodGroup(item);
  if (group === "Kantholz") {
    if (text.includes("schalung")) return "Schalung";
    if (text.includes("latte")) return "Latten";
    if (text.includes("kvh")) return "KVH";
    return "Kantholz Rauh";
  }
  if (group === "BSH") {
    if (text.includes("iq")) return "IQ";
    return "SI";
  }
  if (group === "Platten") {
    if (text.includes("3-schicht") || text.includes("dreischicht")) return "3-Schicht";
    if (text.includes("osb")) return "OSB";
    if (text.includes("agepan")) return "Agepan";
    if (text.includes("schaltafel")) return "Schaltafel";
  }
  if (group === "Daemmungen") return "Pavatex";
  if (group === "Hobelware") {
    if (text.includes("raute")) return "Raute";
    if (text.includes("glattkant")) return "Glattkant";
    if (text.includes("latte")) return "Latten gehobelt";
    return "Fase (N+F)";
  }
  return "Sonstiges";
}

function detectSubcategory(item) {
  const text = `${item.name || ""} ${item.sku || ""} ${item.category || ""}`.toLowerCase();

  if (text.includes("terrassenschraube")) return "Terrassenschrauben";
  if (text.includes("tellerkopf")) return "Holzbauschrauben Tellerkopf";
  if (text.includes("senkkopf")) return "Holzbauschrauben Senkkopf";
  if (text.includes("vollgewindeschraube")) return "Vollgewindeschrauben";
  if (text.includes("bauschraube")) return "Bauschrauben";
  if (text.includes("dämmplattenschraube") || text.includes("daemmplattenschraube")) return "Dämmplattenschrauben";
  if (text.includes("anker") || text.includes("betonschraube") || text.includes("blitzanker")) return "Anker / Betonschrauben";
  if (text.includes("nagel") || text.includes("klammer") || text.includes("coil")) return "Nägel / Klammern";
  if (text.includes("winkelverbinder") || text.includes("verbinder")) return "Verbinder / Winkel";
  if (text.includes("kleber") || text.includes("klebeband") || text.includes("klebt") || text.includes("dichtet") || text.includes("fullcontact")) return "Kleber / Bänder";
  if (text.includes("bahn") || text.includes("folie") || text.includes("plane") || text.includes("dampfsperre") || text.includes("dämmung") || text.includes("daemmung")) return "Bahnen / Folien";
  if (text.includes("kompressor") || text.includes("bohrfutter") || text.includes("ersatzteil")) return "Werkzeug / Ersatzteil";

  return "Sonstiges";
}

function detectDimensions(item) {
  const text = `${item.name || ""} ${item.sku || ""} ${item.subcategory || ""}`.toLowerCase();
  const isDimensionedFastener = ["schraube", "anker", "bolzen", "nagel"].some((term) => text.includes(term));

  if (!isDimensionedFastener) return { diameter: "", length: "" };

  const nameMatch = text.match(/(\d+(?:[,.]\d+)?)\s*x\s*(\d{2,4})(?!\s*x)/i);
  if (nameMatch) {
    return {
      diameter: normalizeDimensionNumber(nameMatch[1]),
      length: normalizeDimensionNumber(nameMatch[2])
    };
  }

  const sku = String(item.sku || "");
  const numberBlocks = sku.match(/\d+/g) || [];
  const code = numberBlocks[numberBlocks.length - 1] || "";
  const diameterFromName = text.match(/(^|[^\d-])(\d+(?:[,.]\d+)?)\s*mm\b/i);

  if (diameterFromName) {
    const diameter = normalizeDimensionNumber(diameterFromName[2]);
    const prefix = String(Math.round(Number(diameter.replace(",", ".")) * 10));
    if (diameter && code.startsWith(prefix) && code.length > prefix.length) {
      return {
        diameter,
        length: normalizeDimensionNumber(code.slice(prefix.length))
      };
    }
  }

  if (code.length >= 5) {
    const threeDigitDiameter = Number(code.slice(0, 3));
    if (threeDigitDiameter >= 40 && threeDigitDiameter <= 200) {
      return {
        diameter: normalizeDimensionNumber(String(threeDigitDiameter / 10)),
        length: normalizeDimensionNumber(code.slice(3))
      };
    }
  }

  if (code.length === 6 && code.startsWith("100")) {
    return { diameter: "10", length: normalizeDimensionNumber(code.slice(3)) };
  }

  if (code.length === 6 && code.startsWith("120")) {
    return { diameter: "12", length: normalizeDimensionNumber(code.slice(3)) };
  }

  if (code.length === 5) {
    return {
      diameter: normalizeDimensionNumber(String(Number(code.slice(0, 2)) / 10)),
      length: normalizeDimensionNumber(code.slice(2))
    };
  }

  if (code.length === 4) {
    return {
      diameter: normalizeDimensionNumber(String(Number(code.slice(0, 2)) / 10)),
      length: normalizeDimensionNumber(code.slice(2))
    };
  }

  return { diameter: "", length: "" };
}

function normalizeDimensionNumber(value) {
  const number = Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return "";
  return Number.isInteger(number) ? String(number) : String(number).replace(".", ",");
}

function cleanCatalogNote(value) {
  const text = String(value || "").trim();
  return /^Katalogseite\s+\d+$/i.test(text) ? "" : text;
}

function hasOnlyStarterItems() {
  return items.length <= starterItems.length && items.every((item) => STARTER_SKUS.has(item.sku));
}

function rowsToItems(rows) {
  return rows.filter((row) => row[0]).map((row) => {
    const shortCode = hasShortCodeColumn(row) ? row[0] || "" : "";
    if (shortCode) row = row.slice(1);
    const hasLegacyCatalogColumns = row.length >= 16;
    const hasModernInventoryColumns = row.length >= 12;
    const item = {
      id: crypto.randomUUID(),
      shortCode,
      name: row[0] || "",
      sku: row[1] || "",
      code: row[2] || row[1] || crypto.randomUUID(),
      category: row[3] || "Material",
      subcategory: hasModernInventoryColumns || hasLegacyCatalogColumns ? row[4] || "" : "",
      unit: hasModernInventoryColumns || hasLegacyCatalogColumns ? row[5] || "Stk" : row[4] || "Stk",
      diameter: hasModernInventoryColumns || hasLegacyCatalogColumns ? row[6] || "" : "",
      length: hasModernInventoryColumns || hasLegacyCatalogColumns ? row[7] || "" : "",
      quantity: Number(String((hasModernInventoryColumns || hasLegacyCatalogColumns ? row[8] : row[5]) || 0).replace(",", ".")),
      minimum: Number(String((hasModernInventoryColumns || hasLegacyCatalogColumns ? row[9] : row[6]) || 0).replace(",", ".")),
      location: hasLegacyCatalogColumns ? row[10] || "" : hasModernInventoryColumns ? "" : row[7] || "",
      supplier: hasLegacyCatalogColumns ? row[11] || "" : hasModernInventoryColumns ? row[10] || "" : row[8] || "",
      note: cleanCatalogNote(hasLegacyCatalogColumns ? row[12] || "" : hasModernInventoryColumns ? row[11] || "" : row[9] || ""),
      listPrice: hasLegacyCatalogColumns ? row[13] || "" : hasModernInventoryColumns ? row[12] || "" : "",
      purchasePrice: hasLegacyCatalogColumns ? row[14] || "" : hasModernInventoryColumns ? row[13] || "" : "",
      discount: hasLegacyCatalogColumns ? row[15] || "" : hasModernInventoryColumns ? row[14] || "" : ""
    };
    const dimensions = detectDimensions(item);

    return {
      ...item,
      subcategory: normalizeSubcategory(item.subcategory || detectSubcategory(item)),
      diameter: item.diameter || dimensions.diameter,
      length: item.length || dimensions.length
    };
  });
}

function hasShortCodeColumn(row) {
  return row.length >= 13 && ["Material", "Befestigungsmittel", "Werkzeug", "Verbrauchsmaterial"].includes(row[4]);
}

async function ensureCatalogPriceIndex() {
  if (catalogPriceIndex.size > 0) return catalogPriceIndex;
  if (catalogPriceIndexPromise) return catalogPriceIndexPromise;

  catalogPriceIndexPromise = (async () => {
    const response = await fetch(CATALOG_IMPORT_FILE, { cache: "no-store" });
    if (!response.ok) throw new Error("Katalogdatei nicht gefunden.");

    const text = await response.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const catalogItems = rowsToItems(lines.slice(1).map(parseCsvLine));
    catalogPriceIndex = new Map();
    catalogItems.forEach((catalogItem) => {
      const key = normalizeSkuKey(catalogItem.sku || catalogItem.code);
      if (!key) return;
      catalogPriceIndex.set(key, catalogItem);
    });
    return catalogPriceIndex;
  })();

  try {
    return await catalogPriceIndexPromise;
  } finally {
    catalogPriceIndexPromise = null;
  }
}

function normalizeSkuKey(value) {
  return String(value || "").trim().toLowerCase();
}

function applyCatalogPrices(item, catalogItem) {
  if (!item || !catalogItem) return false;
  let changed = false;

  ["listPrice", "purchasePrice", "discount"].forEach((field) => {
    if (!item[field] && catalogItem[field]) {
      item[field] = catalogItem[field];
      changed = true;
    }
  });

  return changed;
}

async function enrichPricesFromCatalog(targetItems = items) {
  try {
    const index = await ensureCatalogPriceIndex();
    let changed = 0;

    targetItems.forEach((item) => {
      const catalogItem = index.get(normalizeSkuKey(item.sku)) || index.get(normalizeSkuKey(item.code));
      if (applyCatalogPrices(item, catalogItem)) changed += 1;
    });

    return changed;
  } catch {
    return 0;
  }
}

async function hydrateExistingPrices() {
  const changed = await enrichPricesFromCatalog(items);
  if (changed > 0) {
    persist();
    render();
  }
}

async function fillCurrentFormPricesFromCatalog() {
  const sku = itemFields.sku.value.trim() || itemFields.code.value.trim();
  if (!sku) return;

  try {
    const index = await ensureCatalogPriceIndex();
    const catalogItem = index.get(normalizeSkuKey(sku));
    if (!catalogItem) return;

    if (!itemFields.listPrice.value && catalogItem.listPrice) itemFields.listPrice.value = catalogItem.listPrice;
    if (!itemFields.purchasePrice.value && catalogItem.purchasePrice) itemFields.purchasePrice.value = catalogItem.purchasePrice;
    if (!itemFields.discount.value && catalogItem.discount) itemFields.discount.value = catalogItem.discount;
  } catch {
    // Preise bleiben leer, wenn der Katalog lokal nicht geladen werden kann.
  }
}

async function loadDefaultInvoiceItems() {
  if (!hasOnlyStarterItems()) return;

  try {
    await loadInvoiceItems({ silent: true });
  } catch {
    // Die App bleibt auch ohne Importdatei nutzbar.
  }
}

async function loadInvoiceItems({ silent = false } = {}) {
  try {
    const response = await fetch(DEFAULT_IMPORT_FILE, { cache: "no-store" });
    if (!response.ok) throw new Error("Importdatei nicht gefunden.");

    const text = await response.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const imported = rowsToItems(lines.slice(1).map(parseCsvLine)).filter((item) => !isExcludedInventoryItem(item));
    await enrichPricesFromCatalog(imported);

    if (imported.length > 0) {
      items = imported;
      persist();
      render();
    }
    return imported.length;
  } catch (error) {
    if (!silent) alert(`Rechnungsartikel konnten nicht geladen werden: ${error.message}`);
    return 0;
  }
}

function isExcludedInventoryItem(item) {
  const text = [item.name, item.sku, item.subcategory, item.note].join(" ").toLowerCase();
  return (
    text.includes("spanplattenschrauben") ||
    text.includes("spanplattenschraube")
  );
}

async function rebuildInventoryFromInvoices() {
  const confirmed = confirm(
    "Soll die Artikelliste neu aus den Rechnungsartikeln aufgebaut werden? Der grosse Katalog und nicht benoetigte Artikel werden aus der aktiven Liste entfernt."
  );
  if (!confirmed) return;

  const count = await loadInvoiceItems();
  if (count > 0) {
    history.unshift({
      id: crypto.randomUUID(),
      itemId: "",
      itemName: "Artikelliste",
      type: "Korrektur",
      amount: count,
      note: "Liste aus Rechnungsartikeln neu aufgebaut",
      date: new Date().toISOString()
    });
    persist();
    render();
    alert(`Artikelliste neu aufgebaut: ${count} Artikel aktiv. Spanplattenschrauben wurden ausgelassen.`);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(WOOD_STORAGE_KEY, JSON.stringify(woodItems));
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
  renderWoodFilterOptions();
  renderWoodInventory();
  renderFilterOptions();
  renderScrewFilterButtons();
  renderInventory();
  renderMovementOptions();
  renderHistory();
}

function renderSummary() {
  const listedItems = getListedItems();
  elements.totalItems.textContent = listedItems.length;
  elements.lowItems.textContent = listedItems.filter((item) => Number(item.quantity) < Number(item.minimum)).length;
}

function renderInventory() {
  const searchTerm = elements.searchInput.value.trim().toLowerCase();
  const category = elements.categoryFilter.value;
  const subcategory = elements.subcategoryFilter.value;
  const diameter = elements.diameterFilter.value;
  const length = elements.lengthFilter.value;
  const supplier = elements.supplierFilter.value;
  const unit = elements.unitFilter.value;
  const filteredItems = getInventoryPool().filter((item) => {
    const haystack = [renderShortCode(item, true), item.name, item.sku, item.code, item.category, item.subcategory, item.diameter, item.length, item.supplier, item.note]
      .join(" ")
      .toLowerCase();
    return (
      haystack.includes(searchTerm) &&
      matchesFilter(item.category, category) &&
      matchesFilter(item.subcategory, subcategory) &&
      matchesFilter(item.diameter, diameter) &&
      matchesFilter(item.length, length) &&
      matchesFilter(item.supplier, supplier) &&
      matchesFilter(item.unit, unit) &&
      matchesQuickFilter(item, quickFilter) &&
      matchesScrewFilters(item)
    );
  });

  elements.inventoryTable.innerHTML = "";
  elements.visibleItems.textContent = filteredItems.length;
  elements.emptyState.classList.toggle("hidden", filteredItems.length > 0);

  filteredItems
    .sort(sortItems)
    .forEach((item) => {
      const row = document.createElement("tr");
      const isLow = Number(item.quantity) < Number(item.minimum);
      row.innerHTML = `
        <td>${renderShortCode(item)}</td>
        <td>${renderListedCheckbox(item)}</td>
        <td>
          <div class="item-title">${escapeHtml(renderItemTitle(item))}</div>
          <div class="item-sub">${escapeHtml(item.sku || "ohne Nummer")} · Code: ${escapeHtml(item.code || "-")}${item.note ? " · " + escapeHtml(item.note) : ""}</div>
        </td>
        <td>${escapeHtml(item.category)}</td>
        <td>${escapeHtml(item.subcategory || "Sonstiges")}</td>
        <td>${renderDimensions(item)}</td>
        <td><span class="stock-pill ${isLow ? "stock-low" : "stock-ok"}">${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</span></td>
        <td>${formatNumber(item.minimum)} ${escapeHtml(item.unit)}</td>
        <td class="price-only">${canSeePrices ? renderPrice(item) : ""}</td>
        <td>${escapeHtml(item.supplier || "-")}</td>
        <td>
          <div class="row-actions">
            <button class="secondary" data-action="correct" data-id="${item.id}" type="button">Korrigieren</button>
            <button class="secondary" data-action="edit" data-id="${item.id}" type="button">Bearbeiten</button>
            <button class="secondary danger" data-action="delete" data-id="${item.id}" type="button">Loeschen</button>
          </div>
        </td>
      `;
      elements.inventoryTable.appendChild(row);
    });

  elements.inventoryTable.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "correct") showCorrectionDialog(button.dataset.id);
      if (button.dataset.action === "edit") editItem(button.dataset.id);
      if (button.dataset.action === "delete") deleteItem(button.dataset.id);
    });
  });
  elements.inventoryTable.querySelectorAll("[data-action='toggle-listed']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => toggleItemListed(checkbox.dataset.id, checkbox.checked));
  });
}

function renderWoodInventory() {
  const visibleWoodItems = getFilteredWoodItems();
  const listedWoodItems = getListedWoodItems();
  applyWoodTableFilterVisibility();
  updateWoodSortIndicators();
  elements.totalWoodItems.textContent = listedWoodItems.length;
  elements.lowWoodItems.textContent = listedWoodItems.filter((item) => Number(item.pieces) < Number(item.minimum)).length;
  elements.woodVolumeTotal.textContent = formatNumber(listedWoodItems.reduce((sum, item) => sum + calculateWoodVolume(item), 0));
  elements.visibleWoodItems.textContent = visibleWoodItems.length;
  elements.woodTable.innerHTML = "";
  elements.woodEmptyState.classList.toggle("hidden", visibleWoodItems.length > 0);

  visibleWoodItems
    .slice()
    .sort(sortWoodItems)
    .forEach((item) => {
      const row = document.createElement("tr");
      const isLow = Number(item.pieces) < Number(item.minimum);
      row.innerHTML = `
        <td data-label="Holzart"><span class="wood-group">${escapeHtml(item.species || detectWoodSpecies(item))}</span></td>
        <td data-label="OG"><span class="wood-group">${escapeHtml(item.group || detectWoodGroup(item))}</span></td>
        <td data-label="UG">${escapeHtml(item.subgroup || detectWoodSubgroup(item))}</td>
        <td data-label="Holz">
          <div class="item-title">${escapeHtml(renderWoodTitle(item))}</div>
          <div class="item-sub">${renderWoodMeta(item)}</div>
        </td>
        <td data-label="Qualitaet">${escapeHtml(item.quality || "-")}</td>
        <td class="sortable-cell" data-label="Breite (cm)" data-wood-sort="width" role="button" tabindex="0">${renderWoodMeasure(item.width)}</td>
        <td class="sortable-cell" data-label="Hoehe (cm)" data-wood-sort="thickness" role="button" tabindex="0">${renderWoodMeasure(item.thickness)}</td>
        <td class="sortable-cell" data-label="Laenge (cm)" data-wood-sort="length" role="button" tabindex="0">${renderWoodMeasure(item.length)}</td>
        <td class="sortable-cell" data-label="Stueck" data-wood-sort="stock" role="button" tabindex="0"><span class="stock-pill ${isLow ? "stock-low" : "stock-ok"}">${formatNumber(item.pieces)} ${escapeHtml(item.unit)}</span></td>
        <td data-label="Mindestbestand">${formatNumber(item.minimum)} ${escapeHtml(item.unit)}</td>
        <td data-label="lfm">${formatNumber(calculateWoodLinearMeters(item))}</td>
        <td data-label="m3">${formatNumber(calculateWoodVolume(item))}</td>
        <td data-label="Lieferant">${escapeHtml(item.supplier || "-")}</td>
        <td data-label="Aktion">
          <div class="row-actions">
            <button class="secondary" data-wood-action="correct" data-id="${item.id}" type="button">Korrigieren</button>
            <button class="secondary" data-wood-action="edit" data-id="${item.id}" type="button">Bearbeiten</button>
            <button class="secondary danger" data-wood-action="delete" data-id="${item.id}" type="button">Loeschen</button>
          </div>
        </td>
      `;
      elements.woodTable.appendChild(row);
    });

  elements.woodTable.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.woodAction === "correct") correctWoodItem(button.dataset.id);
      if (button.dataset.woodAction === "edit") editWoodItem(button.dataset.id);
      if (button.dataset.woodAction === "delete") deleteWoodItem(button.dataset.id);
    });
  });
}

function renderWoodFilterOptions() {
  const pool = getWoodInventoryPool().filter((item) => matchesWoodQuickFilter(item));
  updateSelectOptions(elements.woodSpeciesFilter, ["all", ...uniqueValues(pool.map((item) => item.species || detectWoodSpecies(item)))], "Alle Holzarten");
  updateSelectOptions(elements.woodGroupFilter, ["all", ...uniqueValues(pool.map((item) => item.group || detectWoodGroup(item)))], "Alle OG");
  updateSelectOptions(elements.woodSubgroupFilter, ["all", ...uniqueValues(pool.map((item) => item.subgroup || detectWoodSubgroup(item)))], "Alle UG");
  updateMeasureSelectOptions(elements.woodWidthFilter, ["all", ...uniqueMeasureValues(pool.map((item) => item.width))], "Alle Breiten");
  updateMeasureSelectOptions(elements.woodThicknessFilter, ["all", ...uniqueMeasureValues(pool.map((item) => item.thickness))], "Alle Hoehen");
  updateMeasureSelectOptions(elements.woodLengthFilter, ["all", ...uniqueMeasureValues(pool.map((item) => item.length))], "Alle Laengen");
  updateSelectOptions(elements.woodSupplierFilter, ["all", ...uniqueValues(pool.map((item) => item.supplier || "-"))], "Alle Lieferanten");
  renderGuidedWoodFilters();
}

function renderGuidedWoodFilters() {
  const group = getActiveWoodGroupFilter();
  const species = elements.woodSpeciesFilter.value;
  const width = elements.woodWidthFilter.value;
  const pool = getWoodInventoryPool().filter((item) => matchesWoodQuickFilter(item) && matchesFilter(item.group || detectWoodGroup(item), elements.woodGroupFilter.value));

  const rows = [
    {
      label: "Holzart",
      field: "species",
      activeValue: species,
      values: uniqueValues(pool.map((item) => item.species || detectWoodSpecies(item)))
    },
    {
      label: "Breite",
      field: "width",
      activeValue: width,
      values: uniqueMeasureValues(pool
        .filter((item) => matchesFilter(item.species || detectWoodSpecies(item), species))
        .map((item) => item.width)),
      format: (value) => `${formatMeasureCm(value)} cm`
    },
    {
      label: "Hoehe",
      field: "thickness",
      activeValue: elements.woodThicknessFilter.value,
      values: uniqueMeasureValues(pool
        .filter((item) => matchesFilter(item.species || detectWoodSpecies(item), species) && matchesFilter(item.width, width))
        .map((item) => item.thickness)),
      format: (value) => `${formatMeasureCm(value)} cm`
    }
  ].filter((row) => {
    if (group === "all" || row.values.length === 0) return false;
    if (row.field === "width" && species === "all") return false;
    if (row.field === "thickness" && (species === "all" || width === "all")) return false;
    return true;
  });

  elements.woodGuidedFilters.innerHTML = rows.map((row) => renderGuidedWoodFilterRow(row)).join("");
}

function renderGuidedWoodFilterRow(row) {
  const buttons = [
    `<button class="guided-filter ${row.activeValue === "all" ? "active" : ""}" data-wood-filter-field="${row.field}" data-wood-filter-value="all" type="button">Alle</button>`,
    ...row.values.map((value) => `<button class="guided-filter ${row.activeValue === value ? "active" : ""}" data-wood-filter-field="${row.field}" data-wood-filter-value="${escapeHtml(value)}" type="button">${escapeHtml(row.format ? row.format(value) : value)}</button>`)
  ].join("");
  return `<div class="guided-filter-row"><span>${row.label}</span><div>${buttons}</div></div>`;
}

function applyGuidedWoodFilter(field, value) {
  if (field === "species") {
    elements.woodSpeciesFilter.value = value;
    elements.woodWidthFilter.value = "all";
    elements.woodThicknessFilter.value = "all";
  }
  if (field === "width") {
    elements.woodWidthFilter.value = value;
    elements.woodThicknessFilter.value = "all";
  }
  if (field === "thickness") elements.woodThicknessFilter.value = value;
  renderWoodFilterOptions();
  renderWoodInventory();
}

function getActiveWoodGroupFilter() {
  if (woodQuickFilter !== "all") return woodQuickFilter;
  return elements.woodGroupFilter.value;
}

function applyWoodTableFilterVisibility() {
  const table = elements.woodTable.closest("table");
  if (!table) return;
  table.classList.toggle("hide-species", elements.woodSpeciesFilter.value !== "all");
  table.classList.toggle("hide-group", elements.woodGroupFilter.value !== "all" || woodQuickFilter !== "all");
  table.classList.toggle("hide-subgroup", elements.woodSubgroupFilter.value !== "all");
  table.classList.toggle("hide-width", elements.woodWidthFilter.value !== "all");
  table.classList.toggle("hide-thickness", elements.woodThicknessFilter.value !== "all");
  table.classList.toggle("hide-length", elements.woodLengthFilter.value !== "all");
  table.classList.toggle("hide-supplier", elements.woodSupplierFilter.value !== "all");
}

function getFilteredWoodItems() {
  const species = elements.woodSpeciesFilter.value;
  const group = elements.woodGroupFilter.value;
  const subgroup = elements.woodSubgroupFilter.value;
  const thickness = elements.woodThicknessFilter.value;
  const width = elements.woodWidthFilter.value;
  const length = elements.woodLengthFilter.value;
  const supplier = elements.woodSupplierFilter.value;

  return getWoodInventoryPool().filter((item) => (
    matchesWoodQuickFilter(item) &&
    matchesFilter(item.species || detectWoodSpecies(item), species) &&
    matchesFilter(item.group || detectWoodGroup(item), group) &&
    matchesFilter(item.subgroup || detectWoodSubgroup(item), subgroup) &&
    matchesFilter(item.thickness, thickness) &&
    matchesFilter(item.width, width) &&
    matchesFilter(item.length, length) &&
    matchesFilter(item.supplier || "-", supplier)
  ));
}

function matchesWoodQuickFilter(item) {
  if (woodQuickFilter === "all") return true;
  return String(item.group || detectWoodGroup(item)) === woodQuickFilter;
}

function setWoodSort(sortMode) {
  if (!sortMode) return;
  if (elements.woodSortSelect.value === sortMode) {
    woodSortDirection = woodSortDirection === "asc" ? "desc" : "asc";
  } else {
    elements.woodSortSelect.value = sortMode;
    woodSortDirection = "asc";
  }
  renderWoodInventory();
}

function updateWoodSortIndicators() {
  document.querySelectorAll("[data-sort-indicator]").forEach((indicator) => {
    const sortMode = indicator.dataset.sortIndicator;
    indicator.textContent = elements.woodSortSelect.value === sortMode ? (woodSortDirection === "asc" ? "↑" : "↓") : "";
  });
}

function sortWoodItems(a, b) {
  const sortMode = elements.woodSortSelect.value;
  const direction = woodSortDirection === "desc" ? -1 : 1;
  let result = 0;
  if (sortMode === "name") result = String(a.name || "").localeCompare(String(b.name || ""), "de");
  if (sortMode === "thickness") result = compareNullableDimensionValues(a.thickness, b.thickness, direction);
  if (sortMode === "width") result = compareNullableDimensionValues(a.width, b.width, direction);
  if (sortMode === "length") result = compareNullableDimensionValues(a.length, b.length, direction);
  if (sortMode === "stock") result = Number(a.pieces || 0) - Number(b.pieces || 0);
  if (sortMode === "group") result = compareWoodGroups(a, b);
  const directedResult = ["thickness", "width", "length"].includes(sortMode) ? result : result * direction;
  return directedResult || compareWoodDimensions(a, b);
}

function compareNullableDimensionValues(a, b, direction) {
  const first = parseDimensionValue(a);
  const second = parseDimensionValue(b);
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return (first - second) * direction;
}

function parseDimensionValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function compareWoodGroups(a, b) {
  return String(a.species || "").localeCompare(String(b.species || ""), "de") ||
    String(a.group || "").localeCompare(String(b.group || ""), "de") ||
    String(a.subgroup || "").localeCompare(String(b.subgroup || ""), "de") ||
    String(a.name || "").localeCompare(String(b.name || ""), "de");
}

function compareWoodDimensions(a, b) {
  return compareWoodGroups(a, b) ||
    compareDimensionValues(a.thickness || 9999, b.thickness || 9999) ||
    compareDimensionValues(a.width || 9999, b.width || 9999) ||
    compareDimensionValues(a.length || 999999, b.length || 999999);
}

function getWoodInventoryPool() {
  return showBackgroundWoodItems ? woodItems : getListedWoodItems();
}

function getListedWoodItems() {
  return woodItems.filter((item) => isListedWoodItem(item));
}

function isListedWoodItem(item) {
  if (item.listed === true) return true;
  if (Number(item.pieces) > 0) return true;
  if (Number(item.minimum) > 0) return true;
  return history.some((entry) => entry.itemId === item.id);
}

function toggleWoodListed(id, listed) {
  const item = woodItems.find((current) => current.id === id);
  if (!item) return;
  item.listed = listed;
  persist();
  renderWoodInventory();
}

function renderFilterOptions() {
  const filterItems = getInventoryPool();
  updateSelectOptions(elements.categoryFilter, ["all", ...uniqueValues(filterItems.map((item) => item.category))], "Alle Kategorien");
  updateSelectOptions(elements.subcategoryFilter, ["all", ...uniqueValues(filterItems.map((item) => item.subcategory || detectSubcategory(item)))], "Alle Unterkategorien");
  updateSelectOptions(elements.diameterFilter, ["all", ...uniqueValues(filterItems.map((item) => item.diameter))], "Alle Durchmesser");
  updateSelectOptions(elements.lengthFilter, ["all", ...uniqueValues(filterItems.map((item) => item.length))], "Alle Laengen");
  updateSelectOptions(elements.supplierFilter, ["all", ...uniqueValues(filterItems.map((item) => item.supplier || "-"))], "Alle Lieferanten");
  updateSelectOptions(elements.unitFilter, ["all", ...uniqueValues(filterItems.map((item) => item.unit))], "Alle Einheiten");
}

function getInventoryPool() {
  if (showBackgroundItems) return items.filter((item) => !isExcludedInventoryItem(item));
  return getListedItems();
}

function getListedItems() {
  return items.filter((item) => isListedInventoryItem(item));
}

function isListedInventoryItem(item) {
  if (isExcludedInventoryItem(item)) return false;
  if (item.listed === true) return true;
  if (Number(item.quantity) > 0) return true;
  if (Number(item.minimum) > 0) return true;
  if (String(item.note || "").toLowerCase().includes("rechnungsbilder")) return true;

  return history.some((entry) => entry.itemId === item.id);
}

function renderListedCheckbox(item) {
  const checked = isListedInventoryItem(item) ? "checked" : "";
  const title = item.listed ? "Manuell gefuehrt" : "In Befestigungsmittel fuehren";
  return `
    <label class="list-toggle" title="${escapeHtml(title)}">
      <input data-action="toggle-listed" data-id="${item.id}" type="checkbox" ${checked} />
      <span>${checked ? "Ja" : "Nein"}</span>
    </label>
  `;
}

function toggleItemListed(id, listed) {
  const item = items.find((current) => current.id === id);
  if (!item) return;
  item.listed = listed;
  persist();
  renderSummary();
  renderFilterOptions();
  renderScrewFilterButtons();
  renderInventory();
  renderMovementOptions();
}

function setScrewFilter(filterName, value) {
  screwFilters[filterName] = value;

  if (filterName === "thread") {
    screwFilters.head = "all";
    screwFilters.diameter = "all";
    screwFilters.length = "all";
  }

  if (filterName === "head") {
    screwFilters.diameter = "all";
    screwFilters.length = "all";
  }

  if (filterName === "diameter") {
    screwFilters.length = "all";
  }

  renderScrewFilterButtons();
  renderInventory();
}

function renderScrewFilterButtons() {
  elements.screwFilterPanel.querySelectorAll(".screw-filter").forEach((button) => {
    button.classList.toggle("active", screwFilters[button.dataset.screwFilter] === button.dataset.screwValue);
  });

  renderScrewDynamicButtons(elements.screwDiameterButtons, "diameter", availableScrewValues("diameter"));
  renderScrewDynamicButtons(elements.screwLengthButtons, "length", availableScrewValues("length"));
}

function renderScrewDynamicButtons(container, filterName, values) {
  const label = container.querySelector("span")?.textContent || "";
  container.innerHTML = `<span>${escapeHtml(label)}</span>`;
  appendScrewFilterButton(container, filterName, "all", "Alle");

  values.forEach((value) => {
    const labelText = filterName === "diameter" ? `${value} mm` : `${value}`;
    appendScrewFilterButton(container, filterName, value, labelText);
  });
}

function appendScrewFilterButton(container, filterName, value, label) {
  const button = document.createElement("button");
  button.className = "screw-filter";
  button.classList.toggle("active", screwFilters[filterName] === value);
  button.dataset.screwFilter = filterName;
  button.dataset.screwValue = value;
  button.type = "button";
  button.textContent = label;
  container.appendChild(button);
}

function availableScrewValues(filterName) {
  const filtered = getListedItems().filter((item) => {
    if (!matchesQuickFilter(item, "schrauben")) return false;
    if (screwFilters.thread !== "all" && getShortCodePart(item, 0) !== screwFilters.thread) return false;
    if (filterName !== "head" && screwFilters.head !== "all" && getShortCodePart(item, 1) !== screwFilters.head) return false;
    if (filterName === "length" && screwFilters.diameter !== "all" && item.diameter !== screwFilters.diameter) return false;
    return true;
  });
  const field = filterName === "diameter" ? "diameter" : "length";
  return uniqueValues(filtered.map((item) => item[field])).sort(compareDimensionValues);
}

function matchesScrewFilters(item) {
  if (quickFilter !== "schrauben") return true;
  if (screwFilters.thread !== "all" && getShortCodePart(item, 0) !== screwFilters.thread) return false;
  if (screwFilters.head !== "all" && getShortCodePart(item, 1) !== screwFilters.head) return false;
  if (screwFilters.diameter !== "all" && item.diameter !== screwFilters.diameter) return false;
  if (screwFilters.length !== "all" && item.length !== screwFilters.length) return false;
  return true;
}

function getShortCodePart(item, index) {
  return buildShortCode(item).split(" ")[index] || "";
}

function compareDimensionValues(a, b) {
  return Number(String(a).replace(",", ".")) - Number(String(b).replace(",", "."));
}

function updateSelectOptions(select, values, allLabel) {
  const currentValue = select.value || "all";
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "all" ? allLabel : value;
    select.appendChild(option);
  });
  select.value = values.includes(currentValue) ? currentValue : "all";
}

function updateMeasureSelectOptions(select, values, allLabel) {
  const currentValue = select.value || "all";
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "all" ? allLabel : `${formatMeasureCm(value)} cm`;
    select.appendChild(option);
  });
  select.value = values.includes(currentValue) ? currentValue : "all";
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "de"));
}

function uniqueMeasureValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => {
    const numeric = compareDimensionValues(a, b);
    if (Number.isFinite(numeric) && numeric !== 0) return numeric;
    return String(a).localeCompare(String(b), "de");
  });
}

function matchesFilter(value, filterValue) {
  return filterValue === "all" || String(value || "-") === filterValue;
}

function matchesQuickFilter(item, filterValue) {
  if (filterValue === "all") return true;

  const text = `${item.name} ${item.sku} ${item.category} ${item.subcategory} ${item.note}`.toLowerCase();
  const toolTerms = ["bohrschrauber", "schlagschrauber", "akkuschrauber", "schrauber-set", "schrauber set"];
  const screwSubcategories = ["Terrassenschrauben", "Holzbauschrauben Senkkopf", "Holzbauschrauben Tellerkopf", "Vollgewindeschrauben", "DÃ¤mmplattenschrauben", "Bauschrauben"];

  if (filterValue === "schrauben") {
    if (toolTerms.some((term) => text.includes(term))) return false;
    return screwSubcategories.includes(item.subcategory) || ["holzbauschraube", "terrassenschraube", "vollgewindeschraube", "bauschraube"].some((term) => text.includes(term));
  }
  const groups = {
    schrauben: ["schraube", "schrauben", "spanplattenschraube", "holzbauschraube", "vollgewindeschraube"],
    naegel: ["nagel", "naegel", "nägel", "klammer", "coil", "stauchkopf", "nagelstreifen"],
    bahnen: ["bahn", "unterdeckbahn", "bitumenbahn", "dampfsperre", "folie", "plane", "dämmung", "daemmung"],
    kleber: ["kleber", "klebeband", "klebt", "dichtet", "dicht", "fullcontact"],
    verbinder: ["verbinder", "anker", "winkel", "blitzanker", "schraubanker"]
  };

  return (groups[filterValue] || []).some((term) => text.includes(term));
}

function sortItems(a, b) {
  const sortMode = elements.sortSelect.value;
  if (sortMode === "sku") return String(a.sku || "").localeCompare(String(b.sku || ""), "de");
  if (sortMode === "category") return String(a.category || "").localeCompare(String(b.category || ""), "de") || a.name.localeCompare(b.name, "de");
  if (sortMode === "subcategory") return String(a.subcategory || "").localeCompare(String(b.subcategory || ""), "de") || a.name.localeCompare(b.name, "de");
  if (sortMode === "diameter") return Number(String(a.diameter || "999").replace(",", ".")) - Number(String(b.diameter || "999").replace(",", ".")) || Number(a.length || 9999) - Number(b.length || 9999) || a.name.localeCompare(b.name, "de");
  if (sortMode === "length") return Number(a.length || 9999) - Number(b.length || 9999) || Number(String(a.diameter || "999").replace(",", ".")) - Number(String(b.diameter || "999").replace(",", ".")) || a.name.localeCompare(b.name, "de");
  if (sortMode === "quantityDesc") return Number(b.quantity) - Number(a.quantity) || a.name.localeCompare(b.name, "de");
  if (sortMode === "quantityAsc") return Number(a.quantity) - Number(b.quantity) || a.name.localeCompare(b.name, "de");
  return a.name.localeCompare(b.name, "de");
}

function resetFilters() {
  elements.searchInput.value = "";
  elements.categoryFilter.value = "all";
  elements.subcategoryFilter.value = "all";
  elements.diameterFilter.value = "all";
  elements.lengthFilter.value = "all";
  elements.supplierFilter.value = "all";
  elements.unitFilter.value = "all";
  elements.sortSelect.value = "name";
  quickFilter = "all";
  screwFilters = { thread: "all", head: "all", diameter: "all", length: "all" };
  elements.quickFilters.forEach((button) => button.classList.toggle("active", button.dataset.quickFilter === "all"));
  elements.subFilters.forEach((button) => button.classList.remove("active"));
  renderScrewFilterButtons();
  renderInventory();
}

function resetWoodFilters() {
  elements.woodSpeciesFilter.value = "all";
  elements.woodGroupFilter.value = "all";
  elements.woodSubgroupFilter.value = "all";
  elements.woodThicknessFilter.value = "all";
  elements.woodWidthFilter.value = "all";
  elements.woodLengthFilter.value = "all";
  elements.woodSupplierFilter.value = "all";
  elements.woodSortSelect.value = "group";
  woodSortDirection = "asc";
  woodQuickFilter = "all";
  elements.woodQuickFilters.forEach((button) => button.classList.toggle("active", button.dataset.woodQuickFilter === "all"));
  renderWoodFilterOptions();
  renderWoodInventory();
}

function updateWoodSubgroupOptions(selectedValue = "") {
  const group = woodFields.group.value || "Kantholz";
  const options = WOOD_SUBGROUPS[group] || WOOD_SUBGROUPS.Sonstiges;
  const currentValue = selectedValue || woodFields.subgroup.value;
  woodFields.subgroup.innerHTML = "";
  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    woodFields.subgroup.appendChild(option);
  });
  woodFields.subgroup.value = options.includes(currentValue) ? currentValue : options[0];
}

function renderMovementOptions() {
  elements.movementItem.innerHTML = "";
  const listedItems = getListedItems();

  if (listedItems.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Bitte zuerst Artikel anlegen";
    option.value = "";
    elements.movementItem.appendChild(option);
    return;
  }

  listedItems
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
    const amount = renderHistoryAmount(entry);
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(entry.itemName)}</strong>
        <span>${escapeHtml(entry.reason || "ohne Grund")} · ${new Date(entry.date).toLocaleString("de-AT")}</span>
      </div>
      <strong>${amount}</strong>
    `;
    elements.historyList.appendChild(row);
  });
}

function renderHistoryAmount(entry) {
  if (entry.type === "correction") {
    const difference = Number(entry.difference) || 0;
    const sign = difference > 0 ? "+" : "";
    return `${sign}${formatNumber(difference)} ${escapeHtml(entry.unit || "")}`;
  }

  return `${entry.type === "in" ? "+" : "-"}${formatNumber(entry.quantity)} ${escapeHtml(entry.unit || "")}`;
}
function showItemForm(item = null) {
  elements.itemForm.classList.remove("hidden");
  itemFields.id.value = item?.id || "";
  itemFields.name.value = item?.name || "";
  itemFields.shortCode.value = item?.shortCode || "";
  itemFields.sku.value = item?.sku || "";
  itemFields.code.value = item?.code || item?.sku || "";
  itemFields.category.value = item?.category || "Material";
  itemFields.subcategory.value = item?.subcategory || detectSubcategory(item || {});
  itemFields.unit.value = item?.unit || "Stk";
  itemFields.diameter.value = item?.diameter || "";
  itemFields.length.value = item?.length || "";
  itemFields.quantity.value = item?.quantity ?? 0;
  itemFields.minimum.value = item?.minimum ?? 0;
  itemFields.listPrice.value = item?.listPrice || "";
  itemFields.purchasePrice.value = item?.purchasePrice || "";
  itemFields.discount.value = item?.discount || "";
  if (itemFields.location) itemFields.location.value = item?.location || "";
  itemFields.supplier.value = item?.supplier || "";
  itemFields.listed.checked = item ? isListedInventoryItem(item) : true;
  itemFields.note.value = item?.note || "";
  itemFields.name.focus();
}

function hideItemForm() {
  elements.itemForm.classList.add("hidden");
  elements.itemForm.reset();
  itemFields.id.value = "";
}

function showWoodForm(item = null) {
  elements.woodForm.classList.remove("hidden");
  woodFields.id.value = item?.id || "";
  woodFields.species.value = item?.species || detectWoodSpecies(item || {});
  woodFields.group.value = normalizeWoodGroup(item?.group || detectWoodGroup(item || {}));
  updateWoodSubgroupOptions(item?.subgroup || detectWoodSubgroup(item || {}));
  woodFields.name.value = item?.name || "";
  woodFields.quality.value = item?.quality || "";
  woodFields.thickness.value = item ? formatMeasureCm(item.thickness) : "";
  woodFields.width.value = item ? formatMeasureCm(item.width) : "";
  woodFields.length.value = item ? formatMeasureCm(item.length) : "";
  woodFields.pieces.value = item?.pieces ?? 0;
  woodFields.minimum.value = item?.minimum ?? 0;
  woodFields.unit.value = item?.unit || "Stk";
  woodFields.supplier.value = item?.supplier || "";
  woodFields.note.value = item?.note || "";
  woodFields.name.focus();
}

function hideWoodForm() {
  elements.woodForm.classList.add("hidden");
  elements.woodForm.reset();
  woodFields.id.value = "";
}

function saveWoodItem(event) {
  event.preventDefault();
  const id = woodFields.id.value || crypto.randomUUID();
  const existingItem = woodItems.find((current) => current.id === id);
  const item = {
    id,
    species: woodFields.species.value,
    group: woodFields.group.value,
    subgroup: woodFields.subgroup.value,
    name: woodFields.name.value.trim(),
    quality: woodFields.quality.value.trim(),
    thickness: cmInputToMillimeters(woodFields.thickness.value),
    width: cmInputToMillimeters(woodFields.width.value),
    length: cmInputToMillimeters(woodFields.length.value),
    pieces: Number(woodFields.pieces.value),
    minimum: Number(woodFields.minimum.value),
    unit: woodFields.unit.value,
    supplier: woodFields.supplier.value.trim(),
    listed: existingItem?.listed ?? true,
    note: woodFields.note.value.trim()
  };

  const existingIndex = woodItems.findIndex((current) => current.id === id);
  if (existingIndex >= 0) {
    woodItems[existingIndex] = item;
  } else {
    woodItems.push(item);
  }

  persist();
  hideWoodForm();
  render();
}

function editWoodItem(id) {
  const item = woodItems.find((current) => current.id === id);
  if (item) showWoodForm(item);
}

function deleteWoodItem(id) {
  const item = woodItems.find((current) => current.id === id);
  if (!item || !confirm(`Holzposten "${item.name}" wirklich loeschen?`)) return;
  woodItems = woodItems.filter((current) => current.id !== id);
  persist();
  render();
}

function correctWoodItem(id) {
  const item = woodItems.find((current) => current.id === id);
  if (!item) return;
  const counted = prompt(`Gezaehlter Bestand fuer ${item.name} (${renderWoodDimensionsPlain(item)})`, item.pieces);
  if (counted === null) return;
  const nextPieces = Number(String(counted).replace(",", "."));
  if (!Number.isFinite(nextPieces) || nextPieces < 0) {
    alert("Bitte einen gueltigen Bestand eingeben.");
    return;
  }

  const previousPieces = Number(item.pieces) || 0;
  item.pieces = nextPieces;
  history.unshift({
    id: crypto.randomUUID(),
    itemId: item.id,
    itemName: `Holz: ${item.name} ${renderWoodDimensionsPlain(item)}`,
    type: "correction",
    quantity: Math.abs(nextPieces - previousPieces),
    difference: nextPieces - previousPieces,
    previousQuantity: previousPieces,
    nextQuantity: nextPieces,
    unit: item.unit,
    reason: `Holzinventur: ${formatNumber(previousPieces)} -> ${formatNumber(nextPieces)} ${item.unit}`,
    date: new Date().toISOString()
  });

  persist();
  render();
}

async function saveItem(event) {
  event.preventDefault();
  const id = itemFields.id.value || crypto.randomUUID();
  const item = {
    id,
    shortCode: itemFields.shortCode.value.trim(),
    name: itemFields.name.value.trim(),
    sku: itemFields.sku.value.trim(),
    code: itemFields.code.value.trim() || itemFields.sku.value.trim() || id,
    category: itemFields.category.value,
    subcategory: itemFields.subcategory.value || "Sonstiges",
    unit: itemFields.unit.value,
    diameter: itemFields.diameter.value.trim(),
    length: itemFields.length.value.trim(),
    quantity: Number(itemFields.quantity.value),
    minimum: Number(itemFields.minimum.value),
    listPrice: itemFields.listPrice.value.trim(),
    purchasePrice: itemFields.purchasePrice.value.trim(),
    discount: itemFields.discount.value.trim(),
    location: itemFields.location?.value.trim() || "",
    supplier: itemFields.supplier.value.trim(),
    listed: itemFields.listed.checked,
    note: itemFields.note.value.trim()
  };
  await enrichPricesFromCatalog([item]);

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

function showCorrectionDialog(id) {
  const item = items.find((current) => current.id === id);
  if (!item) return;

  elements.correctionItemId.value = item.id;
  elements.correctionTitle.textContent = renderShortCode(item, true) || renderItemTitle(item);
  elements.correctionCurrent.dataset.value = String(Number(item.quantity) || 0);
  elements.correctionCurrent.textContent = `${formatNumber(item.quantity)} ${item.unit}`;
  elements.correctionQuantity.value = Number(item.quantity) || 0;
  elements.correctionReason.value = "Inventur";
  elements.correctionNote.value = "";
  updateCorrectionDifference();
  elements.correctionDialog.showModal();
  elements.correctionQuantity.focus();
  elements.correctionQuantity.select();
}

function closeCorrectionDialog() {
  elements.correctionDialog.close();
  elements.correctionForm.reset();
  elements.correctionItemId.value = "";
}

function updateCorrectionDifference() {
  const item = items.find((current) => current.id === elements.correctionItemId.value);
  const unit = item?.unit || "Stk";
  const current = Number(elements.correctionCurrent.dataset.value || 0);
  const counted = Number(elements.correctionQuantity.value || 0);
  const difference = counted - current;
  const sign = difference > 0 ? "+" : "";
  elements.correctionDifference.textContent = `${sign}${formatNumber(difference)} ${unit}`;
  elements.correctionDifference.classList.toggle("positive", difference > 0);
  elements.correctionDifference.classList.toggle("negative", difference < 0);
}

function saveStockCorrection(event) {
  event.preventDefault();
  const item = items.find((current) => current.id === elements.correctionItemId.value);
  if (!item) return;

  const previousQuantity = Number(item.quantity) || 0;
  const nextQuantity = Number(elements.correctionQuantity.value);
  if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
    alert("Bitte einen gueltigen Bestand eingeben.");
    return;
  }

  const difference = nextQuantity - previousQuantity;
  item.quantity = nextQuantity;
  history.unshift({
    id: crypto.randomUUID(),
    itemId: item.id,
    itemName: renderShortCode(item, true) || item.name,
    type: "correction",
    quantity: Math.abs(difference),
    difference,
    previousQuantity,
    nextQuantity,
    unit: item.unit,
    reason: `${elements.correctionReason.value}: ${formatNumber(previousQuantity)} -> ${formatNumber(nextQuantity)} ${item.unit}${elements.correctionNote.value.trim() ? " · " + elements.correctionNote.value.trim() : ""}`,
    date: new Date().toISOString()
  });

  persist();
  closeCorrectionDialog();
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

function openQrLabelsDialog() {
  renderQrLabels();
  elements.qrLabelsDialog.showModal();
}

function renderQrLabels() {
  const labels = getQrLabelEntries(elements.qrLabelScope.value);
  elements.qrLabelsGrid.innerHTML = labels.length
    ? labels.map(renderQrLabel).join("")
    : '<p class="empty-state">Keine Artikel fuer QR-Etiketten vorhanden.</p>';
}

function getQrLabelEntries(scope) {
  const itemLabels = getListedItems().map((item) => ({
    type: "Befestigungsmittel",
    title: renderShortCode(item, true) || renderItemTitle(item),
    subtitle: [item.sku || "ohne Nummer", renderDimensionsPlain(item)].filter(Boolean).join(" · "),
    code: getQrPayload(item.code || item.sku || item.id, item.id)
  }));
  const woodLabels = getListedWoodItems().map((item) => ({
    type: "Holz",
    title: renderWoodTitle(item),
    subtitle: [item.species, item.subgroup, renderWoodDimensionsPlain(item)].filter(Boolean).join(" · "),
    code: getQrPayload(item.sku || item.id, item.id)
  }));

  if (scope === "items") return itemLabels;
  if (scope === "wood") return woodLabels;
  return [...itemLabels, ...woodLabels];
}

function getQrPayload(preferred, fallback) {
  const text = String(preferred || fallback || "").trim();
  return new TextEncoder().encode(text).length <= 78 ? text : String(fallback || "").trim();
}

function renderQrLabel(label) {
  return `
    <article class="qr-label">
      <div class="qr-code">${createQrSvg(label.code)}</div>
      <div>
        <strong>${escapeHtml(label.title || label.code)}</strong>
        <span>${escapeHtml(label.subtitle || label.type)}</span>
        <small>${escapeHtml(label.code)}</small>
      </div>
    </article>
  `;
}

function createQrSvg(text) {
  const modules = createQrMatrix(text);
  const quiet = 4;
  const cell = 4;
  const size = modules.length + quiet * 2;
  const rects = [];
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) rects.push(`<rect x="${(x + quiet) * cell}" y="${(y + quiet) * cell}" width="${cell}" height="${cell}"/>`);
    });
  });
  return `<svg viewBox="0 0 ${size * cell} ${size * cell}" role="img" aria-label="QR ${escapeHtml(text)}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${rects.join("")}</g></svg>`;
}

function createQrMatrix(text) {
  const version = 4;
  const size = 17 + version * 4;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const setModule = (x, y, dark, reserve = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = Boolean(dark);
    if (reserve) reserved[y][x] = true;
  };

  drawFinderPattern(setModule, 0, 0);
  drawFinderPattern(setModule, size - 7, 0);
  drawFinderPattern(setModule, 0, size - 7);
  drawAlignmentPattern(setModule, 26, 26);
  for (let i = 8; i < size - 8; i += 1) {
    setModule(i, 6, i % 2 === 0);
    setModule(6, i, i % 2 === 0);
  }
  reserveFormatModules(reserved, size);

  const codewords = [...createQrDataCodewords(text), ...createQrErrorCorrection(createQrDataCodewords(text), 20)];
  const bits = codewords.flatMap((codeword) => Array.from({ length: 8 }, (_, bit) => (codeword >>> (7 - bit)) & 1));
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vert = 0; vert < size; vert += 1) {
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        if (reserved[y][x]) continue;
        const bit = bits[bitIndex] || 0;
        bitIndex += 1;
        modules[y][x] = Boolean(bit ^ qrMask(0, x, y));
      }
    }
  }

  drawFormatBits(setModule, size, 0);
  setModule(8, size - 8, true);
  return modules;
}

function drawFinderPattern(setModule, x, y) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(xx, yy, dark);
    }
  }
}

function drawAlignmentPattern(setModule, centerX, centerY) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setModule(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function reserveFormatModules(reserved, size) {
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      reserved[i][8] = true;
      reserved[8][i] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
}

function drawFormatBits(setModule, size, mask) {
  const bits = getQrFormatBits(mask);
  const bit = (index) => ((bits >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) setModule(8, i, bit(i));
  setModule(8, 7, bit(6));
  setModule(8, 8, bit(7));
  setModule(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) setModule(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i += 1) setModule(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) setModule(8, size - 15 + i, bit(i));
}

function getQrFormatBits(mask) {
  let data = (1 << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if (((rem >>> i) & 1) !== 0) rem ^= 0x537 << (i - 10);
  }
  return (((data << 10) | rem) ^ 0x5412) & 0x7fff;
}

function qrMask(mask, x, y) {
  return mask === 0 ? (x + y) % 2 === 0 : false;
}

function createQrDataCodewords(text) {
  const bytes = Array.from(new TextEncoder().encode(text)).slice(0, 78);
  const bits = [0, 1, 0, 0, ...byteToBits(bytes.length, 8), ...bytes.flatMap((byte) => byteToBits(byte, 8))];
  bits.push(0, 0, 0, 0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length && data.length < 80; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  }
  for (let pad = 0; data.length < 80; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11);
  return data;
}

function byteToBits(value, length) {
  return Array.from({ length }, (_, index) => (value >>> (length - 1 - index)) & 1);
}

function createQrErrorCorrection(data, degree) {
  const generator = createQrGeneratorPolynomial(degree);
  const result = Array(degree).fill(0);
  data.forEach((value) => {
    const factor = value ^ result.shift();
    result.push(0);
    generator.slice(1).forEach((coefficient, index) => {
      result[index] ^= qrGfMultiply(coefficient, factor);
    });
  });
  return result;
}

function createQrGeneratorPolynomial(degree) {
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = Array(result.length + 1).fill(0);
    result.forEach((coefficient, index) => {
      next[index] ^= qrGfMultiply(coefficient, 1);
      next[index + 1] ^= qrGfMultiply(coefficient, qrGfExp(i));
    });
    result = next;
  }
  return result;
}

function qrGfMultiply(x, y) {
  if (x === 0 || y === 0) return 0;
  return qrGfExp(qrGfLog(x) + qrGfLog(y));
}

function qrGfExp(power) {
  let value = 1;
  for (let i = 0; i < power % 255; i += 1) {
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  return value;
}

function qrGfLog(value) {
  let current = 1;
  for (let i = 0; i < 255; i += 1) {
    if (current === value) return i;
    current = qrGfMultiplyRaw(current, 2);
  }
  return 0;
}

function qrGfMultiplyRaw(x, y) {
  let result = 0;
  while (y > 0) {
    if (y & 1) result ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    y >>>= 1;
  }
  return result;
}

function exportCsv() {
  const header = ["Kuerzel", "Name", "Artikelnummer", "QR-/Barcode", "Kategorie", "Unterkategorie", "Einheit", "Durchmesser", "Laenge", "Bestand", "Mindestbestand", "Lieferant", "Notiz"];
  if (canSeePrices) header.push("Listenpreis", "Einkaufspreis", "Rabatt");

  const rows = getListedItems().map((item) => [
    ...[
      renderShortCode(item, true),
      item.name,
      item.sku,
      item.code,
      item.category,
      item.subcategory || detectSubcategory(item),
      item.unit,
      item.diameter,
      item.length,
      item.quantity,
      item.minimum,
      item.supplier,
      item.note
    ],
    ...(canSeePrices ? [item.listPrice, item.purchasePrice, item.discount] : [])
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

async function loadCatalogItems() {
  try {
    const response = await fetch(CATALOG_IMPORT_FILE, { cache: "no-store" });
    if (!response.ok) throw new Error("Katalogdatei nicht gefunden.");

    const text = await response.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const catalogItems = rowsToItems(lines.slice(1).map(parseCsvLine));
    catalogPriceIndex = new Map(catalogItems.map((item) => [normalizeSkuKey(item.sku || item.code), item]).filter(([key]) => key));
    const result = mergeCatalogItems(catalogItems);

    persist();
    render();
    alert(`Katalog als Vorlage geladen: ${result.added} neue Hintergrundartikel, ${result.updated} aktualisiert. Hintergrundartikel werden ueber den Haken "Gefuehrt" in die Befestigungsmittel uebernommen.`);
  } catch (error) {
    alert(`Artikelkatalog konnte nicht geladen werden: ${error.message}`);
  }
}

function mergeCatalogItems(catalogItems) {
  let added = 0;
  let updated = 0;
  const existingBySku = new Map(items.map((item) => [String(item.sku || "").toLowerCase(), item]));

  catalogItems.forEach((catalogItem) => {
    const key = String(catalogItem.sku || "").toLowerCase();
    const existing = existingBySku.get(key);
    const catalogDefaults = {
      ...catalogItem,
      quantity: 0,
      minimum: 0,
      listed: false,
      location: "",
      code: catalogItem.code || catalogItem.sku
    };

    if (existing) {
      Object.assign(existing, {
        name: catalogItem.name || existing.name,
        code: existing.code || catalogItem.code || catalogItem.sku,
        category: catalogItem.category || existing.category,
        subcategory: catalogItem.subcategory || existing.subcategory,
        unit: catalogItem.unit || existing.unit,
        diameter: catalogItem.diameter || existing.diameter,
        length: catalogItem.length || existing.length,
        supplier: catalogItem.supplier || existing.supplier,
        note: cleanCatalogNote(existing.note || catalogItem.note),
        listed: existing.listed || false,
        listPrice: catalogItem.listPrice || existing.listPrice,
        purchasePrice: catalogItem.purchasePrice || existing.purchasePrice,
        discount: catalogItem.discount || existing.discount
      });
      updated += 1;
    } else {
      items.push(catalogDefaults);
      existingBySku.set(key, catalogDefaults);
      added += 1;
    }
  });

  return { added, updated };
}

function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
    const imported = rowsToItems(lines.slice(1).map(parseCsvLine));
    await enrichPricesFromCatalog(imported);

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

function renderPrice(item) {
  if (!item.purchasePrice && !item.listPrice && !item.discount) return "-";

  const parts = [];
  if (item.purchasePrice) parts.push(`<strong>${escapeHtml(item.purchasePrice)} EUR</strong>`);
  if (item.listPrice) parts.push(`<span>Liste ${escapeHtml(item.listPrice)} EUR</span>`);
  if (item.discount) parts.push(`<span>${escapeHtml(item.discount)} % Rabatt</span>`);
  return `<div class="price-cell">${parts.join("")}</div>`;
}

function renderShortCode(item, plain = false) {
  const code = String(item.shortCode || "").trim() || buildShortCode(item);
  if (plain) return code;
  if (!code) return '<span class="short-code empty">-</span>';
  return `<strong class="short-code">${escapeHtml(code)}</strong>`;
}

function renderItemTitle(item) {
  const text = `${item.name || ""} ${item.subcategory || ""}`.toLowerCase();
  if (text.includes("vollgewindeschrauben zylinderkopf") || text.includes("vollgewindeschraube zylinderkopf")) {
    return renderShortCode(item, true) || item.sku || item.name;
  }

  return item.name;
}

function buildShortCode(item) {
  const text = `${item.name || ""} ${item.subcategory || ""}`.toLowerCase();
  const diameter = String(item.diameter || "").trim();
  const length = String(item.length || "").trim();
  const dimensions = diameter && length ? `${diameter}x${length}` : "";
  const type = detectShortCodeType(text, item.subcategory);
  const head = detectShortCodeHead(text, item.subcategory);
  const parts = [type, head, dimensions].filter(Boolean);

  return parts.join(" ");
}

function detectShortCodeType(text, subcategory) {
  if (text.includes("vollgewinde") || subcategory === "Vollgewindeschrauben") return "VG";
  if (text.includes("teilgewinde")) return "TG";
  if (text.includes("terrassenschraube") || subcategory === "Terrassenschrauben") return "TS";
  if (text.includes("fensterbauschraube")) return "FB";
  if ((text.includes("bauschraube") && !text.includes("holzbauschraube") && !text.includes("fensterbauschraube")) || subcategory === "Bauschrauben") return "BS";
  if (text.includes("daemmplattenschraube") || text.includes("dÃ¤mmplattenschraube") || subcategory === "DÃ¤mmplattenschrauben") return "DP";
  if (text.includes("holzbauschraube") || String(subcategory || "").startsWith("Holzbauschrauben")) return "TG";
  return "";
}

function detectShortCodeHead(text, subcategory) {
  if (text.includes("senkkopf") || subcategory === "Holzbauschrauben Senkkopf") return "SK";
  if (text.includes("tellerkopf") || subcategory === "Holzbauschrauben Tellerkopf") return "TK";
  if (text.includes("zylinderkopf")) return "ZK";
  if (text.includes("hybridkopf")) return "HK";
  if (text.includes("t-kopf")) return "TK";
  return "";
}

function renderDimensions(item) {
  if (!item.diameter && !item.length) return "-";
  if (item.diameter && item.length) return `<strong>${escapeHtml(item.diameter)} x ${escapeHtml(item.length)} mm</strong>`;
  if (item.diameter) return `<span>${escapeHtml(item.diameter)} mm</span>`;
  return `<span>${escapeHtml(item.length)} mm</span>`;
}

function renderDimensionsPlain(item) {
  if (!item.diameter && !item.length) return "";
  if (item.diameter && item.length) return `${item.diameter} x ${item.length} mm`;
  if (item.diameter) return `${item.diameter} mm`;
  return `${item.length} mm`;
}

function renderWoodDimensions(item) {
  return `<strong>${escapeHtml(renderWoodDimensionsPlain(item))}</strong>`;
}

function renderWoodMeasure(value) {
  if (!String(value || "").trim()) return "-";
  return `${escapeHtml(formatMeasureCm(value))}`;
}

function isHobelware(item) {
  return String(item.group || detectWoodGroup(item)) === "Hobelware";
}

function renderWoodTitle(item) {
  if (isHobelware(item)) return item.subgroup || detectWoodSubgroup(item) || "Hobelware";
  return item.name;
}

function renderWoodMeta(item) {
  const parts = [];
  if (!isHobelware(item) && item.sku) parts.push(`Art.-Nr. ${escapeHtml(item.sku)}`);
  if (canSeePrices && item.purchasePrice) {
    parts.push(`EK ${escapeHtml(item.purchasePrice)} ${escapeHtml(item.priceUnit || "")}`.trim());
  }
  if (!isHobelware(item) && item.note) parts.push(escapeHtml(item.note));
  return parts.join(" · ");
}

function renderWoodDimensionsPlain(item) {
  const width = String(item.width || "").trim() ? formatMeasureCm(item.width) : "-";
  const thickness = String(item.thickness || "").trim() ? formatMeasureCm(item.thickness) : "-";
  const length = String(item.length || "").trim() ? formatMeasureCm(item.length) : "-";
  return `${width} x ${thickness} x ${length} cm`;
}

function calculateWoodLinearMeters(item) {
  const length = Number(String(item.length || 0).replace(",", ".")) / 1000;
  const pieces = Number(item.pieces) || 0;
  if (!Number.isFinite(length)) return 0;
  return length * pieces;
}

function calculateWoodVolume(item) {
  const thickness = Number(String(item.thickness || 0).replace(",", ".")) / 1000;
  const width = Number(String(item.width || 0).replace(",", ".")) / 1000;
  const length = Number(String(item.length || 0).replace(",", ".")) / 1000;
  const pieces = Number(item.pieces) || 0;
  if (![thickness, width, length].every(Number.isFinite)) return 0;
  return thickness * width * length * pieces;
}

function formatMeasureCm(value) {
  const number = Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(number)) return String(value || "").trim();
  return formatNumber(number / 10);
}

function cmInputToMillimeters(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const number = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(number)) return trimmed;
  return String(Math.round(number * 10 * 1000) / 1000).replace(".", ",");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
