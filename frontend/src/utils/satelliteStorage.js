/**
 * Bhu-Rakshak 3D Terrain Model: Offline Satellite Storage & Cache Engine
 *
 * Provides persistent local storage for satellite imagery:
 * 1. When ONLINE: Fetches live high-res satellite stream from ArcGIS World Imagery,
 *    applies it to the 3D terrain, and caches the raw image blob into browser IndexedDB.
 * 2. When OFFLINE: Automatically retrieves the last loaded 3D satellite image from
 *    IndexedDB, reconstructs the texture, and applies it to the 3D terrain seamlessly.
 * 3. When RE-CONNECTED: Automatically refreshes the live stream and updates the cache.
 */

const DB_NAME = "BhuRakshakTerrainDB";
const STORE_NAME = "satellite_cache";
const DB_VERSION = 1;
const META_KEY = "bhu_rakshak_satellite_meta";

function openDB() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return resolve(null);
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => {
      console.warn("[SatelliteStorage] IndexedDB open error:", e);
      resolve(null);
    };
  });
}

/**
 * Persists satellite image blob into IndexedDB with metadata in localStorage.
 */
export async function saveSatelliteTexture(blob, meta = {}) {
  try {
    const db = await openDB();
    const now = new Date();
    const metadata = {
      cachedAt: now.toISOString(),
      dateString: now.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      source: meta.source || "ArcGIS Live Satellite Stream",
      isOfflineAvailable: true,
      sizeBytes: blob?.size || 0,
    };

    if (db && blob) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(blob, "last_satellite_image");
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e);
      });
    }

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(META_KEY, JSON.stringify(metadata));
    }
    return metadata;
  } catch (err) {
    console.warn("[SatelliteStorage] Could not save satellite texture:", err);
    return null;
  }
}

/**
 * Loads the last cached satellite image from IndexedDB.
 * Returns an object with object URL and metadata, or null.
 */
export async function loadSatelliteTexture() {
  try {
    const metaStr = typeof localStorage !== "undefined" ? localStorage.getItem(META_KEY) : null;
    const metadata = metaStr ? JSON.parse(metaStr) : null;

    const db = await openDB();
    if (!db) return null;

    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get("last_satellite_image");
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e);
    });

    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      return {
        url: objectUrl,
        blob,
        metadata: metadata || {
          dateString: "Previously Saved Online Session",
          isOfflineAvailable: true,
        },
      };
    }
    return null;
  } catch (err) {
    console.warn("[SatelliteStorage] Could not load cached satellite texture:", err);
    return null;
  }
}

/**
 * Retrieves metadata about the cached satellite texture synchronously.
 */
export function getSatelliteMeta() {
  try {
    if (typeof localStorage !== "undefined") {
      const data = localStorage.getItem(META_KEY);
      return data ? JSON.parse(data) : null;
    }
  } catch {}
  return null;
}
