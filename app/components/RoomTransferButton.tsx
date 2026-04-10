"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ROOMS } from "../../lib/constants";
import { transferConsultRoom } from "../../lib/db";
import { useToast } from "../contexts/ToastContext";

interface RoomTransferButtonProps {
  consultId: string;
  currentRoom: string;
  darkMode: boolean;
  onTransferStart?: () => void;
  onTransferEnd?: () => void;
}

export const RoomTransferButton: React.FC<RoomTransferButtonProps> = ({
  consultId,
  currentRoom,
  darkMode,
  onTransferStart,
  onTransferEnd,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const { addToast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
      setFocusedIndex(Math.max(0, sortedRooms.indexOf(currentRoom as any)));
    }
  }, [isOpen, currentRoom, sortedRooms]);

  const handleTransfer = useCallback(async (newRoom: string) => {
    if (newRoom === currentRoom) {
      setIsOpen(false);
      return;
    }

    try {
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
        onTransferEnd?.(); // success callback
        if (backgroundPromise) {
            backgroundPromise.catch(() => {});
        }
      }
    } catch (error) {
      console.error("Transfer error:", error);
      addToast({ message: "ไม่สามารถย้ายห้องได้ กรุณาลองใหม่", type: "error" });
    } finally {
      setIsTransferring(false);
    }
  }, [consultId, currentRoom, addToast, onTransferStart, onTransferEnd]);

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



  return (
    <div className="relative inline-block ml-1" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isTransferring}
        title="เปลี่ยนห้อง"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`p-1 rounded-full transition-all duration-200 ${
          isTransferring ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-500/10 hover:rotate-180"
        } ${darkMode ? "text-blue-400" : "text-blue-600"}`}
      >
        {isTransferring ? (
          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          role="listbox"
          className={`absolute z-50 mt-1 right-0 w-40 rounded-lg shadow-xl border overflow-hidden animate-in fade-in zoom-in duration-200 ${
            darkMode ? "bg-gray-800 border-gray-700 shadow-black/40" : "bg-white border-gray-200 shadow-gray-300/50"
          }`}
        >
          <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b ${
            darkMode ? "text-gray-500 border-gray-700 bg-gray-900/50" : "text-gray-400 border-gray-100 bg-gray-50"
          }`}>
            ย้ายผู้ป่วยไปยัง...
          </div>
          <div className="max-h-48 overflow-y-auto">
            {sortedRooms.map((room, index) => (
              <button
                key={room}
                ref={(el) => { itemRefs.current[index] = el; }}
                onClick={() => handleTransfer(room)}
                tabIndex={focusedIndex === index ? 0 : -1}
                role="option"
                aria-selected={room === currentRoom}
                className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-between outline-none group ${
                  room === currentRoom
                    ? darkMode
                      ? "bg-blue-900/40 text-blue-400"
                      : "bg-blue-50 text-blue-700"
                    : focusedIndex === index
                    ? darkMode
                      ? "bg-gray-700 text-white"
                      : "bg-gray-100 text-[#014167]"
                    : darkMode
                    ? "text-gray-300 hover:bg-gray-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span>{room}</span>
                {room === currentRoom && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
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
