"use client";

import { createContext, useContext, useEffect, useCallback, ReactNode, useSyncExternalStore } from "react";

interface SettingsContextType {
  darkMode: boolean;
  soundEnabled: boolean;
  displayMode: "card" | "table";
  toggleDarkMode: () => void;
  toggleSound: () => void;
  setDisplayMode: (mode: "card" | "table") => void;
}

const SettingsContext = createContext<SettingsContextType>({
  darkMode: false,
  soundEnabled: false,
  displayMode: "card",
  toggleDarkMode: () => {},
  toggleSound: () => {},
  setDisplayMode: () => {},
});

const memoryFallbackByStorage = new WeakMap<object, Map<string, string>>();
const restrictedMemoryFallback = new Map<string, string>();

function getStorageAndFallback(): { storage: Storage | null; fallback: Map<string, string> } {
  if (typeof window === "undefined") {
    return { storage: null, fallback: restrictedMemoryFallback };
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage !== "object") {
      return { storage: null, fallback: restrictedMemoryFallback };
    }
    let fallback = memoryFallbackByStorage.get(storage);
    if (!fallback) {
      fallback = new Map<string, string>();
      memoryFallbackByStorage.set(storage, fallback);
    }
    return { storage, fallback };
  } catch {
    return { storage: null, fallback: restrictedMemoryFallback };
  }
}

// For subscribing to window events (both cross-tab and same-tab)
const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    const { fallback } = getStorageAndFallback();
    if (event.key === null) {
      fallback.clear();
    } else {
      fallback.delete(event.key);
    }
    callback();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener("settings-change", callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("settings-change", callback);
  };
};

function safeGetItem(key: string): string | null {
  const { storage, fallback } = getStorageAndFallback();
  if (fallback.has(key)) {
    return fallback.get(key) ?? null;
  }
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  const { storage, fallback } = getStorageAndFallback();
  if (!storage) {
    fallback.set(key, value);
    return;
  }
  try {
    storage.setItem(key, value);
    fallback.delete(key);
  } catch {
    // Retain setting in session memory when storage quota/security restrictions block writes
    fallback.set(key, value);
  }
}

// Stable snapshot function references
const getDarkModeSnapshot = () => {
    const saved = safeGetItem("darkMode");
    return saved !== null ? saved === "true" : false;
};

const getSoundEnabledSnapshot = () => {
    const saved = safeGetItem("soundEnabled");
    return saved !== null ? saved === "true" : false;
};

const getDisplayModeSnapshot = (): "card" | "table" => {
    const saved = safeGetItem("dashboard_displayMode");
    return saved === "table" ? "table" : "card";
};

const darkModeServerSnapshot = () => false;
const soundEnabledServerSnapshot = () => false;
const displayModeServerSnapshot = (): "card" | "table" => "card";

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Use modern React store synchronization for safe SSR/Hydration
  const darkMode = useSyncExternalStore(
    subscribe,
    getDarkModeSnapshot,
    darkModeServerSnapshot
  );
  
  const soundEnabled = useSyncExternalStore(
    subscribe,
    getSoundEnabledSnapshot,
    soundEnabledServerSnapshot
  );

  const displayMode = useSyncExternalStore(
    subscribe,
    getDisplayModeSnapshot,
    displayModeServerSnapshot
  );

  // Helper to trigger UI updates in the current tab
  const notifyChange = useCallback(() => {
    window.dispatchEvent(new Event("settings-change"));
  }, []);

  // Synchronize dark class on <html> element
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    const nextValue = !darkMode;
    safeSetItem("darkMode", String(nextValue));
    notifyChange();
  }, [darkMode, notifyChange]);

  const toggleSound = useCallback(() => {
    const nextValue = !soundEnabled;
    safeSetItem("soundEnabled", String(nextValue));
    notifyChange();
  }, [soundEnabled, notifyChange]);

  const setDisplayMode = useCallback((mode: "card" | "table") => {
    safeSetItem("dashboard_displayMode", mode);
    notifyChange();
  }, [notifyChange]);

  return (
    <SettingsContext.Provider value={{ darkMode, soundEnabled, displayMode, toggleDarkMode, toggleSound, setDisplayMode }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
