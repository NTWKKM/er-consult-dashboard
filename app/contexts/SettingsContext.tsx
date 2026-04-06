"use client";

import { createContext, useContext, useEffect, useCallback, ReactNode, useSyncExternalStore } from "react";

interface SettingsContextType {
  darkMode: boolean;
  soundEnabled: boolean;
  toggleDarkMode: () => void;
  toggleSound: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  darkMode: false,
  soundEnabled: false,
  toggleDarkMode: () => {},
  toggleSound: () => {},
});

// For subscribing to window events (both cross-tab and same-tab)
const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("settings-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("settings-change", callback);
  };
};

// Stable snapshot function references
const getDarkModeSnapshot = () => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("darkMode");
    return saved !== null ? saved === "true" : false;
};

const getSoundEnabledSnapshot = () => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("soundEnabled");
    return saved !== null ? saved === "true" : false;
};

const darkModeServerSnapshot = () => false;
const soundEnabledServerSnapshot = () => false;

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
    localStorage.setItem("darkMode", String(nextValue));
    notifyChange();
  }, [darkMode, notifyChange]);

  const toggleSound = useCallback(() => {
    const nextValue = !soundEnabled;
    localStorage.setItem("soundEnabled", String(nextValue));
    notifyChange();
  }, [soundEnabled, notifyChange]);

  return (
    <SettingsContext.Provider value={{ darkMode, soundEnabled, toggleDarkMode, toggleSound }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
}
