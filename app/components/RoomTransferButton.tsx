"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ROOMS, RoomName } from "../../lib/constants";
import { transferConsultRoom } from "../../lib/db";
import { useToast } from "../contexts/ToastContext";

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
  const [alignLeft, setAlignLeft] = useState(false);
  const [clampOffsetLeft, setClampOffsetLeft] = useState<number | null>(null);
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

  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(Math.max(0, sortedRooms.indexOf(currentRoom)));
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, currentRoom, sortedRooms]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  const handleTransfer = useCallback(async (newRoom: RoomName) => {
    if (transferInFlightRef.current || disabled) return;

    if (newRoom === currentRoom) {
      setIsOpen(false);
      return;
    }

    try {
      transferInFlightRef.current = true;
      setIsTransferring(true);
      onTransferStart?.();
      setIsOpen(false);
      
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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Return early if focus is not within the dropdown
      if (!dropdownRef.current?.contains(document.activeElement)) return;

      if (event.key === "Escape") {
        setIsOpen(false);
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

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, focusedIndex, sortedRooms, handleTransfer]);

  useEffect(() => {
    if (focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);



  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const getClippingAncestors = useCallback((): HTMLElement[] => {
    if (!dropdownRef.current || typeof window === "undefined") return [];
    const clippingAncestors: HTMLElement[] = [];
    let ancestor: HTMLElement | null = dropdownRef.current.parentElement;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      const style = window.getComputedStyle(ancestor);
      const overflowX = style.overflowX || style.overflow;
      const overflowY = style.overflowY || style.overflow;
      const isClipping =
        overflowX === "auto" ||
        overflowX === "scroll" ||
        overflowX === "hidden" ||
        overflowX === "clip" ||
        overflowY === "auto" ||
        overflowY === "scroll" ||
        ancestor.classList.contains("overflow-auto") ||
        ancestor.classList.contains("overflow-x-auto") ||
        ancestor.classList.contains("overflow-y-auto") ||
        ancestor.classList.contains("overflow-hidden") ||
        ancestor.classList.contains("overflow-clip");
      if (isClipping) {
        clippingAncestors.push(ancestor);
      }
      ancestor = ancestor.parentElement;
    }
    return clippingAncestors;
  }, []);

  const computeMenuPlacement = useCallback(() => {
    if (!dropdownRef.current || typeof window === "undefined") {
      return { alignLeft: false, clampOffsetLeft: null as number | null };
    }
    const rect = dropdownRef.current.getBoundingClientRect();
    const renderedWidth =
      listboxRef.current?.getBoundingClientRect().width ||
      listboxRef.current?.offsetWidth ||
      0;
    const fallbackWidth =
      (parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16) * 10;
    const menuWidth = renderedWidth > 0 ? renderedWidth : fallbackWidth;
    const requiredWidth = menuWidth + 8;

    let boundsLeft = 0;
    let boundsRight = window.innerWidth;
    for (const ancestor of getClippingAncestors()) {
      const ancestorRect = ancestor.getBoundingClientRect();
      if (ancestorRect.right <= ancestorRect.left) continue;
      const style = window.getComputedStyle(ancestor);
      const overflowX = style.overflowX || style.overflow;
      const overflowY = style.overflowY || style.overflow;
      const isScrollable =
        overflowX === "auto" ||
        overflowX === "scroll" ||
        overflowY === "auto" ||
        overflowY === "scroll" ||
        ancestor.classList.contains("overflow-auto") ||
        ancestor.classList.contains("overflow-x-auto") ||
        ancestor.classList.contains("overflow-y-auto");
      const hasClientDimensions = ancestor.clientWidth > 0;
      const leftEdge =
        isScrollable && hasClientDimensions
          ? ancestorRect.left + ancestor.clientLeft
          : ancestorRect.left;
      const rightEdge =
        isScrollable && hasClientDimensions
          ? leftEdge + ancestor.clientWidth
          : ancestorRect.right;
      boundsLeft = Math.max(boundsLeft, leftEdge);
      boundsRight = Math.min(boundsRight, rightEdge);
    }

    const fitsRight = rect.right - menuWidth >= boundsLeft && rect.right <= boundsRight;
    const fitsLeft = rect.left >= boundsLeft && rect.left + menuWidth <= boundsRight;

    if (fitsRight !== fitsLeft) {
      return { alignLeft: fitsLeft, clampOffsetLeft: null as number | null };
    }
    if (!fitsRight && !fitsLeft) {
      const availableWidth = boundsRight - boundsLeft;
      if (menuWidth <= availableWidth) {
        const clampedViewportLeft = Math.min(
          Math.max(rect.right - menuWidth, boundsLeft),
          boundsRight - menuWidth
        );
        return {
          alignLeft: false,
          clampOffsetLeft: clampedViewportLeft - rect.left,
        };
      }
      return { alignLeft: false, clampOffsetLeft: null as number | null };
    }

    const fitsRightWithMargin =
      rect.right - requiredWidth >= boundsLeft && rect.right <= boundsRight;
    const fitsLeftWithMargin =
      rect.left >= boundsLeft && rect.left + requiredWidth <= boundsRight;
    return {
      alignLeft: !fitsRightWithMargin && fitsLeftWithMargin,
      clampOffsetLeft: null as number | null,
    };
  }, [getClippingAncestors]);

  const updateMenuPlacement = useCallback(() => {
    const placement = computeMenuPlacement();
    setAlignLeft(placement.alignLeft);
    setClampOffsetLeft(placement.clampOffsetLeft);
  }, [computeMenuPlacement]);

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPlacement();
    const clippingAncestors = getClippingAncestors();
    window.addEventListener("resize", updateMenuPlacement);
    clippingAncestors.forEach((ancestor) => {
      ancestor.addEventListener("scroll", updateMenuPlacement, { passive: true });
    });
    return () => {
      window.removeEventListener("resize", updateMenuPlacement);
      clippingAncestors.forEach((ancestor) => {
        ancestor.removeEventListener("scroll", updateMenuPlacement);
      });
    };
  }, [isOpen, updateMenuPlacement, getClippingAncestors]);

  const handleToggle = useCallback(() => {
    if (!isOpen) {
      updateMenuPlacement();
    } else {
      setClampOffsetLeft(null);
    }
    setIsOpen((prev) => !prev);
  }, [isOpen, updateMenuPlacement]);

  return (
    <div className="relative inline-block ml-1" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isTransferring || disabled}
        title={disabled ? "กำลังดำเนินการงานอื่นอยู่…" : "เปลี่ยนห้อง"}
        aria-label="เปลี่ยนห้อง"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`p-1 rounded-[6px] transition-colors duration-200 text-cool ${
          isTransferring ? "opacity-50 cursor-not-allowed" : "hover:bg-cool-soft"
        }`}
      >
        {isTransferring ? (
          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
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

      {isOpen && (
        <div
          ref={listboxRef}
          role="listbox"
          style={
            clampOffsetLeft !== null
              ? { left: `${clampOffsetLeft}px`, right: "auto" }
              : undefined
          }
          className={`absolute z-50 mt-1 ${alignLeft ? "left-0" : "right-0"} w-40 rounded-[6px] border border-rule bg-paper-2 overflow-hidden animate-fade-in`}
        >
          <div className="px-3 py-2 text-xs font-medium border-b border-rule bg-paper-3 text-muted">
            ย้ายผู้ป่วยไปยัง...
          </div>
          <div className="max-h-48 overflow-y-auto">
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
      )}
    </div>
  );
};
