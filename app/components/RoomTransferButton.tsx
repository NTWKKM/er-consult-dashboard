"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ROOMS, RoomName } from "../../lib/constants";
import { transferConsultRoom } from "../../lib/db";
import { useToast } from "../contexts/ToastContext";

interface PortalMenuPosition {
  top: number;
  left: number;
  openUpward: boolean;
}

interface RoomTransferButtonProps {
  consultId: string;
  currentRoom: RoomName;
  onTransferStart?: () => void;
  onTransferEnd?: (success?: boolean) => void;
  onOpenChange?: (isOpen: boolean) => void;
  disabled?: boolean;
}

export const RoomTransferButton: React.FC<RoomTransferButtonProps> = ({
  consultId,
  currentRoom,
  onTransferStart,
  onTransferEnd,
  onOpenChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<PortalMenuPosition>({
    top: 0,
    left: 0,
    openUpward: false,
  });
  const [isTransferring, setIsTransferring] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const { addToast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const transferInFlightRef = useRef(false);

  // Reorder rooms to put SSW first
  const sortedRooms = useMemo(() => {
    return [...ROOMS].sort((a, b) => {
      if (a === "SSW") return -1;
      if (b === "SSW") return 1;
      return 0; // Maintain original order for others
    });
  }, []);

  const effectiveOpen = isOpen && !disabled;

  const handleTransfer = useCallback(async (newRoom: RoomName) => {
    if (transferInFlightRef.current || disabled) return;

    if (newRoom === currentRoom) {
      setIsOpen(false);
      setFocusedIndex(-1);
      return;
    }

    try {
      transferInFlightRef.current = true;
      setIsTransferring(true);
      onTransferStart?.();
      setIsOpen(false);
      setFocusedIndex(-1);
      
      const { transferred, backgroundPromise } = await transferConsultRoom(
        consultId, 
        newRoom,
        (err) => {
          console.error("Background transfer error:", err);
          addToast({ message: "เครือข่ายไม่เสถียร การย้ายห้องอาจล่าช้ากว่าปกติ", type: "error" });
        }
      );
      if (transferred) {
        addToast({ message: `ย้ายเคสไปยัง ${newRoom} สำเร็จ`, type: "success" });
        onTransferEnd?.(true); // success callback
        if (backgroundPromise) {
            backgroundPromise.catch(() => {});
        }
      } else {
        addToast({ 
          message: "ไม่สามารถย้ายห้องได้: เคสนี้ถูกอัปเดตหรือปิดไปแล้ว", 
          type: "error" 
        });
      }
    } catch (error) {
      console.error("Transfer error:", error);
      addToast({ message: "ไม่สามารถย้ายห้องได้ กรุณาลองใหม่", type: "error" });
    } finally {
      transferInFlightRef.current = false;
      setIsTransferring(false);
    }
  }, [consultId, currentRoom, addToast, onTransferStart, onTransferEnd, disabled]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = dropdownRef.current?.contains(target) ?? false;
      const inMenu = listboxRef.current?.contains(target) ?? false;
      if (!inTrigger && !inMenu) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Return early if focus is not within the trigger or portaled listbox
      const active = document.activeElement;
      const inTrigger = dropdownRef.current?.contains(active) ?? false;
      const inMenu = listboxRef.current?.contains(active) ?? false;
      if (!inTrigger && !inMenu) return;

      if (event.key === "Escape") {
        setIsOpen(false);
        setFocusedIndex(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((prev) => (prev < sortedRooms.length - 1 ? prev + 1 : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : sortedRooms.length - 1));
      } else if (event.key === "Enter" && focusedIndex >= 0) {
        event.preventDefault();
        handleTransfer(sortedRooms[focusedIndex]);
      }
    };

    if (effectiveOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [effectiveOpen, focusedIndex, sortedRooms, handleTransfer]);

  useEffect(() => {
    if (effectiveOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [effectiveOpen, focusedIndex]);

  useEffect(() => {
    onOpenChange?.(effectiveOpen);
  }, [effectiveOpen, onOpenChange]);

  const computeMenuPlacement = useCallback((): PortalMenuPosition => {
    if (!dropdownRef.current || typeof window === "undefined") {
      return { top: 0, left: 0, openUpward: false };
    }
    const rect = dropdownRef.current.getBoundingClientRect();
    const menuRect = listboxRef.current?.getBoundingClientRect();
    const fallbackWidth =
      (parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16) * 10;
    const menuWidth =
      menuRect && menuRect.width > 0
        ? menuRect.width
        : listboxRef.current?.offsetWidth || fallbackWidth;
    const menuHeight =
      menuRect && menuRect.height > 0
        ? menuRect.height
        : listboxRef.current?.offsetHeight || 232;

    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const margin = 8;
    const gap = 4;

    // Prefer right-aligned to trigger; fall back to left-aligned; clamp within viewport
    let left: number;
    const rightAlignedLeft = rect.right - menuWidth;
    if (rightAlignedLeft >= margin && rect.right <= viewportWidth - margin) {
      left = rightAlignedLeft;
    } else if (rect.left >= margin && rect.left + menuWidth <= viewportWidth - margin) {
      left = rect.left;
    } else {
      const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
      left = Math.min(Math.max(rightAlignedLeft, margin), maxLeft);
    }

    // Flip upward automatically when bottom viewport space is insufficient (e.g. Table View bottom rows)
    const spaceBelow = viewportHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const top = openUpward
      ? Math.max(margin, rect.top - gap - menuHeight)
      : Math.min(rect.bottom + gap, Math.max(margin, viewportHeight - menuHeight - margin));

    return { top, left, openUpward };
  }, []);

  const updateMenuPlacement = useCallback(() => {
    setMenuPos(computeMenuPlacement());
  }, [computeMenuPlacement]);

  useEffect(() => {
    if (!effectiveOpen) return;
    // Re-measure after listbox paints so real menuHeight/menuWidth are accounted for
    const rafId = window.requestAnimationFrame(updateMenuPlacement);
    window.addEventListener("resize", updateMenuPlacement);
    // Capture-phase scroll listener tracks both window and nested scroll containers (e.g., Table View)
    window.addEventListener("scroll", updateMenuPlacement, { passive: true, capture: true });
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateMenuPlacement);
      window.removeEventListener("scroll", updateMenuPlacement, { capture: true });
    };
  }, [effectiveOpen, updateMenuPlacement]);

  const handleToggle = useCallback(() => {
    if (!effectiveOpen) {
      updateMenuPlacement();
      setFocusedIndex(Math.max(0, sortedRooms.indexOf(currentRoom)));
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setFocusedIndex(-1);
    }
  }, [effectiveOpen, updateMenuPlacement, sortedRooms, currentRoom]);

  const listboxElement = effectiveOpen ? (
    <div
      ref={listboxRef}
      role="listbox"
      data-placement={menuPos.openUpward ? "top" : "bottom"}
      style={{
        top: `${menuPos.top}px`,
        left: `${menuPos.left}px`,
      }}
      className="fixed z-[100] w-40 rounded-[6px] border border-rule bg-paper-2 overflow-hidden animate-fade-in"
    >
      <div className="px-3 py-2 text-xs font-medium border-b border-rule bg-paper-3 text-muted">
        ย้ายผู้ป่วยไปยัง...
      </div>
      <div className="max-h-56 overflow-y-auto">
        {sortedRooms.map((room, index) => (
          <button
            key={room}
            type="button"
            ref={(el) => { itemRefs.current[index] = el; }}
            onClick={() => handleTransfer(room)}
            disabled={isTransferring || disabled}
            tabIndex={focusedIndex === index ? 0 : -1}
            role="option"
            aria-selected={room === currentRoom}
            className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between outline-none ${
              isTransferring || disabled
                ? "opacity-50 cursor-not-allowed"
                : room === currentRoom
                  ? "bg-cool-soft text-cool"
                  : focusedIndex === index
                    ? "bg-paper-3 text-ink"
                    : "text-ink-2 hover:bg-paper-3"
            }`}
          >
            <span>{room}</span>
            {room === currentRoom && (
              <svg aria-hidden="true" className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative inline-block ml-1" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isTransferring || disabled}
        title={disabled ? "กำลังดำเนินการงานอื่นอยู่…" : "เปลี่ยนห้อง"}
        aria-label="เปลี่ยนห้อง"
        aria-expanded={effectiveOpen}
        aria-haspopup="listbox"
        className={`p-1 rounded-[6px] transition-colors duration-200 text-cool ${
          isTransferring ? "opacity-50 cursor-not-allowed" : "hover:bg-cool-soft"
        }`}
      >
        {isTransferring ? (
          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full motion-safe:animate-spin"></div>
        ) : (
          <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        )}
      </button>

      {listboxElement && typeof document !== "undefined"
        ? createPortal(listboxElement, document.body)
        : null}
    </div>
  );
};
