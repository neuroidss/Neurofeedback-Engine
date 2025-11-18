// services/cacheService.ts
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

const DB_NAME = 'neurofeedback-engine-cache';
const DB_VERSION = 1;
const PROTOCOL_STORE = 'protocols';
const SOURCE_STORE = 'sources';
const VECTOR_STORE = 'vectors';

interface AtlasDBSchema extends DBSchema {
  [PROTOCOL_STORE]: {
    key: string; // e.g., 'protocol-gamma-focus-trainer'
    value: any; // The full protocol object (tool definition)
  };
  [SOURCE_STORE]: {
    key: string; // The canonical URL of the source
    value: any; // The full source object, including textContent
  };
   [VECTOR_STORE]: {
    key: string; // e.g., 'vector-db'
    value: any; // The entire vector DB array
  };
}

let dbPromise: Promise<IDBPDatabase<AtlasDBSchema>> | null = null;

const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<AtlasDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PROTOCOL_STORE)) {
          db.createObjectStore(PROTOCOL_STORE);
        }
        if (!db.objectStoreNames.contains(SOURCE_STORE)) {
          db.createObjectStore(SOURCE_STORE);
        }
        if (!db.objectStoreNames.contains(VECTOR_STORE)) {
          db.createObjectStore(VECTOR_STORE);
        }
      },
    });
  }
  return dbPromise;
};

// --- General Purpose Key-Value Store ---

export const getCache = async (storeName: 'protocols' | 'sources' | 'vectors', key: string): Promise<any | null> => {
  try {
    const db = await initDB();
    const entry = await db.get(storeName, key);
    return entry ? entry : null;
  } catch (error) {
    console.error(`Failed to get from '${storeName}' cache:`, error);
    return null;
  }
};

export const setCache = async (storeName: 'protocols' | 'sources' | 'vectors', key: string, value: any): Promise<void> => {
  try {
    const db = await initDB();
    await db.put(storeName, value, key);
  } catch (error) {
    console.error(`Failed to set in '${storeName}' cache:`, error);
  }
};

export const getAllFromCache = async (storeName: 'protocols' | 'sources' | 'vectors'): Promise<any[]> => {
    try {
        const db = await initDB();
        return await db.getAll(storeName);
    } catch (error) {
        console.error(`Failed to get all from '${storeName}' cache:`, error);
        return [];
    }
}

export const clearAllCaches = async () => {
    try {
        const db = await initDB();
        await db.clear(PROTOCOL_STORE);
        await db.clear(SOURCE_STORE);
        await db.clear(VECTOR_STORE);
        console.log("All IndexedDB caches cleared.");
    } catch (error) {
        console.error("Failed to clear IndexedDB caches:", error);
    }
}