import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { SettingsProvider, useSettings } from "@/app/contexts/SettingsContext";

// ---------------------------------------------------------------------------
// Helper component that exposes the context values for testing
// ---------------------------------------------------------------------------
function SettingsConsumer() {
  const { darkMode, soundEnabled, toggleDarkMode, toggleSound } = useSettings();
  return (
    <div>
      <span data-testid="dark-mode">{String(darkMode)}</span>
      <span data-testid="sound-enabled">{String(soundEnabled)}</span>
      <button data-testid="toggle-dark" onClick={toggleDarkMode}>
        Toggle Dark
      </button>
      <button data-testid="toggle-sound" onClick={toggleSound}>
        Toggle Sound
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------
function mockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const key in store) delete store[key];
    }),
    store,
  };
}

describe("SettingsContext", () => {
  let storage: ReturnType<typeof mockLocalStorage>;
  let originalLocalStorage: PropertyDescriptor | undefined;

  beforeEach(() => {
    // Capture the original localStorage before overriding
    originalLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
    
    storage = mockLocalStorage();
    Object.defineProperty(window, "localStorage", {
      value: storage,
      writable: true,
      configurable: true, // Ensure it can be redefined later
    });
    // Reset document classList dark state
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    // Restore the original localStorage
    if (originalLocalStorage) {
      Object.defineProperty(window, "localStorage", originalLocalStorage);
    }
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Snapshot functions (getDarkModeSnapshot / getSoundEnabledSnapshot)
  // -------------------------------------------------------------------------
  describe("initial state from localStorage", () => {
    it("darkMode defaults to false when localStorage has no value", () => {
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );
      expect(screen.getByTestId("dark-mode").textContent).toBe("false");
    });

    it("soundEnabled defaults to false when localStorage has no value", () => {
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );
      expect(screen.getByTestId("sound-enabled").textContent).toBe("false");
    });

    it("reads darkMode=true from localStorage", () => {
      storage.store["darkMode"] = "true";
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );
      expect(screen.getByTestId("dark-mode").textContent).toBe("true");
    });

    it("reads soundEnabled=true from localStorage", () => {
      storage.store["soundEnabled"] = "true";
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );
      expect(screen.getByTestId("sound-enabled").textContent).toBe("true");
    });
  });

  // -------------------------------------------------------------------------
  // toggleDarkMode
  // -------------------------------------------------------------------------
  describe("toggleDarkMode", () => {
    it("writes the toggled value to localStorage", () => {
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("toggle-dark"));
      });

      expect(storage.setItem).toHaveBeenCalledWith("darkMode", "true");
    });

    it("dispatches settings-change event to trigger re-render", () => {
      const spy = vi.spyOn(window, "dispatchEvent");
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("toggle-dark"));
      });

      const dispatched = spy.mock.calls.find(
        ([evt]) => evt instanceof Event && evt.type === "settings-change"
      );
      expect(dispatched).toBeTruthy();
    });

    it("toggles from false to true then back to false on two clicks", () => {
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );
      const btn = screen.getByTestId("toggle-dark");

      act(() => { fireEvent.click(btn); });
      expect(storage.setItem).toHaveBeenLastCalledWith("darkMode", "true");

      // Update store to reflect the persisted value
      storage.store["darkMode"] = "true";

      act(() => {
        // Re-trigger a settings-change so the snapshot re-reads from storage
        window.dispatchEvent(new Event("settings-change"));
      });

      act(() => { fireEvent.click(btn); });
      expect(storage.setItem).toHaveBeenLastCalledWith("darkMode", "false");
    });
  });

  // -------------------------------------------------------------------------
  // toggleSound
  // -------------------------------------------------------------------------
  describe("toggleSound", () => {
    it("writes the toggled value to localStorage", () => {
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("toggle-sound"));
      });

      expect(storage.setItem).toHaveBeenCalledWith("soundEnabled", "true");
    });

    it("dispatches settings-change event", () => {
      const spy = vi.spyOn(window, "dispatchEvent");
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("toggle-sound"));
      });

      const dispatched = spy.mock.calls.find(
        ([evt]) => evt instanceof Event && evt.type === "settings-change"
      );
      expect(dispatched).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // useSettings default behavior
  // -------------------------------------------------------------------------
  describe("useSettings default behavior", () => {
    it("does NOT throw when used inside SettingsProvider", () => {
      // Context has a default value so no throw expected in this implementation
      expect(() =>
        render(
          <SettingsProvider>
            <SettingsConsumer />
          </SettingsProvider>
        )
      ).not.toThrow();
    });

    it("does NOT throw when used outside SettingsProvider (returns default)", () => {
      expect(() => render(<SettingsConsumer />)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // dark class synchronization on <html>
  // -------------------------------------------------------------------------
  describe("dark class on <html>", () => {
    it("adds 'dark' class to <html> when darkMode is true", () => {
      storage.store["darkMode"] = "true";
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("removes 'dark' class from <html> when darkMode is false", () => {
      document.documentElement.classList.add("dark");
      storage.store["darkMode"] = "false";
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // subscribe — cross-tab via storage event
  // -------------------------------------------------------------------------
  describe("cross-tab subscribe", () => {
    it("re-reads darkMode from localStorage on 'storage' event", () => {
      render(
        <SettingsProvider>
          <SettingsConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId("dark-mode").textContent).toBe("false");

      // Simulate another tab writing darkMode
      storage.store["darkMode"] = "true";
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: "darkMode", newValue: "true" }));
      });

      expect(screen.getByTestId("dark-mode").textContent).toBe("true");
    });
  });
});