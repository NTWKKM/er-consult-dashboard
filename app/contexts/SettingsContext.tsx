"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

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

function getInitialValue(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const saved = localStorage.getItem(key);
  return saved !== null ? saved === "true" : fallback;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(() => getInitialValue("darkMode", false));
  const [soundEnabled, setSoundEnabled] = useState(() => getInitialValue("soundEnabled", false));
  const mounted = typeof window !== "undefined";

  // Apply dark class to <html> element
  useEffect(() => {
    if (mounted) {
      document.documentElement.classList.toggle("dark", darkMode);
    }
  }, [darkMode, mounted]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("darkMode", String(next));
      return next;
    });
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("soundEnabled", String(next));
      return next;
    });
  }, []);

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
