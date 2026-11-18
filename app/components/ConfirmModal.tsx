"use client";

import React, { useEffect, useRef, useId } from "react";

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
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      // Focus the cancel button by default (safer UX for destructive actions)
      setTimeout(() => cancelRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
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

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 bg-paper-3/80 flex items-center justify-center z-[110] p-4 animate-fade-in overscroll-contain"
      onClick={onCancel}
    >
      <div
        data-testid="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-paper-2 border border-rule rounded-[10px] max-w-md w-full p-6 animate-scale-in overscroll-contain"
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
}
