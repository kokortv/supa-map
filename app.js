const CONFIG_KEY = "dump-map-config-v1";
const SESSION_KEY = "dump-map-session-v1";
const DEFAULT_THEME = "system";
const APP_GOOGLE_CLIENT_ID = "66393576825-hl14ol7johmufhen7e10iugfne9dv6mk.apps.googleusercontent.com";
const APP_GOOGLE_SHEET_ID = "1rYGrZH4XnV6BaIdV2RWcSN9d--Lfb4Boijho3ut05mA";
const APP_DRIVE_FOLDER_ID = "1Ue_kyzdJQ1FN4alQRl-iWckFn0tP_EUe";
const BOOTSTRAP_ADMIN_EMAILS = [
  "kirill.kokorin@gmail.com"
];
const AUTO_SPREADSHEET_TITLE = "Supa Map - заявки";
const AUTO_DRIVE_FOLDER_NAME = "Supa Map - фото";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "openid",
  "email",
  "profile"
].join(" ");

const HEADERS = [
  "id",
  "createdAt",
  "updatedAt",
  "status",
  "lat",
  "lng",
  "type",
  "size",
  "description",
  "photoFileId",
  "photoUrl",
  "createdByEmail",
  "createdByName",
  "confirmations",
  "adminNote"
];

const state = {
  token: "",
  tokenExpiresAt: 0,
  profile: null,
  authPromise: null,
  dumps: [],
  location: null,
  selectedPhoto: null,
  currentLocation: null,
  currentLocationMarker: null,
  selectedDumpMarker: null,
  markers: new Map(),
  map: null,
  tokenClient: null,
  currentView: "listView",
  config: loadConfig()
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", () => {
  restoreSession();
  applyTheme();
  bindNavigation();
  bindSettings();
  bindAuth();
  bindFilters();
  bindDumpForm();
  initMapWhenReady();
  applySettingsToForm();
  renderAuth();
  renderAccess();
  renderLists();
  loadDumps();
});

function loadConfig() {
  try {
    return {
      sheetId: APP_GOOGLE_SHEET_ID,
      folderId: APP_DRIVE_FOLDER_ID,
      theme: DEFAULT_THEME,
      ...(JSON.parse(localStorage.getItem(CONFIG_KEY)) || {})
    };
  } catch {
    return {
      sheetId: APP_GOOGLE_SHEET_ID,
      folderId: APP_DRIVE_FOLDER_ID,
      theme: DEFAULT_THEME
    };
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
}

function restoreSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY)) || {};
    if (session.token && session.profile && Number(session.tokenExpiresAt) > Date.now() + 30000) {
      state.token = session.token;
      state.tokenExpiresAt = Number(session.tokenExpiresAt);
      state.profile = session.profile;
    }
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
}

function saveSession() {
  if (!state.token || !state.profile) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    token: state.token,
    tokenExpiresAt: state.tokenExpiresAt,
    profile: state.profile
  }));
}

function clearSession() {
  state.token = "";
  state.tokenExpiresAt = 0;
  state.profile = null;
  state.authPromise = null;
  localStorage.removeItem(SESSION_KEY);
}

function applyTheme() {
  const theme = state.config.theme || DEFAULT_THEME;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.body.classList.toggle("theme-dark", theme === "dark" || (theme === "system" && prefersDark));
  $$("#themePicker button").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeValue === theme);
  });
}

function bindNavigation() {
  $$(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      openView(button.dataset.view);
    });
  });
}

function bindSettings() {
  $("#settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.config = {
      clientId: String(form.get("clientId") || "").trim(),
      sheetId: String(form.get("sheetId") || "").trim(),
      folderId: String(form.get("folderId") || "").trim(),
      theme: state.config.theme || DEFAULT_THEME,
      adminEmails: String(form.get("adminEmails") || "")
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    };
    state.tokenClient = null;
    saveConfig();
    renderAuth();
    renderAccess();
    toast("Настройки сохранены");
  });

  $("#initSheetButton").addEventListener("click", async () => {
    try {
      await requireGoogleAuth();
      if (!isAdmin()) throw new Error("Создавать хранилище может только администратор");
      await ensureStorageConfigured();
      await ensureSheetHeaders();
      toast("Таблица, папка и заголовки готовы");
    } catch (error) {
      toast(error.message);
    }
  });

  $$("#themePicker button").forEach((button) => {
    button.addEventListener("click", () => {
      state.config.theme = button.dataset.themeValue;
      saveConfig();
      applyTheme();
    });
  });
}

function applySettingsToForm() {
  const form = $("#settingsForm");
  form.clientId.value = state.config.clientId || APP_GOOGLE_CLIENT_ID || "";
  form.sheetId.value = state.config.sheetId || "";
  form.folderId.value = state.config.folderId || "";
  form.adminEmails.value = (state.config.adminEmails || []).join(", ");
}

