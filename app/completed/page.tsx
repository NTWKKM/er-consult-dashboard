"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { fetchCompletedConsultsPage, transactionalUpdateConsult, Consult, ConsultDepartment, searchCompletedConsults, fetchAllCompletedConsultsForExport, isPermissionDeniedError } from "@/lib/db";
import { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { ALL_DEPARTMENTS } from "@/lib/constants";
import { inclusiveDayCount, MAX_EXPORT_DAYS } from "@/lib/dateUtils";
import { buildCompletedExportRows } from "@/lib/excelExport";
import { useToast } from "../contexts/ToastContext";

export default function CompletedPage() {
  const [cases, setCases] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCase, setSelectedCase] = useState<Consult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newProblem, setNewProblem] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Server-side Search
  const [searchResults, setSearchResults] = useState<Consult[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");

  // Search & Filter
  const [searchHN, setSearchHN] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusWarning, setExportStatusWarning] = useState<{
    message: string;
    tone: "warning" | "error";
    startDate: string;
    endDate: string;
  } | null>(null);
  const exportSessionIdRef = useRef(0);
  const isExportModalOpenRef = useRef(false);
  const exportDatesRef = useRef({ start: "", end: "" });
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const exportModalRef = useRef<HTMLDivElement>(null);
  const prevFocusedElement = useRef<HTMLElement | null>(null);
  const exportWasOpenRef = useRef(false);

  useEffect(() => {
    return () => {
      exportSessionIdRef.current += 1;
      isExportModalOpenRef.current = false;
      exportAbortControllerRef.current?.abort();
      exportAbortControllerRef.current = null;
    };
  }, []);

  const { addToast } = useToast();

  // Validate if export date range is within the 31-day database read safeguard
  const isRangeValid = useMemo(() => {
    if (!exportStartDate || !exportEndDate) return true;
    if (exportStartDate > exportEndDate) return false;
    try {
      return inclusiveDayCount(exportStartDate, exportEndDate) <= MAX_EXPORT_DAYS;
    } catch {
      return false;
    }
  }, [exportStartDate, exportEndDate]);

  const ITEMS_PER_PAGE = 25;

  // Store Firestore cursor snapshots for each page boundary
  const cursorMapRef = useRef<Map<number, QueryDocumentSnapshot<DocumentData>>>(new Map());
  const historyTableContainerRef = useRef<HTMLDivElement>(null);
  const fetchRequestIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);

  // Fetch a specific page of completed cases using Firestore cursors
  const fetchPage = useCallback(
    async (page: number, options?: { suppressPageError?: boolean }): Promise<boolean> => {
      const requestId = ++fetchRequestIdRef.current;
      setLoadingMore(true);
      try {
        // For page 1, no cursor is needed. For subsequent pages, use the stored cursor.
        const cursor = page > 1 ? cursorMapRef.current.get(page - 1) : undefined;
        const result = await fetchCompletedConsultsPage(ITEMS_PER_PAGE, cursor);
        if (fetchRequestIdRef.current !== requestId) return false;

        setCases(result.consults);
        setHasMore(result.hasMore);
        setError(null);
        if (historyTableContainerRef.current) {
          historyTableContainerRef.current.scrollTop = 0;
        }

        // Store the lastDoc as cursor for the next page
        if (result.lastDoc) {
          cursorMapRef.current.set(page, result.lastDoc);
        } else {
          cursorMapRef.current.delete(page);
        }
        return true;
      } catch (err) {
        if (fetchRequestIdRef.current !== requestId) return false;
        console.error("Fetch error:", err);
        if (!options?.suppressPageError) {
          setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
        }
        throw err;
      } finally {
        if (fetchRequestIdRef.current === requestId) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    void fetchPage(1).catch(() => {});
  }, [fetchPage]);

  // Navigate to a specific page
  const goToPage = useCallback((page: number) => {
    void fetchPage(page)
      .then((committed) => {
        if (!committed) return;
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(() => {});
  }, [fetchPage]);

  const filteredCases = useMemo(() => {
    const isSearchActive = Boolean(searchHN || filterDate);
    let baseCases = cases;

    // เลือกอาร์เรย์เริ่มต้นที่จะนำมากรอง
    if (isSearchActive) {
      if (searchStatus === "error") return [];
      if (searchStatus === "loading" && searchResults === null) {
        if (filterDate) return []; // <-- ป้องกันไม่ให้เอาเคสปัจจุบันมาแสดงแวบเดียวตอนกรองวันที่
        baseCases = cases;
      } else if (searchResults !== null) {
        baseCases = searchResults;
      }
    }

    // กรองด้วย HN และแผนกอย่างสม่ำเสมอในทุก ๆ กรณี
    const lowerSearchHN = searchHN.toLowerCase();
    return baseCases.filter((c) => {
      if (searchHN && !c.hn.toLowerCase().startsWith(lowerSearchHN)) return false;
      if (filterDept && !Object.keys(c.departments).includes(filterDept)) return false;
      return true;
    });
  }, [cases, searchResults, searchStatus, searchHN, filterDept, filterDate]);

  const viewStateRef = useRef({ currentPage, searchHN, filterDate });
  useEffect(() => {
    viewStateRef.current = { currentPage, searchHN, filterDate };
  }, [currentPage, searchHN, filterDate]);

  const reconsultAttemptRef = useRef(0);
  const reconsultInFlightRef = useRef(false);
  const reconsultFailedDraftsRef = useRef<
    Map<string, { problem: string; selectedDepartments: string[] }>
  >(new Map());

  const closeReConsultModal = useCallback(() => {
    setShowModal(false);
    setSelectedCase(null);
  }, []);

  const refreshCompletedList = useCallback(() => {
    const { searchHN: activeSearchHN, filterDate: activeFilterDate, currentPage: activePage } =
      viewStateRef.current;
    if (activeSearchHN || activeFilterDate) {
      const requestId = ++searchRequestIdRef.current;
      setSearchStatus("loading");
      void searchCompletedConsults(activeSearchHN, activeFilterDate)
        .then((res) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchResults(res);
          setSearchStatus("ready");
        })
        .catch((err) => {
          if (searchRequestIdRef.current !== requestId) return;
          console.error("Recovery refresh failed:", err);
          setSearchStatus("error");
        });
    } else {
      void fetchPage(activePage, { suppressPageError: true }).catch((err) => {
        console.error("Recovery refresh failed:", err);
      });
    }
  }, [fetchPage]);

  const handleReConsult = async () => {
    if (reconsultInFlightRef.current) return;
    if (!selectedCase || !newProblem.trim()) {
      addToast({ type: "error", message: "กรุณาระบุปัญหาใหม่" });
      return;
    }
    if (selectedDepartments.length === 0) {
      addToast({ type: "error", message: "กรุณาเลือกอย่างน้อย 1 แผนก" });
      return;
    }
    reconsultInFlightRef.current = true;
    setIsUpdating(true);
    const attemptId = ++reconsultAttemptRef.current;
    const caseId = selectedCase.id;
    const submittedProblem = newProblem;
    const submittedDepartments = [...selectedDepartments];
    let backgroundFailed = false;
    
    try {
      const result = await transactionalUpdateConsult(caseId, (current) => {
        // Guard against missing department or concurrent re-consult already in pending state
        if (!current.departments || current.status === "pending") return null;

        // Preserve existing departments; only reset the re-consulted ones
        const updatedDepartments: Record<string, ConsultDepartment> = { ...current.departments };
        submittedDepartments.forEach((dept) => {
          updatedDepartments[dept] = { status: "pending", completedAt: null };
        });
        return {
          status: "pending",
          departments: updatedDepartments,
          problem: `${current.problem}\n\n[Re-consult]: ${submittedProblem}`,
          createdAt: new Date().toISOString(),
        };
      }, { 
        awaitRemote: false,
        onBackgroundError: () => {
          backgroundFailed = true;
          addToast({ 
            type: "error", 
            message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช" 
          });
          
          // Refetch directly instead of rolling back with stale snapshot
          refreshCompletedList();
        }
      }); // OPTIMISTIC UPDATE

      if (!result.applied) {
          reconsultFailedDraftsRef.current.set(caseId, {
              problem: submittedProblem,
              selectedDepartments: submittedDepartments,
          });
          addToast({
              type: "warning",
              message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช",
          });
          refreshCompletedList();
          return;
      }

      // Instant UI response
      setCases((prev) => prev.filter((c) => c.id !== caseId));
      setSearchResults((prev) => prev !== null ? prev.filter((c) => c.id !== caseId) : null);

      closeReConsultModal();
      addToast({ type: "success", message: "✓ ส่งปรึกษาใหม่สำเร็จ!" });

      // Keep reason and departments per case while background sync is in flight so they remain
      // available for reconciliation if the remote write rejects.
      if (result.backgroundPromise) {
          reconsultFailedDraftsRef.current.set(caseId, {
              problem: submittedProblem,
              selectedDepartments: submittedDepartments,
          });
          void result.backgroundPromise.then(
              () => {
                  if (backgroundFailed) return;
                  reconsultFailedDraftsRef.current.delete(caseId);
                  if (reconsultAttemptRef.current === attemptId) {
                      setNewProblem("");
                      setSelectedDepartments([]);
                  }
              },
              () => {
                  // Retained in state and reconsultFailedDraftsRef for this caseId; onBackgroundError notifies user.
              }
          );
      } else if (!backgroundFailed) {
          reconsultFailedDraftsRef.current.delete(caseId);
          setNewProblem("");
          setSelectedDepartments([]);
      }
    } catch (error) {
      console.error("Error re-consulting:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาด" });
    } finally {
      reconsultInFlightRef.current = false;
      setIsUpdating(false);
    }
  };

  const openReConsultModal = (caseData: Consult) => {
    reconsultAttemptRef.current += 1;
    reconsultPrevFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedCase(caseData);
    const savedDraft = reconsultFailedDraftsRef.current.get(caseData.id);
    if (savedDraft) {
      setNewProblem(savedDraft.problem);
      setSelectedDepartments(savedDraft.selectedDepartments);
    } else {
      setNewProblem("");
      setSelectedDepartments(Object.keys(caseData.departments));
    }
    setShowModal(true);
  };

  const openExportModal = useCallback(() => {
    exportAbortControllerRef.current?.abort();
    exportAbortControllerRef.current = null;
    prevFocusedElement.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    exportSessionIdRef.current += 1;
    isExportModalOpenRef.current = true;
    exportDatesRef.current = { start: "", end: "" };
    setIsExporting(false);
    setExportStatusWarning(null);
    setExportStartDate("");
    setExportEndDate("");
    setShowExportModal(true);
  }, []);

  const closeExportModal = useCallback(() => {
    exportAbortControllerRef.current?.abort();
    exportAbortControllerRef.current = null;
    exportSessionIdRef.current += 1;
    isExportModalOpenRef.current = false;
    setIsExporting(false);
    setExportStatusWarning(null);
    setShowExportModal(false);
  }, []);

  const handleExportExcel = async () => {
    const sessionId = ++exportSessionIdRef.current;
    const submittedStartDate = exportStartDate;
    const submittedEndDate = exportEndDate;

    const isActiveSession = () =>
      isExportModalOpenRef.current && exportSessionIdRef.current === sessionId;
    const isMatchingDates = () =>
      exportDatesRef.current.start === submittedStartDate &&
      exportDatesRef.current.end === submittedEndDate;
    const setDialogFeedback = (message: string, tone: "warning" | "error") => {
      if (isActiveSession() && isMatchingDates()) {
        setExportStatusWarning({
          message,
          tone,
          startDate: submittedStartDate,
          endDate: submittedEndDate,
        });
      }
    };

    setExportStatusWarning(null);

    if (!submittedStartDate || !submittedEndDate) {
      setDialogFeedback("กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด", "error");
      return;
    }
    if (submittedStartDate > submittedEndDate) {
      setDialogFeedback("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด", "error");
      return;
    }
    if (!isRangeValid) {
      setDialogFeedback(
        "Export date range exceeds the maximum limit of 31 days to preserve system bandwidth.",
        "error"
      );
      return;
    }

    exportAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    exportAbortControllerRef.current = abortController;
    setIsExporting(true);
    try {
      const {
        consults: exportList,
        truncated,
        truncationReason,
        permissionDenied,
      } = await fetchAllCompletedConsultsForExport(submittedStartDate, submittedEndDate, {
        signal: abortController.signal,
      });

      if (!isActiveSession()) return;

      if (truncated && exportList.length === 0) {
        if (truncationReason === "unconfirmed_completeness") {
          setDialogFeedback(
            permissionDenied
              ? "ไม่มีสิทธิ์เข้าถึงข้อมูลบางส่วนจากเซิร์ฟเวอร์ (Export ได้ 0 รายการ) กรุณาตรวจสอบสิทธิ์บัญชีผู้ใช้กับผู้ดูแลระบบ"
              : "ไม่สามารถยืนยันความครบถ้วนของข้อมูลจากเซิร์ฟเวอร์ได้ (Export ได้ 0 รายการ) กรุณาตรวจสอบการเชื่อมต่อหรือลองใหม่อีกครั้ง",
            "warning"
          );
        } else {
          setDialogFeedback(
            "ข้อมูลในช่วงเวลานี้มีจำนวนมากเกินขีดจำกัดการค้นหา (Export ได้ 0 รายการ) กรุณาเลือกช่วงวันที่ให้แคบลง",
            "warning"
          );
        }
        return;
      }

      if (exportList.length === 0) {
        setDialogFeedback(
          "ไม่พบข้อมูลในช่วงเวลาที่เลือก กรุณาเลือกช่วงวันที่ใหม่",
          "error"
        );
        return;
      }

      // Dynamic import to reduce bundle size
      const xlsxModule = await import("xlsx");
      if (!isActiveSession()) return;
      const XLSX = xlsxModule.default ?? xlsxModule;

      const exportData = buildCompletedExportRows(exportList);

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Completed Cases");
      if (!isActiveSession()) return;
      XLSX.writeFile(workbook, `completed-cases-${submittedStartDate}-to-${submittedEndDate}.xlsx`);
      if (!isActiveSession()) return;

      if (truncated) {
        if (truncationReason === "unconfirmed_completeness") {
          addToast({
            type: "warning",
            message: permissionDenied
              ? `Export ได้ ${exportList.length.toLocaleString()} รายการ แต่ระบบถูกปฏิเสธสิทธิ์ในการอ่านข้อมูลบางส่วนจากเซิร์ฟเวอร์ กรุณาตรวจสอบสิทธิ์บัญชีผู้ใช้กับผู้ดูแลระบบ`
              : `Export ได้ ${exportList.length.toLocaleString()} รายการ แต่ไม่สามารถยืนยันความครบถ้วนของข้อมูลทั้งหมดจากเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อหรือลองใหม่อีกครั้ง`,
          });
        } else {
          addToast({
            type: "warning",
            message: `ข้อมูลมีจำนวนมากเกินขีดจำกัด ระบบ Export ได้ ${exportList.length.toLocaleString()} รายการ กรุณาเลือกช่วงวันที่ให้แคบลง`,
          });
        }
      } else {
        addToast({ type: "success", message: `Export สำเร็จ (${exportData.length} เคส)` });
      }
      closeExportModal();
    } catch (error) {
      console.error("Export error:", error);
      setDialogFeedback(
        isPermissionDeniedError(error)
          ? "ไม่มีสิทธิ์เข้าถึงข้อมูลสำหรับการ Export กรุณาติดต่อผู้ดูแลระบบ"
          : "เกิดข้อผิดพลาดในการ Export กรุณาลองใหม่อีกครั้ง",
        "error"
      );
    } finally {
      if (exportAbortControllerRef.current === abortController) {
        exportAbortControllerRef.current = null;
      }
      if (exportSessionIdRef.current === sessionId) {
        setIsExporting(false);
      }
    }
  };

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  // With cursor pagination, display the current page's filtered cases directly
  const currentCases = filteredCases;

  // Server-side search when searchHN or filterDate changes
  useEffect(() => {
    const requestId = ++searchRequestIdRef.current;

    if (!searchHN && !filterDate) {
      setSearchResults(null);
      setSearchStatus("idle");
      return () => {
        searchRequestIdRef.current += 1;
      };
    }

    // Reset results when starting a server-side search to avoid showing stale data
    setSearchResults(null);
    setSearchStatus("loading");

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || searchRequestIdRef.current !== requestId) return;
      try {
        const results = await searchCompletedConsults(searchHN, filterDate);
        if (!cancelled && searchRequestIdRef.current === requestId) {
          setSearchResults(results);
          setSearchStatus("ready");
        }
      } catch (err) {
        console.error("Search error:", err);
        if (!cancelled && searchRequestIdRef.current === requestId) {
          setSearchStatus("error");
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      searchRequestIdRef.current += 1;
      clearTimeout(timer);
    };
  }, [searchHN, filterDate]);

  const isReconsultModalRendered = !loading && !error && showModal;
  const isExportModalRendered = !loading && !error && showExportModal;
  const isAnyModalOpen = isReconsultModalRendered || isExportModalRendered;

  useEffect(() => {
    if (!loading && !error) return;
    if (showExportModal) {
      closeExportModal();
    }
    if (showModal) {
      setShowModal(false);
      setSelectedCase(null);
    }
  }, [loading, error, showExportModal, showModal, closeExportModal]);

  // Mark shared layout shell (Navbar + main + BottomNav) inert while any modal is open
  useEffect(() => {
    if (!isAnyModalOpen) return;
    const appShell = document.getElementById("app-shell-root");
    if (!appShell || appShell.hasAttribute("inert")) return;
    appShell.setAttribute("inert", "");
    return () => {
      appShell.removeAttribute("inert");
    };
  }, [isAnyModalOpen]);

  // Focus management for Re-consult Modal
  const reconsultModalRef = useRef<HTMLDivElement>(null);
  const reconsultPrevFocusedRef = useRef<HTMLElement | null>(null);
  const reconsultWasOpenRef = useRef(false);

  useEffect(() => {
    if (showModal) {
      reconsultWasOpenRef.current = true;
      if (
        !reconsultPrevFocusedRef.current ||
        reconsultPrevFocusedRef.current === document.body
      ) {
        reconsultPrevFocusedRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }

      const initialTarget =
        reconsultModalRef.current?.querySelector<HTMLElement>("#reconsult-problem") ??
        reconsultModalRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([disabled]):not([aria-hidden="true"])'
        );
      initialTarget?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeReConsultModal();
          return;
        }
        if (e.key === "Tab" && reconsultModalRef.current) {
          const focusable = Array.from(
            reconsultModalRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]):not([aria-hidden="true"]), [href]:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([disabled]):not([aria-hidden="true"])'
            )
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement as HTMLElement | null;

          if (!active || !reconsultModalRef.current.contains(active)) {
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

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }

    if (reconsultWasOpenRef.current) {
      reconsultWasOpenRef.current = false;
      const target = reconsultPrevFocusedRef.current;
      reconsultPrevFocusedRef.current = null;
      let focused = false;
      if (target && target.isConnected && !target.hasAttribute("disabled")) {
        target.focus();
        focused = document.activeElement === target;
      }
      if (!focused) {
        document
          .querySelector<HTMLElement>(
            '#search-hn, main button:not([disabled]), button:not([disabled])'
          )
          ?.focus();
      }
    }
  }, [showModal, closeReConsultModal]);

  // Focus management for Export Modal
  useEffect(() => {
    if (showExportModal) {
      exportWasOpenRef.current = true;
      if (
        !prevFocusedElement.current ||
        prevFocusedElement.current === document.body
      ) {
        prevFocusedElement.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      // Focus the first input or the h2 heading
      const firstInput = exportModalRef.current?.querySelector("input");
      if (firstInput) {
        firstInput.focus();
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeExportModal();
          return;
        }
        if (e.key === "Tab" && exportModalRef.current) {
          const focusable = Array.from(
            exportModalRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]):not([aria-hidden="true"]), [href]:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([disabled]):not([aria-hidden="true"])'
            )
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement as HTMLElement | null;

          if (!active || !exportModalRef.current.contains(active)) {
            first.focus();
            e.preventDefault();
          } else if (e.shiftKey && active === first) {
            last.focus();
            e.preventDefault();
          } else if (!e.shiftKey && active === last) {
            first.focus();
            e.preventDefault();
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    } else if (exportWasOpenRef.current) {
      exportWasOpenRef.current = false;
      const target = prevFocusedElement.current;
      prevFocusedElement.current = null;
      if (target && target.isConnected && !target.hasAttribute("disabled")) {
        target.focus();
      }
    }
  }, [showExportModal, closeExportModal]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-base text-ink-2 font-medium">กำลังโหลดข้อมูล…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-paper">
        <div className="text-center rounded-[10px] p-8 max-w-md border border-bad/40 bg-paper-2">
          <svg aria-hidden="true" className="w-12 h-12 mx-auto text-bad mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-medium mb-2 text-ink">เกิดข้อผิดพลาด</h2>
          <p className="font-medium mb-4 text-ink-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-accent text-accent-ink rounded-[6px] font-medium hover:opacity-90 transition-opacity whitespace-nowrap tap-feedback"
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] pb-24 lg:pb-8 bg-paper transition-colors duration-200">
      <div
        className="max-w-[1800px] mx-auto p-3 sm:p-4"
        inert={isAnyModalOpen ? true : undefined}
      >
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[6px] flex items-center justify-center bg-paper-2 border border-rule text-cool">
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-medium text-ink">
                  เคสที่ปรึกษาเสร็จแล้ว
                </h1>
                <p className="text-xs text-muted">
                  ค้นหาและจัดการประวัติเคส
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] border border-rule bg-paper-2">
                <span className="font-medium text-sm text-muted">ผลการค้นหา:</span>
                <span className="text-lg font-medium measured text-ink">
                  {searchStatus === "loading" ? "…" : filteredCases.length}
                </span>
                <span className="text-sm text-muted">เคส</span>
              </div>
              <button
                type="button"
                onClick={openExportModal}
                className="inline-flex items-center gap-2 bg-ok hover:opacity-90 text-paper px-4 py-2 rounded-[6px] font-medium text-sm transition-opacity tap-feedback whitespace-nowrap"
              >
                <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Excel
              </button>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="mb-4 p-3 rounded-[10px] border border-rule bg-paper-2 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label htmlFor="search-hn" className="text-xs font-medium mb-1 flex items-center gap-1 text-ink-2">
              <svg aria-hidden="true" className="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              ค้นหา HN
            </label>
            <input
              id="search-hn"
              type="text"
              value={searchHN}
              onChange={(e) => setSearchHN(e.target.value)}
              placeholder="พิมพ์ HN…"
              className="w-full px-3 py-1.5 rounded-[6px] text-sm border border-rule-2 bg-paper-3 text-ink placeholder-muted measured focus:outline-none focus:ring-2 focus:ring-focus transition-colors"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="filter-dept" className="text-xs font-medium mb-1 flex items-center gap-1 text-ink-2">
              <svg aria-hidden="true" className="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              กรองแผนก
            </label>
            <select
              id="filter-dept"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="w-full px-3 py-1.5 rounded-[6px] text-sm border border-rule-2 bg-paper-3 text-ink focus:outline-none focus:ring-2 focus:ring-focus transition-colors"
            >
              <option value="">ทุกแผนก</option>
              {ALL_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="filter-date" className="text-xs font-medium mb-1 flex items-center gap-1 text-ink-2">
              <svg aria-hidden="true" className="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              กรองวันที่
            </label>
            <input
              id="filter-date"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-[6px] text-sm border border-rule-2 bg-paper-3 text-ink measured focus:outline-none focus:ring-2 focus:ring-focus transition-colors"
            />
          </div>
          {(searchHN || filterDept || filterDate) && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSearchHN("");
                  setFilterDept("");
                  setFilterDate("");
                }}
                className="px-3 py-1.5 rounded-[6px] text-sm font-medium border border-rule-2 bg-paper-3 text-ink hover:border-ink-2 transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                ล้าง
              </button>
            </div>
          )}
        </div>

        {/* Desktop table / Mobile cards */}
        <div className="rounded-[10px] overflow-hidden border border-rule bg-paper-2">
          {/* Desktop table */}
          <div ref={historyTableContainerRef} className="hidden md:block overflow-auto max-h-[70vh] table-container">
            <table className="w-full min-w-[960px] border-collapse">
              <thead className="sticky top-0 z-10 text-muted bg-paper-3 border-b border-rule">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium w-[8%]">HN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium w-[12%]">ชื่อ-สกุล</th>
                  <th className="px-4 py-3 text-left text-xs font-medium w-[8%]">ห้อง</th>
                  <th className="px-4 py-3 text-left text-xs font-medium w-[18%]">Dx</th>
                  <th className="px-4 py-3 text-left text-xs font-medium w-[12%]">แผนก</th>
                  <th className="px-4 py-3 text-left text-xs font-medium w-[10%]">วันที่ส่ง</th>
                  <th className="px-4 py-3 text-left text-xs font-medium w-[22%]">สถานะ / เวลา</th>
                  <th className="px-4 py-3 text-center text-xs font-medium w-[10%]">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {currentCases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted">
                      <svg aria-hidden="true" className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      <p className="font-medium text-sm">ไม่มีข้อมูล</p>
                    </td>
                  </tr>
                ) : (
                  currentCases.map((caseData) => (
                    <tr
                      key={caseData.id}
                      className="transition-colors align-top hover:bg-paper-3/60"
                    >
                      <td className="px-4 py-3 text-sm font-medium measured text-ink whitespace-nowrap">
                        {caseData.hn}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-2 break-words max-w-[180px]">
                        {[caseData.firstName, caseData.lastName].filter(Boolean).join(" ") || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-2 whitespace-nowrap">
                        {caseData.room}
                      </td>
                       <td className="px-4 py-3 text-sm whitespace-pre-wrap break-words max-w-xs text-ink">
                        {caseData.problem}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(caseData.departments).map((dept) => (
                            <span
                              key={dept}
                              className="inline-block px-2 py-0.5 rounded-[4px] text-xs font-medium border bg-paper-3 text-ink-2 border-rule whitespace-nowrap"
                            >
                              {dept}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs measured text-ink-2">
                        {caseData.createdAt
                          ? new Date(caseData.createdAt).toLocaleDateString("th-TH", {
                              timeZone: "Asia/Bangkok",
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col gap-1.5 text-[11px] font-medium">
                          {Object.entries(caseData.departments).map(([dept, data]) => (
                            <div
                              key={dept}
                              className="p-2 rounded-[6px] border border-rule bg-paper-3"
                            >
                              <span
                                className={`font-medium border-b pb-0.5 mb-1 block ${
                                  data.status === "cancelled"
                                    ? "text-bad line-through border-bad/30"
                                    : "border-rule text-ink"
                                }`}
                              >
                                {dept} {data.status === "cancelled" && "(ยกเลิก)"}
                              </span>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted measured">
                                {data.acceptedAt && (
                                  <div className="whitespace-nowrap">
                                    <span className="font-medium text-ok">รับ:</span>{" "}
                                    {new Date(data.acceptedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                                {data.admittedAt && (
                                  <div className="whitespace-nowrap">
                                    <span className="font-medium text-cool">Admit:</span>{" "}
                                    {new Date(data.admittedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                                {data.returnedAt && (
                                  <div className="whitespace-nowrap">
                                    <span className="font-medium text-accent">คืน ER:</span>{" "}
                                    {new Date(data.returnedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                                {data.dischargedAt && (
                                  <div className="whitespace-nowrap">
                                    <span className="font-medium text-cool">D/C:</span>{" "}
                                    {new Date(data.dischargedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                                {data.completedAt && (
                                  <div className="whitespace-nowrap">
                                    <span className={data.status === "cancelled" ? "text-bad font-medium" : "text-ink-2 font-medium"}>
                                      {data.status === "cancelled" ? "เวลาที่ยกเลิก:" : "ปิด:"}
                                    </span>{" "}
                                    {new Date(data.completedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => openReConsultModal(caseData)}
                          className="px-3 py-1.5 rounded-[6px] text-xs font-medium transition-opacity duration-200 flex items-center gap-1 mx-auto mt-1 bg-accent text-accent-ink hover:opacity-90 whitespace-nowrap tap-feedback"
                        >
                          <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          Re-consult
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="md:hidden p-3 space-y-3">
            {currentCases.length === 0 ? (
              <div className="text-center py-8 font-medium text-muted">
                ไม่มีข้อมูล
              </div>
            ) : (
              currentCases.map((caseData) => (
                <div
                  key={caseData.id}
                  className="rounded-[6px] p-3 border border-rule bg-paper min-w-0"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium measured text-ink break-all">
                        HN: {caseData.hn}
                      </span>
                      {(caseData.firstName || caseData.lastName) && (
                        <p className="text-xs text-ink-2 break-words">
                          {[caseData.firstName, caseData.lastName].filter(Boolean).join(" ")}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-[4px] bg-paper-3 border border-rule text-ink whitespace-nowrap shrink-0">
                      {caseData.room}
                    </span>
                  </div>
                   <div className="mb-2 min-w-0">
                    <div className="text-xs font-medium mb-0.5 text-muted">Dx:</div>
                    <p className="text-xs whitespace-pre-wrap break-words text-ink">
                      {caseData.problem}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 mb-2">
                    {Object.entries(caseData.departments).map(([dept, data]) => (
                      <div key={dept} className="p-2 rounded-[6px] border border-rule bg-paper-3">
                        <span
                          className={`inline-block px-2 py-0.5 mb-1 rounded-[4px] text-xs font-medium border ${
                            data.status === "cancelled"
                              ? "bg-bad-soft text-bad line-through border-bad/30"
                              : "bg-paper-2 text-ink border-rule"
                          }`}
                        >
                          {dept} {data.status === "cancelled" && "(ยกเลิก)"}
                        </span>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted measured">
                          {data.acceptedAt && (
                            <div className="whitespace-nowrap">
                              <span className="font-medium text-ok">รับ:</span>{" "}
                              {new Date(data.acceptedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                          {data.admittedAt && (
                            <div className="whitespace-nowrap">
                              <span className="font-medium text-cool">Admit:</span>{" "}
                              {new Date(data.admittedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                          {data.returnedAt && (
                            <div className="whitespace-nowrap">
                              <span className="font-medium text-accent">คืน ER:</span>{" "}
                              {new Date(data.returnedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                          {data.dischargedAt && (
                            <div className="whitespace-nowrap">
                              <span className="font-medium text-cool">D/C:</span>{" "}
                              {new Date(data.dischargedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                          {data.completedAt && (
                            <div className="whitespace-nowrap">
                              <span className={data.status === "cancelled" ? "text-bad font-medium" : "text-ink-2 font-medium"}>
                                {data.status === "cancelled" ? "เวลาที่ยกเลิก:" : "ปิด:"}
                              </span>{" "}
                              {new Date(data.completedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted measured">
                    {caseData.createdAt
                      ? new Date(caseData.createdAt).toLocaleDateString("th-TH", {
                          timeZone: "Asia/Bangkok",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </div>
                  <button
                    type="button"
                    onClick={() => openReConsultModal(caseData)}
                    className="mt-2 w-full px-3 py-1.5 rounded-[6px] text-xs font-medium transition-opacity flex items-center justify-center gap-1 bg-accent text-accent-ink hover:opacity-90 whitespace-nowrap tap-feedback"
                  >
                    <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Re-consult
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {(currentPage > 1 || hasMore || Boolean(searchHN || filterDate)) && (
            <div className="px-4 py-3 border-t border-rule bg-paper-3 flex items-center justify-between gap-2 flex-wrap">
  <div className="text-sm font-medium text-ink-2">
    {searchStatus === "error" ? (
      <span className="inline-flex items-center gap-1.5 text-bad font-medium">
        <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        การค้นหาล้มเหลว
      </span>
    ) : Boolean(searchHN || filterDate) ? (
      searchStatus === "loading"
        ? "พบทั้งหมด … เคส"
        : `พบทั้งหมด ${filteredCases.length} เคส`
    ) : (
      `หน้า ${currentPage} — แสดง ${filteredCases.length} เคส`
    )}
  </div>
              {!Boolean(searchHN || filterDate) && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1 || loadingMore}
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors inline-flex items-center gap-1 whitespace-nowrap ${
                      currentPage === 1 || loadingMore
                        ? "bg-paper-2 text-muted border border-rule cursor-not-allowed"
                        : "bg-paper-2 text-ink border border-rule-2 hover:border-ink-2"
                    }`}
                  >
                    <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    ก่อนหน้า
                  </button>
                  <span className="px-3 py-1.5 rounded-[6px] text-xs font-medium measured bg-accent text-accent-ink">
                    {currentPage}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={!hasMore || loadingMore}
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors inline-flex items-center gap-1 whitespace-nowrap ${
                      !hasMore || loadingMore
                        ? "bg-paper-2 text-muted border border-rule cursor-not-allowed"
                        : "bg-paper-2 text-ink border border-rule-2 hover:border-ink-2"
                    }`}
                  >
                    ถัดไป
                    <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Re-consult Modal */}
      {showModal &&
        (() => {
          const modalNode = (
            <div
              className="fixed inset-0 bg-paper-3/80 flex items-center justify-center z-[110] p-4 animate-fade-in overscroll-contain"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reconsult-modal-title"
            >
          <div
            ref={reconsultModalRef}
            className="rounded-[10px] max-w-2xl w-full p-5 sm:p-6 border border-rule bg-paper-2 animate-scale-in overscroll-contain max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-2 mb-4 pb-3 border-b border-rule">
              <h2 id="reconsult-modal-title" className="text-lg font-medium text-ink min-w-0 break-words">
                Re-consult เคส <span className="measured whitespace-nowrap">HN: {selectedCase?.hn}</span>
                {selectedCase?.firstName && (
                  <span className="text-sm font-normal ml-2 text-muted">
                    ({[selectedCase.firstName, selectedCase.lastName].filter(Boolean).join(" ")})
                  </span>
                )}
              </h2>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง Re-consult"
                onClick={closeReConsultModal}
                className="transition-colors text-muted hover:text-bad shrink-0"
              >
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-4 p-3 rounded-[6px] border border-rule bg-paper-3 min-w-0">
              <p className="text-xs font-medium mb-1 text-muted">ปัญหาเดิม:</p>
              <p className="text-sm whitespace-pre-wrap break-words text-ink">{selectedCase?.problem}</p>
            </div>
            <div className="mb-4">
              <div id="reconsult-depts-label" className="block text-sm font-medium mb-2 text-ink-2">
                แผนกที่ต้องการส่งปรึกษา <span className="text-bad">*</span>
              </div>
              <div role="group" aria-labelledby="reconsult-depts-label" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_DEPARTMENTS.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    aria-pressed={selectedDepartments.includes(dept)}
                    onClick={() => toggleDepartment(dept)}
                    className={`px-3 py-2 rounded-[6px] font-medium text-sm transition-colors duration-200 border whitespace-nowrap ${
                      selectedDepartments.includes(dept)
                        ? "bg-ok text-paper border-ok"
                        : "bg-paper-3 text-ink-2 hover:text-ink border-rule-2"
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-2 text-muted">
                เลือกได้หลายแผนก (คลิกเพื่อเลือก/ยกเลิก)
              </p>
            </div>
            <div className="mb-4">
              <label htmlFor="reconsult-problem" className="block text-sm font-medium mb-2 text-ink-2">
                ปัญหาใหม่ / อาการเพิ่มเติม <span className="text-bad">*</span>
              </label>
              <textarea
                id="reconsult-problem"
                value={newProblem}
                onChange={(e) => setNewProblem(e.target.value)}
                className="w-full px-3 py-2 border border-rule-2 rounded-[6px] bg-paper-3 text-ink placeholder-muted focus:outline-none focus:border-focus focus:ring-2 focus:ring-focus/25 transition-colors duration-200 min-h-[120px] text-sm"
                placeholder="ระบุปัญหาใหม่หรืออาการเพิ่มเติมที่ต้องการปรึกษา…"
                required
              />
            </div>
            <div className="flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                onClick={closeReConsultModal}
                className="px-4 py-2 rounded-[6px] font-medium transition-colors text-sm bg-paper-3 text-ink border border-rule-2 hover:border-ink-2 whitespace-nowrap"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleReConsult}
                disabled={isUpdating || !newProblem.trim() || selectedDepartments.length === 0}
                className={`px-4 py-2 rounded-[6px] font-medium text-sm flex items-center gap-2 transition-opacity whitespace-nowrap ${
                  isUpdating || !newProblem.trim() || selectedDepartments.length === 0
                    ? "bg-paper-3 text-muted border border-rule cursor-not-allowed"
                    : "bg-ok text-paper hover:opacity-90"
                }`}
              >
                {isUpdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    <span>กำลังส่ง…</span>
                  </>
                ) : (
                  <>
                    <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span>ส่งปรึกษาใหม่</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
          );
          return typeof document !== "undefined"
            ? createPortal(modalNode, document.body)
            : modalNode;
        })()}

      {/* Export Options Modal */}
      {showExportModal &&
        (() => {
          const visibleExportWarning =
            exportStatusWarning &&
            exportStatusWarning.startDate === exportStartDate &&
            exportStatusWarning.endDate === exportEndDate
              ? exportStatusWarning
              : null;
          const exportModalNode = (
            <div 
              className="fixed inset-0 bg-paper-3/80 flex items-center justify-center z-[110] p-4 animate-fade-in overscroll-contain"
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-modal-title"
            >
          <div
            ref={exportModalRef}
            className="rounded-[10px] max-w-md w-full p-6 border border-rule bg-paper-2 animate-scale-in overscroll-contain max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-rule">
              <h2 id="export-modal-title" className="text-lg font-medium text-ink">
                Export ข้อมูล Excel
              </h2>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง Export"
                onClick={closeExportModal}
                className="transition-colors text-muted hover:text-bad"
              >
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-ink-2">
                กรุณาเลือกช่วงวันที่เริ่มต้นและสิ้นสุดของข้อมูลที่ต้องการ Export
              </p>
              {!isRangeValid && (
                <div className="bg-bad-soft border border-bad/40 rounded-[6px] p-3 text-xs text-bad font-medium animate-fade-in flex items-start gap-2">
                  <svg aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Export range is restricted to a maximum of 31 days to preserve database bandwidth.</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="exportStartDate" className="text-xs font-medium mb-1 block text-ink-2">
                    ตั้งแต่วันที่
                  </label>
                  <input
                    id="exportStartDate"
                    type="date"
                    disabled={isExporting}
                    value={exportStartDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      exportDatesRef.current = { ...exportDatesRef.current, start: nextStart };
                      setExportStatusWarning(null);
                      setExportStartDate(nextStart);
                    }}
                    className="w-full px-3 py-2 rounded-[6px] text-sm border border-rule-2 bg-paper-3 text-ink measured focus:outline-none focus:ring-2 focus:ring-focus transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label htmlFor="exportEndDate" className="text-xs font-medium mb-1 block text-ink-2">
                    ถึงวันที่
                  </label>
                  <input
                    id="exportEndDate"
                    type="date"
                    disabled={isExporting}
                    value={exportEndDate}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      exportDatesRef.current = { ...exportDatesRef.current, end: nextEnd };
                      setExportStatusWarning(null);
                      setExportEndDate(nextEnd);
                    }}
                    className="w-full px-3 py-2 rounded-[6px] text-sm border border-rule-2 bg-paper-3 text-ink measured focus:outline-none focus:ring-2 focus:ring-focus transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              <div role="status" aria-live="polite" aria-atomic="true">
                {visibleExportWarning && (
                  <div
                    className={`${
                      visibleExportWarning.tone === "error"
                        ? "bg-bad-soft border-bad/40 text-bad"
                        : "bg-accent-soft border-accent/40 text-accent"
                    } border rounded-[6px] p-3 text-xs font-medium animate-fade-in flex items-start gap-2`}
                  >
                    <svg aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{visibleExportWarning.message}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                onClick={closeExportModal}
                className="px-4 py-2 rounded-[6px] font-medium transition-colors text-sm bg-paper-3 text-ink border border-rule-2 hover:border-ink-2 whitespace-nowrap"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={isExporting || !exportStartDate || !exportEndDate || exportStartDate > exportEndDate || !isRangeValid}
                aria-disabled={isExporting || !exportStartDate || !exportEndDate || exportStartDate > exportEndDate || !isRangeValid}
                className={`px-4 py-2 rounded-[6px] font-medium text-sm flex items-center gap-2 transition-opacity whitespace-nowrap ${
                  isExporting || !exportStartDate || !exportEndDate || exportStartDate > exportEndDate || !isRangeValid
                    ? "bg-paper-3 text-muted border border-rule cursor-not-allowed"
                    : "bg-ok text-paper hover:opacity-90"
                }`}
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    <span>กำลังดึงข้อมูล…</span>
                  </>
                ) : (
                  <>
                    <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Export</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
          );
          return typeof document !== "undefined"
            ? createPortal(exportModalNode, document.body)
            : exportModalNode;
        })()}
    </div>
  );
}
