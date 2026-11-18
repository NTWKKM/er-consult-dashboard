"use client";

import React, { useEffect, useLayoutEffect, useRef, useId, useCallback } from "react";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusedRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  const restoreFocus = useCallback((restoreTarget: HTMLElement | null) => {
    if (
      restoreTarget &&
      restoreTarget.isConnected &&
      !restoreTarget.hasAttribute("disabled")
    ) {
      restoreTarget.focus();
      if (document.activeElement === restoreTarget) {
        return;
      }
    }
    const fallback =
      document.querySelector<HTMLElement>(
        'main button:not([disabled]), main a[href], main input:not([disabled]), main select:not([disabled]), [role="main"] button:not([disabled]), nav a[href], button:not([disabled])'
      ) ?? document.body;
    fallback?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;

    wasOpenRef.current = true;
    prevFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the cancel button immediately by default (safer UX for destructive actions)
    cancelRef.current?.focus();

    // Mark stable app shell (or surrounding sibling containers in isolated tests) inert
    // so existing and newly added background controls remain non-interactive while open.
    const inertApplied: HTMLElement[] = [];
    const appShell = document.getElementById("app-shell-root");
    if (appShell) {
      if (!appShell.hasAttribute("inert")) {
        appShell.setAttribute("inert", "");
        inertApplied.push(appShell);
      }
    } else if (backdropRef.current?.parentElement) {
      Array.from(backdropRef.current.parentElement.children).forEach((sibling) => {
        if (
          sibling instanceof HTMLElement &&
          sibling !== backdropRef.current &&
          !sibling.hasAttribute("inert") &&
          !sibling.hasAttribute("aria-live") &&
          !sibling.querySelector("[aria-live]")
        ) {
          sibling.setAttribute("inert", "");
          inertApplied.push(sibling);
        }
      });
    }

    return () => {
      inertApplied.forEach((el) => el.removeAttribute("inert"));
    };
  }, [isOpen]);

  // Restore focus in a passive effect cleanup so DOM deletions in the same commit
  // complete before checking `isConnected` or selecting a fallback outside the removed subtree.
  useEffect(() => {
    if (!isOpen) return;
    return () => {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        const targetToRestore = prevFocusedRef.current;
        prevFocusedRef.current = null;
        restoreFocus(targetToRestore);
      }
    };
  }, [isOpen, restoreFocus]);

  // Close on Escape key and contain Tab / Shift+Tab focus inside open dialog
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([aria-hidden="true"]), [href]:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([disabled]):not([aria-hidden="true"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !dialogRef.current.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: (
        <svg aria-hidden="true" className="w-7 h-7 text-bad" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
      confirmBtn: "bg-bad hover:opacity-90 text-paper",
      iconBg: "bg-bad-soft border border-bad/30",
    },
    warning: {
      icon: (
        <svg aria-hidden="true" className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      confirmBtn: "bg-accent hover:opacity-90 text-accent-ink",
      iconBg: "bg-accent-soft border border-accent/30",
    },
    info: {
      icon: (
        <svg aria-hidden="true" className="w-7 h-7 text-cool" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      confirmBtn: "bg-cool hover:opacity-90 text-paper",
      iconBg: "bg-cool-soft border border-cool/30",
    },
  };

  const style = variantStyles[variant];

  const modalContent = (
    <div
      ref={backdropRef}
      data-testid="modal-backdrop"
      className="fixed inset-0 bg-paper-3/80 flex items-center justify-center z-[110] p-4 animate-fade-in overscroll-contain"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        data-testid="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-paper-2 border border-rule rounded-[10px] max-w-md w-full p-6 animate-scale-in overscroll-contain max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 sm:gap-4 mb-4">
          <div className={`p-2 rounded-[6px] ${style.iconBg} shrink-0`}>{style.icon}</div>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-lg font-medium text-ink break-words">{title}</h3>
            <p id={descriptionId} className="text-sm text-ink-2 mt-1 break-words">{message}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-end mt-6">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 rounded-[6px] font-medium text-sm bg-paper-3 border border-rule-2 text-ink hover:border-ink-2 transition-colors whitespace-nowrap tap-feedback"
          >
            {cancelText}
          </button>
          <button
            type="button"
            data-variant={variant}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-[6px] font-medium text-sm transition-opacity whitespace-nowrap tap-feedback ${style.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