function bindAuth() {
  $("#signInButton").addEventListener("click", async () => {
    if (!getGoogleClientId()) {
      toast("Укажите APP_GOOGLE_CLIENT_ID в app.js");
      return;
    }
    try {
      await signIn();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#refreshButton").addEventListener("click", loadDumps);
  $("#adminRefreshButton").addEventListener("click", loadDumps);
  $("#mapLocateButton").addEventListener("click", () => getCurrentPosition());
  $("#newDumpButton").addEventListener("click", () => openView("newView"));
  $("#mapNewDumpButton").addEventListener("click", () => openView("newView"));
  $("#backToListButton").addEventListener("click", () => openView("listView"));
  $("#signOutButton").addEventListener("click", signOut);
}

function bindFilters() {
  $("#statusFilter").addEventListener("change", renderMapAndLists);
  $("#typeFilter").addEventListener("change", renderMapAndLists);
}

function bindDumpForm() {
  $("#selectPointButton").addEventListener("click", () => {
    openView("mapView");
    toast("Кликните на карте в месте свалки");
  });
  $("#locateButton").addEventListener("click", () => getCurrentPosition({ useForDump: true }));
  $("#successMapButton").addEventListener("click", () => openView("mapView"));
  $("#successNewButton").addEventListener("click", resetDumpForm);
  $("#cameraButton").addEventListener("click", () => $("#cameraInput").click());
  $("#galleryButton").addEventListener("click", () => $("#photoInput").click());
  $("#cameraInput").addEventListener("change", (event) => handlePhotoPicked(event.target.files?.[0], true));
  $("#photoInput").addEventListener("change", (event) => handlePhotoPicked(event.target.files?.[0], false));
  bindDumpSubmit();
}

async function handlePhotoPicked(file, fromCamera) {
  if (!file) return;
  state.selectedPhoto = file;
  if (fromCamera) {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      $("#photoInput").files = transfer.files;
    } catch {
      $("#photoInput").value = "";
    }
  }
  const preview = $("#photoPreview");
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  const gps = await readImageGps(file);
  if (gps) {
    const location = await setDumpLocation(gps.lat, gps.lng);
    if (location) {
      state.map?.setView([gps.lat, gps.lng], 17);
      toast("Точка взята из геометки фотографии");
    }
  }
}

function bindDumpSubmit() {
  $("#dumpForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await requireReady();
      if (!state.location) {
        toast("Поставьте точку свалки на карте");
        return;
      }

      const form = new FormData(event.currentTarget);
      const photo = state.selectedPhoto || form.get("photo");
      if (!(photo instanceof File) || !photo.size) {
        toast("Фото обязательно");
        return;
      }

      setBusy(event.submitter, true);
      const uploaded = await uploadPhoto(photo);
      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        status: "pending",
        lat: String(state.location.lat),
        lng: String(state.location.lng),
        type: String(form.get("type")),
        size: String(form.get("size")),
        description: String(form.get("description") || "").trim(),
        photoFileId: uploaded.id,
        photoUrl: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
        createdByEmail: state.profile.email,
        createdByName: state.profile.name || state.profile.email,
        confirmations: state.profile.email,
        adminNote: ""
      };
      await appendDump(row);
      showSuccessPanel();
      state.location = null;
      renderLocation();
      clearSelectedDumpMarker();
      await loadDumps();
      toast("Заявка добавлена. Ее обработают в ближайшее время");
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy(event.submitter, false);
    }
  });
}

function initMapWhenReady() {
  const timer = setInterval(() => {
    if (!window.L) return;
    clearInterval(timer);
    state.map = L.map("map", { zoomControl: true }).setView([41.7151, 44.8271], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(state.map);
    state.map.on("click", async (event) => {
      await setDumpLocation(event.latlng.lat, event.latlng.lng);
    });
    setTimeout(() => {
      getCurrentPosition();
    }, 400);
  }, 50);
}

async function signIn() {
  await waitForGoogle();
  if (state.authPromise) return state.authPromise;
  state.authPromise = new Promise((resolve, reject) => {
    let popupWatch = 0;
    let authTimeout = 0;
    const clearAuth = () => {
      window.removeEventListener("focus", onWindowFocus);
      clearTimeout(popupWatch);
      clearTimeout(authTimeout);
      setTimeout(() => {
        state.authPromise = null;
      }, 0);
    };
    const cancelAuth = () => {
      if (state.token) return;
      const error = new Error("Вход отменен. Нажмите кнопку еще раз, если хотите войти");
      clearAuth();
      reject(error);
    };
    const onWindowFocus = () => {
      popupWatch = setTimeout(() => {
        if (!state.token) cancelAuth();
      }, 900);
    };

    const handleResponse = async (response) => {
      try {
        if (response.error) {
          throw new Error("Google OAuth: " + response.error);
        }
        state.token = response.access_token;
        state.tokenExpiresAt = Date.now() + Number(response.expires_in || 3300) * 1000;
        state.profile = await fetchProfile();
        saveSession();
        renderAuth();
        renderAccess();
        if (isAdmin()) {
          await ensureStorageConfigured();
        }
        if (state.config.sheetId && state.config.folderId) {
          await loadDumps();
        }
        toast(`Вход выполнен: ${state.profile.email}`);
        resolve(state.profile);
      } catch (error) {
        toast(error.message);
        reject(error);
      } finally {
        clearAuth();
      }
    };

    if (!state.tokenClient) {
      state.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: getGoogleClientId(),
        scope: SCOPES,
        callback: handleResponse
      });
    } else {
      state.tokenClient.callback = handleResponse;
    }

    state.tokenClient.requestAccessToken({ prompt: state.token ? "" : "consent" });
    window.addEventListener("focus", onWindowFocus);
    authTimeout = setTimeout(cancelAuth, 45000);
  });
  return state.authPromise;
}

