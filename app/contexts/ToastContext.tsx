"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from "react";

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;
  undoAction?: () => void;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState("");
  const [politeAnnouncement, setPoliteAnnouncement] = useState("");
  const pendingAssertiveRef = useRef<string[]>([]);
  const pendingPoliteRef = useRef<string[]>([]);
  const flushScheduledRef = useRef(false);
  const autoDismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = autoDismissTimersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      autoDismissTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const timers = autoDismissTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);

      if (toast.type === "error" || toast.type === "warning") {
        pendingAssertiveRef.current.push(toast.message);
      } else {
        pendingPoliteRef.current.push(toast.message);
      }

      if (!flushScheduledRef.current) {
        flushScheduledRef.current = true;
        queueMicrotask(() => {
          flushScheduledRef.current = false;
          if (pendingAssertiveRef.current.length > 0) {
            const batch = pendingAssertiveRef.current.splice(0);
            setAssertiveAnnouncement(batch.join(" "));
          }
          if (pendingPoliteRef.current.length > 0) {
            const batch = pendingPoliteRef.current.splice(0);
            setPoliteAnnouncement(batch.join(" "));
          }
        });
      }

      const duration = toast.duration ?? 4000;
      if (duration > 0) {
        const timer = setTimeout(() => {
          autoDismissTimersRef.current.delete(id);
          removeToast(id);
        }, duration);
        autoDismissTimersRef.current.set(id, timer);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer
        toasts={toasts}
        onRemove={removeToast}
        assertiveAnnouncement={assertiveAnnouncement}
        politeAnnouncement={politeAnnouncement}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// — Toast UI —

function ToastContainer({
  toasts,
  onRemove,
  assertiveAnnouncement,
  politeAnnouncement,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
  assertiveAnnouncement: string;
  politeAnnouncement: string;
}) {
  return (
    <>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertiveAnnouncement}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {politeAnnouncement}
      </div>
      <div className="fixed bottom-20 lg:bottom-6 right-3 left-3 sm:left-auto sm:right-4 z-[100] flex flex-col gap-2 sm:max-w-sm sm:w-full pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </div>
    </>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRemove = useCallback(() => {
    if (exitTimerRef.current !== null) return;
    setIsExiting(true);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      onRemove(toast.id);
    }, 300);
  }, [toast.id, onRemove]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Start exit animation 300ms before removal
    const duration = toast.duration ?? 4000;
    if (duration > 300) {
      const timer = setTimeout(() => setIsExiting(true), duration - 300);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  const colorMap = {
    success: "bg-paper-2 border-ok text-ink",
    error: "bg-paper-2 border-bad text-ink",
    info: "bg-paper-2 border-cool text-ink",
    warning: "bg-paper-2 border-accent text-ink",
  };

  const iconMap = {
    success: (
      <svg aria-hidden="true" className="w-5 h-5 text-ok shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg aria-hidden="true" className="w-5 h-5 text-bad shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    info: (
      <svg aria-hidden="true" className="w-5 h-5 text-cool shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg aria-hidden="true" className="w-5 h-5 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  };

  const messageId = `toast-msg-${toast.id}`;

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[6px] border border-l-4 text-sm font-medium transition-opacity duration-200 ${colorMap[toast.type]} ${
        isExiting ? "opacity-0" : "opacity-100 animate-slide-in-right"
      }`}
    >
      {iconMap[toast.type]}
      <span id={messageId} className="flex-1 min-w-0 break-words">
        {toast.message}
      </span>
      {toast.undoAction && (
        <button
          type="button"
          aria-describedby={messageId}
          onClick={() => {
            toast.undoAction?.();
            handleRemove();
          }}
          className="px-2 py-0.5 bg-paper-3 border border-rule hover:border-rule-2 rounded-[4px] text-xs font-medium transition-colors"
        >
          Undo
        </button>
      )}
      <button
        type="button"
        aria-label="ปิดการแจ้งเตือน"
        onClick={handleRemove}
        className="text-muted hover:text-ink transition-colors ml-1"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