function waitForGoogle() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 8000) {
        clearInterval(timer);
        reject(new Error("Google Identity Services не загрузился"));
      }
    }, 80);
  });
}

async function fetchProfile() {
  const data = await apiFetch("https://www.googleapis.com/oauth2/v3/userinfo");
  return {
    email: String(data.email || "").toLowerCase(),
    name: data.name || data.email || "Пользователь"
  };
}

async function requireReady() {
  await requireGoogleAuth();
  if (!state.config.sheetId || !state.config.folderId) {
    openView(isAdmin() ? "settingsView" : "mapView");
    throw new Error(isAdmin() ? "Создайте таблицу и папку в настройках" : "Администратор еще не настроил таблицу и папку");
  }
}

async function requireGoogleAuth() {
  if (!getGoogleClientId()) {
    throw new Error("Укажите APP_GOOGLE_CLIENT_ID в app.js");
  }
  if (!state.token || state.tokenExpiresAt < Date.now() + 30000) {
    await signIn();
    if (!state.token) throw new Error("Не удалось войти через Google");
  }
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(url, {
    ...options,
    headers
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error?.message || response.statusText);
  }
  return data;
}

function sheetsValuesUrl(range, suffix = "", params = "") {
  return `https://sheets.googleapis.com/v4/spreadsheets/${state.config.sheetId}/values/${encodeURIComponent(range)}${suffix}${params}`;
}

async function ensureStorageConfigured() {
  if (!isAdmin()) return;
  let changed = false;
  if (!state.config.sheetId) {
    const spreadsheet = await createSpreadsheet();
    state.config.sheetId = spreadsheet.spreadsheetId;
    changed = true;
  }
  if (!state.config.folderId) {
    const folder = await createDriveFolder();
    state.config.folderId = folder.id;
    changed = true;
  }
  if (changed) {
    saveConfig();
    applySettingsToForm();
    toast("Созданы Google Sheet и Drive папка");
  }
  await ensurePublicStorageAccess();
}

async function createSpreadsheet() {
  return apiFetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title: AUTO_SPREADSHEET_TITLE },
      sheets: [{ properties: { title: "Dumps" } }]
    })
  });
}

async function createDriveFolder() {
  return apiFetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: AUTO_DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder"
    })
  });
}

async function ensurePublicStorageAccess() {
  if (state.config.sheetId) {
    await makeFilePublic(state.config.sheetId);
  }
  if (state.config.folderId) {
    await makeFilePublic(state.config.folderId);
  }
}

async function makeFilePublic(fileId) {
  try {
    await apiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
        allowFileDiscovery: false
      })
    });
  } catch (error) {
    if (!/already exists|duplicate|same permission/i.test(error.message)) {
      throw error;
    }
  }
}

async function ensureDumpSheet() {
  const metadata = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${state.config.sheetId}?fields=sheets.properties`);
  const exists = metadata.sheets.some((item) => item.properties.title === "Dumps");
  if (exists) return;
  await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${state.config.sheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: "Dumps" } } }]
    })
  });
}

async function ensureSheetHeaders() {
  await ensureDumpSheet();
  await apiFetch(sheetsValuesUrl("Dumps!A1:O1", "", "?valueInputOption=RAW"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [HEADERS] })
  });
}

async function loadDumps() {
  try {
    if (!state.config.sheetId) {
      state.dumps = [];
      renderMapAndLists();
      toast("Таблица еще не настроена");
      return;
    }
    let rows = [];
    if (state.token) {
      await ensureSheetHeaders();
      const data = await apiFetch(sheetsValuesUrl("Dumps!A2:O"));
      rows = data.values || [];
    } else {
      rows = await loadPublicDumpRows();
    }
    state.dumps = rows.map(rowToDump).filter((dump) => dump.id && Number.isFinite(dump.lat) && Number.isFinite(dump.lng));
    renderMapAndLists();
    toast(`Загружено: ${state.dumps.length}`);
  } catch (error) {
    state.dumps = [];
    renderMapAndLists();
    toast(humanizeGoogleError(error, state.token ? "Не удалось загрузить таблицу" : "Публичное чтение таблицы недоступно"));
  }
}

function humanizeGoogleError(error, fallback) {
  const message = String(error?.message || "");
  if (/requested entity was not found|not found|404/i.test(message)) {
    return "Google не нашел таблицу. Проверьте Sheet ID и название листа Dumps";
  }
  return message || fallback;
}

async function loadPublicDumpRows() {
  const table = await loadGoogleVizTable(state.config.sheetId, "Dumps");
  const labels = table.cols.map((column) => column.label || column.id || "");
  const indexByName = Object.fromEntries(labels.map((name, index) => [name, index]));
  return table.rows.map((row) => HEADERS.map((name) => {
    const cell = row.c?.[indexByName[name]];
    return cell?.v ?? cell?.f ?? "";
  }));
}

function loadGoogleVizTable(sheetId, sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName = `supaMapSheet_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Публичное чтение таблицы недоступно"));
    }, 12000);
    window[callbackName] = (response) => {
      clearTimeout(timeout);
      cleanup();
      if (response.status === "error") {
        reject(new Error(response.errors?.[0]?.detailed_message || "Публичное чтение таблицы недоступно"));
        return;
      }
      resolve(response.table || { cols: [], rows: [] });
    };
    const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
    url.searchParams.set("sheet", sheetName);
    url.searchParams.set("headers", "1");
    url.searchParams.set("tqx", `out:json;responseHandler:${callbackName}`);
    script.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error("Публичное чтение таблицы недоступно"));
    };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function rowToDump(row, index) {
  const record = Object.fromEntries(HEADERS.map((key, column) => [key, row[column] || ""]));
  return {
    ...record,
    rowNumber: index + 2,
    lat: Number(record.lat),
    lng: Number(record.lng),
    confirmations: parseConfirmations(record.confirmations)
  };
}

function parseConfirmations(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function dumpToRow(dump) {
  return HEADERS.map((key) => Array.isArray(dump[key]) ? dump[key].join(",") : (dump[key] ?? ""));
}

async function appendDump(dump) {
  await ensureSheetHeaders();
  await apiFetch(sheetsValuesUrl("Dumps!A:O", ":append", "?valueInputOption=RAW&insertDataOption=INSERT_ROWS"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [dumpToRow(dump)] })
  });
}

async function updateDump(dump) {
  dump.updatedAt = new Date().toISOString();
  await apiFetch(sheetsValuesUrl(`Dumps!A${dump.rowNumber}:O${dump.rowNumber}`, "", "?valueInputOption=RAW"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [dumpToRow(dump)] })
  });
}

async function deleteDump(dump) {
  const metadata = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${state.config.sheetId}?fields=sheets.properties`);
  const sheet = metadata.sheets.find((item) => item.properties.title === "Dumps");
  if (!sheet) throw new Error("Лист Dumps не найден");
  await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${state.config.sheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: "ROWS",
            startIndex: dump.rowNumber - 1,
            endIndex: dump.rowNumber
          }
        }
      }]
    })
  });
}

async function uploadPhoto(file) {
  const metadata = {
    name: `${Date.now()}-${file.name}`,
    mimeType: file.type || "application/octet-stream",
    parents: [state.config.folderId]
  };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  body.append("file", file);
  const uploaded = await apiFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink", {
    method: "POST",
    body
  });
  await makeFilePublic(uploaded.id);
  return uploaded;
}

async function getCurrentPosition({ useForDump = false } = {}) {
  if (!window.isSecureContext) {
    toast("Геолокация работает только через HTTPS или localhost");
    return null;
  }
  if (!navigator.geolocation) {
    toast("Браузер не поддерживает геолокацию");
    return null;
  }
  $("#locateButton").disabled = true;
  $("#mapLocateButton").disabled = true;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        renderLocation();
        renderCurrentLocationMarker();
        state.map?.setView([state.currentLocation.lat, state.currentLocation.lng], 16);
        $("#locateButton").disabled = false;
        $("#mapLocateButton").disabled = false;
        if (useForDump) {
          setDumpLocation(state.currentLocation.lat, state.currentLocation.lng).then(resolve);
        } else {
          resolve(state.currentLocation);
        }
      },
      (error) => {
        toast(error.message || "Геолокация отклонена");
        $("#locateButton").disabled = false;
        $("#mapLocateButton").disabled = false;
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  });
}

async function setDumpLocation(lat, lng) {
  toast("Проверяем точку...");
  const water = await isWaterPoint(lat, lng);
  if (water) {
    toast("Точка находится на воде. Выберите место на суше");
    return null;
  }
  state.location = { lat, lng };
  renderLocation();
  renderSelectedDumpMarker();
  toast("Точка свалки выбрана");
  return state.location;
}

async function isWaterPoint(lat, lng) {
  if (await isWaterByTileColor(lat, lng)) return true;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("email", "kirill.kokorin@gmail.com");
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return false;
    const data = await response.json();
    const haystack = [
      data.category,
      data.class,
      data.type,
      data.addresstype,
      data.name,
      data.display_name
    ].join(" ").toLowerCase();
    return /\b(water|sea|ocean|bay|strait|lake|reservoir|river|stream|canal|wetland|basin|dock|harbour|marina)\b/.test(haystack);
  } catch {
    return false;
  }
}

async function isWaterByTileColor(lat, lng) {
  try {
    const zoom = Math.min(17, Math.max(12, Math.round(state.map?.getZoom?.() || 16)));
    const scale = 2 ** zoom;
    const xFloat = ((lng + 180) / 360) * scale;
    const sinLat = Math.sin((lat * Math.PI) / 180);
    const yFloat = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    const x = Math.floor(xFloat);
    const y = Math.floor(yFloat);
    const pixelX = Math.floor((xFloat - x) * 256);
    const pixelY = Math.floor((yFloat - y) * 256);
    const image = await loadTileImage(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const samples = [
      [pixelX, pixelY],
      [pixelX - 2, pixelY],
      [pixelX + 2, pixelY],
      [pixelX, pixelY - 2],
      [pixelX, pixelY + 2]
    ];
    const waterVotes = samples.filter(([sampleX, sampleY]) => {
      const sx = Math.max(0, Math.min(255, sampleX));
      const sy = Math.max(0, Math.min(255, sampleY));
      const [red, green, blue] = context.getImageData(sx, sy, 1, 1).data;
      return isWaterColor(red, green, blue);
    }).length;
    return waterVotes >= 3;
  } catch {
    return false;
  }
}

function loadTileImage(src) {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function isWaterColor(red, green, blue) {
  const blueDominant = blue > red + 18 && blue >= green - 12;
  const waterRange = red >= 120 && red <= 210 && green >= 165 && green <= 230 && blue >= 175 && blue <= 240;
  return blueDominant && waterRange;
}

async function readImageGps(file) {
  if (!/^image\/jpe?g$/i.test(file.type)) return null;
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    if (view.getUint16(0, false) !== 0xffd8) return null;
    let offset = 2;
    while (offset < view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      const length = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xffe1 && readAscii(view, offset, 6) === "Exif\0\0") {
        return parseExifGps(view, offset + 6);
      }
      offset += length - 2;
    }
  } catch {
    return null;
  }
  return null;
}

function parseExifGps(view, tiffStart) {
  const little = readAscii(view, tiffStart, 2) === "II";
  const firstIfd = tiffStart + view.getUint32(tiffStart + 4, little);
  const gpsPointer = findIfdValue(view, tiffStart, firstIfd, 0x8825, little);
  if (!gpsPointer) return null;
  const gpsIfd = tiffStart + gpsPointer;
  const latRef = readIfdAscii(view, tiffStart, gpsIfd, 0x0001, little);
  const latValue = readIfdRationals(view, tiffStart, gpsIfd, 0x0002, little);
  const lngRef = readIfdAscii(view, tiffStart, gpsIfd, 0x0003, little);
  const lngValue = readIfdRationals(view, tiffStart, gpsIfd, 0x0004, little);
  if (!latRef || !latValue || !lngRef || !lngValue) return null;
  let lat = gpsToDecimal(latValue);
  let lng = gpsToDecimal(lngValue);
  if (latRef.toUpperCase().startsWith("S")) lat *= -1;
  if (lngRef.toUpperCase().startsWith("W")) lng *= -1;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function findIfdValue(view, tiffStart, ifdOffset, tag, little) {
  const count = view.getUint16(ifdOffset, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifdOffset + 2 + index * 12;
    if (view.getUint16(entry, little) === tag) {
      return view.getUint32(entry + 8, little);
    }
  }
  return 0;
}

function readIfdAscii(view, tiffStart, ifdOffset, tag, little) {
  const entry = findIfdEntry(view, ifdOffset, tag, little);
  if (!entry) return "";
  const count = view.getUint32(entry + 4, little);
  const valueOffset = count <= 4 ? entry + 8 : tiffStart + view.getUint32(entry + 8, little);
  return readAscii(view, valueOffset, count).replace(/\0/g, "");
}

function readIfdRationals(view, tiffStart, ifdOffset, tag, little) {
  const entry = findIfdEntry(view, ifdOffset, tag, little);
  if (!entry) return null;
  const count = view.getUint32(entry + 4, little);
  const valueOffset = tiffStart + view.getUint32(entry + 8, little);
  return Array.from({ length: count }, (_, index) => {
    const offset = valueOffset + index * 8;
    const numerator = view.getUint32(offset, little);
    const denominator = view.getUint32(offset + 4, little);
    return denominator ? numerator / denominator : 0;
  });
}

function findIfdEntry(view, ifdOffset, tag, little) {
  const count = view.getUint16(ifdOffset, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifdOffset + 2 + index * 12;
    if (view.getUint16(entry, little) === tag) return entry;
  }
  return 0;
}

function gpsToDecimal(parts) {
  return Number(parts[0] || 0) + Number(parts[1] || 0) / 60 + Number(parts[2] || 0) / 3600;
}

function readAscii(view, offset, length) {
  return Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join("");
}

function renderCurrentLocationMarker() {
  if (!state.map || !window.L || !state.currentLocation) return;
  const latLng = [state.currentLocation.lat, state.currentLocation.lng];
  if (!state.currentLocationMarker) {
    state.currentLocationMarker = L.circleMarker(latLng, {
      radius: 9,
      color: "#ffffff",
      fillColor: "#1b6fd8",
      fillOpacity: 0.95,
      weight: 3
    }).addTo(state.map);
    state.currentLocationMarker.bindPopup("Вы здесь");
  } else {
    state.currentLocationMarker.setLatLng(latLng);
  }
}

function renderSelectedDumpMarker() {
  if (!state.map || !window.L || !state.location) return;
  const latLng = [state.location.lat, state.location.lng];
  if (!state.selectedDumpMarker) {
    state.selectedDumpMarker = L.marker(latLng).addTo(state.map);
    state.selectedDumpMarker.bindPopup("Точка заявки");
  } else {
    state.selectedDumpMarker.setLatLng(latLng);
  }
}

function clearSelectedDumpMarker() {
  if (!state.selectedDumpMarker) return;
  state.selectedDumpMarker.remove();
  state.selectedDumpMarker = null;
}

function renderLocation() {
  if (!state.location) {
    $("#locationText").textContent = "Локация не получена";
    $("#coordsText").textContent = "Поставьте точку на карте или используйте текущее положение";
    return;
  }
  $("#locationText").textContent = "Локация готова";
  $("#coordsText").textContent = `${state.location.lat.toFixed(6)}, ${state.location.lng.toFixed(6)}`;
}

function showSuccessPanel() {
  $("#dumpForm").reset();
  $("#photoPreview").hidden = true;
  $("#dumpForm").hidden = true;
  $("#successPanel").hidden = false;
}

function resetDumpForm() {
  $("#dumpForm").reset();
  $("#cameraInput").value = "";
  state.selectedPhoto = null;
  $("#photoPreview").hidden = true;
  $("#successPanel").hidden = true;
  $("#dumpForm").hidden = false;
  state.location = null;
  renderLocation();
  clearSelectedDumpMarker();
}

function renderAuth() {
  const status = $("#authStatus");
  const summary = $("#profileSummary");
  const signOutButton = $("#signOutButton");
  if (state.profile?.email) {
    status.textContent = isAdmin() ? "Админ" : "Пользователь";
    status.style.background = isAdmin() ? "var(--focus)" : "var(--confirmed)";
    $("#signInButton").textContent = state.profile.email;
    summary.textContent = `${state.profile.name || "Пользователь"} · ${state.profile.email}`;
    signOutButton.hidden = false;
  } else if (!getGoogleClientId()) {
    status.textContent = "OAuth не настроен";
    status.style.background = "var(--pending)";
    $("#signInButton").textContent = "Подключить Google OAuth";
    $("#signInButton").title = "Укажите APP_GOOGLE_CLIENT_ID в app.js";
    summary.textContent = "Google OAuth еще не настроен.";
    signOutButton.hidden = true;
  } else {
    status.textContent = "Не вошли";
    status.style.background = "#69716d";
    $("#signInButton").textContent = "Войти через Google";
    $("#signInButton").title = "";
    summary.textContent = "Войдите, чтобы добавлять и подтверждать заявки.";
    signOutButton.hidden = true;
  }
}

function renderAccess() {
  const allowed = isAdmin();
  $$("[data-admin-only]").forEach((node) => {
    node.hidden = !allowed;
  });
}

function renderMapAndLists() {
  renderMap();
  renderLists();
}

function renderMap() {
  if (!state.map || !window.L) return;
  state.markers.forEach((marker) => marker.remove());
  state.markers.clear();
  getFilteredDumps().forEach((dump) => {
    const marker = L.circleMarker([dump.lat, dump.lng], {
      radius: dump.size === "Большая" ? 12 : dump.size === "Средняя" ? 9 : 7,
      color: getColor(dump.status),
      fillColor: getColor(dump.status),
      fillOpacity: 0.85,
      weight: 2
    }).addTo(state.map);
    marker.bindPopup(createDumpPopup(dump), {
      maxWidth: 320,
      minWidth: 260
    });
    state.markers.set(dump.id, marker);
  });
}

function createDumpPopup(dump) {
  const photoUrl = getPhotoUrl(dump);
  const thumbnailUrl = getPhotoThumbnailUrl(dump);
  const description = dump.description ? escapeHtml(dump.description) : "Без описания";
  return `
    <article class="dump-popup">
      ${thumbnailUrl ? `<a href="${escapeAttr(photoUrl)}" target="_blank" rel="noreferrer"><img class="popup-photo" src="${escapeAttr(thumbnailUrl)}" alt="Фото свалки" loading="lazy"></a>` : ""}
      <div class="popup-body">
        <div class="popup-heading">
          <span class="popup-status" style="background:${escapeAttr(getColor(dump.status))}">${escapeHtml(statusText(dump.status))}</span>
          <span class="popup-count">${dump.confirmations.length} подтвержд.</span>
        </div>
        <div class="popup-title">${escapeHtml(dump.type)}</div>
        <dl class="popup-details">
          <div><dt>Размер</dt><dd>${escapeHtml(dump.size)}</dd></div>
          <div><dt>Дата</dt><dd>${escapeHtml(formatDate(dump.createdAt))}</dd></div>
          <div><dt>Координаты</dt><dd>${dump.lat.toFixed(5)}, ${dump.lng.toFixed(5)}</dd></div>
        </dl>
        <p class="popup-description">${description}</p>
        ${photoUrl ? `<a class="popup-link" href="${escapeAttr(photoUrl)}" target="_blank" rel="noreferrer">Открыть фото</a>` : ""}
      </div>
    </article>
  `;
}

function renderLists() {
  renderDumpList();
  renderAdminList();
}

function renderDumpList() {
  const list = $("#dumpList");
  list.innerHTML = "";
  const dumps = getFilteredDumps();
  if (!dumps.length) {
    list.innerHTML = `<p class="meta">Нет точек для выбранного фильтра.</p>`;
    return;
  }
  dumps.forEach((dump) => list.appendChild(createDumpItem(dump, false)));
}

function renderAdminList() {
  const list = $("#adminList");
  list.innerHTML = "";
  if (!isAdmin()) {
    list.innerHTML = `<p class="meta">Войдите под email администратора.</p>`;
    return;
  }
  const dumps = [...state.dumps].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!dumps.length) {
    list.innerHTML = `<p class="meta">Заявок пока нет.</p>`;
    return;
  }
  dumps.forEach((dump) => list.appendChild(createDumpItem(dump, true)));
}

function createDumpItem(dump, adminMode) {
  const node = $("#dumpItemTemplate").content.firstElementChild.cloneNode(true);
  $(".badge", node).textContent = statusText(dump.status);
  $(".badge", node).style.background = getColor(dump.status);
  $("h3", node).textContent = `${dump.type} · ${dump.size}`;
  $(".meta", node).textContent = `${formatDate(dump.createdAt)} · ${dump.confirmations.length} подтвержд. · ${dump.createdByEmail}`;
  $(".desc", node).textContent = dump.description || "Без описания";
  $(".photo-link", node).href = dump.photoUrl || `https://drive.google.com/file/d/${dump.photoFileId}/view`;
  $(".focus-button", node).addEventListener("click", () => focusDump(dump));
  $(".confirm-button", node).disabled = hasConfirmed(dump) || dump.status === "rejected";
  $(".confirm-button", node).textContent = state.profile?.email
    ? (hasConfirmed(dump) ? "Уже подтверждено" : "Подтвердить")
    : "Войти и подтвердить";
  $(".confirm-button", node).addEventListener("click", () => confirmDump(dump));

  if (adminMode) {
    const admin = document.createElement("div");
    admin.className = "admin-extra";
    admin.innerHTML = `
      <div class="admin-edit-grid">
        <label>
          Тип
          <select name="editType">
            ${["Бытовой мусор", "Строительный мусор", "Промышленный мусор", "Опасные отходы", "Смешанный мусор"].map((type) => `<option value="${escapeAttr(type)}" ${dump.type === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
          </select>
        </label>
        <label>
          Размер
          <select name="editSize">
            ${["Маленькая", "Средняя", "Большая"].map((size) => `<option value="${escapeAttr(size)}" ${dump.size === size ? "selected" : ""}>${escapeHtml(size)}</option>`).join("")}
          </select>
        </label>
        <label>
          Широта
          <input name="editLat" type="number" step="0.000001" value="${escapeAttr(dump.lat)}">
        </label>
        <label>
          Долгота
          <input name="editLng" type="number" step="0.000001" value="${escapeAttr(dump.lng)}">
        </label>
      </div>
      <label>
        Описание
        <textarea name="editDescription" rows="3" placeholder="Описание">${escapeHtml(dump.description || "")}</textarea>
      </label>
      <label>
        Пояснение администратора
        <textarea name="editAdminNote" rows="2" placeholder="Пояснение администратора">${escapeHtml(dump.adminNote || "")}</textarea>
      </label>
      <div class="admin-actions">
        <button class="secondary save-edit" type="button">Сохранить</button>
        <button class="primary approve" type="button">Подтвердить</button>
        <button class="secondary reject" type="button">Отказать</button>
        <button class="danger remove" type="button">Удалить</button>
      </div>
    `;
    node.appendChild(admin);
    $(".save-edit", admin).addEventListener("click", () => adminSaveEdit(dump, admin));
    $(".approve", admin).addEventListener("click", () => adminSetStatus(dump, "confirmed", $("[name='editAdminNote']", admin).value));
    $(".reject", admin).addEventListener("click", () => adminSetStatus(dump, "rejected", $("[name='editAdminNote']", admin).value));
    $(".remove", admin).addEventListener("click", () => adminDelete(dump));
  }
  return node;
}

async function confirmDump(dump) {
  try {
    await requireReady();
    if (!state.profile?.email) return;
    dump.confirmations = [...new Set([...dump.confirmations, state.profile.email])];
    if (dump.confirmations.length > 1) dump.status = "confirmed";
    await updateDump(dump);
    await loadDumps();
    toast("Подтверждение сохранено");
  } catch (error) {
    toast(error.message);
  }
}

async function adminSetStatus(dump, status, note) {
  try {
    await requireReady();
    if (!isAdmin()) throw new Error("Недостаточно прав");
    dump.status = status;
    dump.adminNote = note.trim();
    await updateDump(dump);
    await loadDumps();
    toast(status === "confirmed" ? "Заявка подтверждена" : "Заявка отклонена");
  } catch (error) {
    toast(error.message);
  }
}

async function adminSaveEdit(dump, root) {
  try {
    await requireReady();
    if (!isAdmin()) throw new Error("Недостаточно прав");
    const lat = Number($("[name='editLat']", root).value);
    const lng = Number($("[name='editLng']", root).value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("Проверьте координаты");
    }
    if (await isWaterPoint(lat, lng)) {
      throw new Error("Точка находится на воде. Выберите место на суше");
    }
    dump.type = $("[name='editType']", root).value;
    dump.size = $("[name='editSize']", root).value;
    dump.lat = lat;
    dump.lng = lng;
    dump.description = $("[name='editDescription']", root).value.trim();
    dump.adminNote = $("[name='editAdminNote']", root).value.trim();
    await updateDump(dump);
    await loadDumps();
    toast("Заявка обновлена");
  } catch (error) {
    toast(error.message);
  }
}

async function adminDelete(dump) {
  try {
    await requireReady();
    if (!isAdmin()) throw new Error("Недостаточно прав");
    const confirmed = await showConfirmDialog({
      title: "Удалить заявку?",
      message: "Строка будет удалена из Google Sheets. Это действие нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена"
    });
    if (!confirmed) return;
    await deleteDump(dump);
    await loadDumps();
    toast("Заявка удалена");
  } catch (error) {
    toast(error.message);
  }
}

function focusDump(dump) {
  openView("mapView");
  state.map?.setView([dump.lat, dump.lng], 17);
  state.markers.get(dump.id)?.openPopup();
}

function getFilteredDumps() {
  const status = $("#statusFilter").value;
  const type = $("#typeFilter").value;
  return state.dumps.filter((dump) => {
    const statusOk = status === "all" || dump.status === status;
    const typeOk = type === "all" || dump.type === type;
    return statusOk && typeOk;
  });
}

function isAdmin() {
  const adminEmails = new Set([
    ...BOOTSTRAP_ADMIN_EMAILS,
    ...(state.config.adminEmails || [])
  ].map((email) => String(email).trim().toLowerCase()).filter(Boolean));
  return Boolean(state.profile?.email && adminEmails.has(state.profile.email));
}

function getGoogleClientId() {
  return state.config.clientId || APP_GOOGLE_CLIENT_ID;
}

function hasConfirmed(dump) {
  return Boolean(state.profile?.email && dump.confirmations.includes(state.profile.email));
}

function getColor(status) {
  if (status === "confirmed") return "#288f61";
  if (status === "rejected") return "#c8423f";
  return "#f2a93b";
}

function statusText(status) {
  if (status === "confirmed") return "Подтверждена";
  if (status === "rejected") return "Отклонена";
  return "Не подтверждена";
}

function getPhotoUrl(dump) {
  if (dump.photoUrl) return dump.photoUrl;
  if (dump.photoFileId) return `https://drive.google.com/file/d/${dump.photoFileId}/view`;
  return "";
}

function getPhotoThumbnailUrl(dump) {
  if (dump.photoFileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(dump.photoFileId)}&sz=w640`;
  return dump.photoUrl || "";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата неизвестна";
  return date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function openView(viewId) {
  const button = $(`.tab-button[data-view="${viewId}"]`);
  const panel = $("#" + viewId);
  if (!panel) return;
  $$(".panel").forEach((item) => item.classList.remove("active"));
  panel.classList.add("active");
  if (button) {
    $$(".tab-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  }
  state.currentView = viewId;
  setTimeout(() => state.map?.invalidateSize(), 80);
}

function signOut() {
  clearSession();
  renderAuth();
  renderAccess();
  renderLists();
  toast("Вы вышли из аккаунта");
}

function showConfirmDialog({ title, message, confirmText = "ОК", cancelText = "Отмена" }) {
  return new Promise((resolve) => {
    const backdrop = $("#dialogBackdrop");
    const titleNode = $("#dialogTitle");
    const messageNode = $("#dialogMessage");
    const confirmButton = $("#dialogConfirmButton");
    const cancelButton = $("#dialogCancelButton");
    titleNode.textContent = title;
    messageNode.textContent = message;
    confirmButton.textContent = confirmText;
    cancelButton.textContent = cancelText;
    backdrop.hidden = false;

    const finish = (value) => {
      backdrop.hidden = true;
      confirmButton.onclick = null;
      cancelButton.onclick = null;
      backdrop.onclick = null;
      resolve(value);
    };

    confirmButton.onclick = () => finish(true);
    cancelButton.onclick = () => finish(false);
    backdrop.onclick = (event) => {
      if (event.target === backdrop) finish(false);
    };
  });
}

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.dataset.originalText ||= button.textContent;
  button.textContent = busy ? "Сохраняем..." : button.dataset.originalText;
}

let toastTimer = 0;
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 4200);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
