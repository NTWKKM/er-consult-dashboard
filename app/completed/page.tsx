"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchCompletedConsultsPage, updateConsult, Consult, ConsultDepartment, searchCompletedConsults, fetchAllCompletedConsultsForExport } from "@/lib/db";
import { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { ALL_DEPARTMENTS } from "@/lib/constants";
import { useSettings } from "../contexts/SettingsContext";
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
  const [isSearching, setIsSearching] = useState(false);

  // Search & Filter
  const [searchHN, setSearchHN] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const { darkMode } = useSettings();
  const { addToast } = useToast();

  const ITEMS_PER_PAGE = 25;

  // Store Firestore cursor snapshots for each page boundary
  const cursorMapRef = useRef<Map<number, QueryDocumentSnapshot<DocumentData>>>(new Map());

  // Fetch a specific page of completed cases using Firestore cursors
  const fetchPage = useCallback(async (page: number) => {
    setLoadingMore(true);
    try {
      // For page 1, no cursor is needed. For subsequent pages, use the stored cursor.
      const cursor = page > 1 ? cursorMapRef.current.get(page - 1) : undefined;
      const result = await fetchCompletedConsultsPage(ITEMS_PER_PAGE, cursor);

      setCases(result.consults);
      setHasMore(result.hasMore);
      setError(null);

      // Store the lastDoc as cursor for the next page
      if (result.lastDoc) {
        cursorMapRef.current.set(page, result.lastDoc);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  // Navigate to a specific page
  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    fetchPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [fetchPage]);

  // Filtered cases
  const filteredCases = useMemo(() => {
    const baseCases = searchResults !== null ? searchResults : cases;
    return baseCases.filter((c) => {
      // HN search (client side fallback if searchResults isn't exact or if using cases)
      if (searchHN && !c.hn.includes(searchHN)) return false;

      // Department filter
      if (filterDept && !Object.keys(c.departments).includes(filterDept)) return false;

      // Date filter (client side fallback)
      if (filterDate) {
        if (!c.createdAt) return false;
        const caseDate = new Date(c.createdAt).toISOString().split("T")[0];
        if (caseDate !== filterDate) return false;
      }

      return true;
    });
  }, [cases, searchResults, searchHN, filterDept, filterDate]);

  const handleReConsult = async () => {
    if (!selectedCase || !newProblem.trim()) {
      addToast({ type: "error", message: "กรุณาระบุปัญหาใหม่" });
      return;
    }
    if (selectedDepartments.length === 0) {
      addToast({ type: "error", message: "กรุณาเลือกอย่างน้อย 1 แผนก" });
      return;
    }
    setIsUpdating(true);
    try {
      await updateConsult(selectedCase.id, (current) => {
        const updatedDepartments: Record<string, ConsultDepartment> = {};
        selectedDepartments.forEach((dept) => {
          updatedDepartments[dept] = { status: "pending", completedAt: null };
        });
        return {
          status: "pending",
          departments: updatedDepartments,
          problem: `${current.problem}\n\n[Re-consult]: ${newProblem}`,
          createdAt: new Date().toISOString(),
        };
      });
      setShowModal(false);
      setSelectedCase(null);
      setNewProblem("");
      setSelectedDepartments([]);
      addToast({ type: "success", message: "✓ ส่งปรึกษาใหม่สำเร็จ!" });
    } catch (error) {
      console.error("Error re-consulting:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาด" });
    } finally {
      setIsUpdating(false);
    }
  };

  const openReConsultModal = (caseData: Consult) => {
    setSelectedCase(caseData);
    setNewProblem("");
    setSelectedDepartments(Object.keys(caseData.departments));
    setShowModal(true);
  };

  const handleExportExcel = async () => {
    if (!exportStartDate || !exportEndDate) {
      addToast({ type: "error", message: "กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด" });
      return;
    }
    if (exportStartDate > exportEndDate) {
      addToast({ type: "error", message: "วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด" });
      return;
    }

    setIsExporting(true);
    try {
      const exportList = await fetchAllCompletedConsultsForExport(exportStartDate, exportEndDate);
      
      if (exportList.length === 0) {
        addToast({ type: "error", message: "ไม่พบข้อมูลในช่วงเวลาที่เลือก" });
        return;
      }

      // Dynamic import to reduce bundle size
      const XLSX = (await import("xlsx")).default;

      const exportData = exportList.map((c) => {
        const depts = Object.keys(c.departments).join(", ");

        const getTimesFor = (key: keyof ConsultDepartment) => {
          return Object.entries(c.departments)
            .map(([dept, data]) => {
              const time = data[key] as string | undefined;
              return time ? `${dept}: ${new Date(time).toLocaleString("th-TH")}` : null;
            })
            .filter(Boolean)
            .join("\n");
        };

        return {
          HN: c.hn || "-",
          ชื่อ: c.firstName || "-",
          นามสกุล: c.lastName || "-",
          ห้อง: c.room || "-",
          Dx: c.problem || "-",
          แผนก: depts,
          วันที่ส่ง: c.createdAt ? new Date(c.createdAt).toLocaleString("th-TH") : "-",
          รับเคส: getTimesFor("acceptedAt") || "-",
          Admit: getTimesFor("admittedAt") || "-",
          "คืน ER": getTimesFor("returnedAt") || "-",
          "D/C": getTimesFor("dischargedAt") || "-",
          ปิดเคส: getTimesFor("completedAt") || "-",
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Completed Cases");
      XLSX.writeFile(workbook, `completed-cases-${exportStartDate}-to-${exportEndDate}.xlsx`);
      addToast({ type: "success", message: `Export สำเร็จ (${exportData.length} เคส)` });
      setShowExportModal(false);
    } catch (error) {
      console.error("Export error:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการ Export" });
    } finally {
      setIsExporting(false);
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
    if (!searchHN && !filterDate) {
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchCompletedConsults(searchHN, filterDate);
        if (!cancelled) {
          setSearchResults(results);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchHN, filterDate]);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? "bg-gray-900" : "bg-[#014167]"}`}>
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[#E55143] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xl text-[#FDFCDF] font-semibold">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${darkMode ? "bg-gray-900" : "bg-[#014167]"}`}>
        <div
          className={`text-center rounded-xl shadow-md p-8 max-w-md border ${
            darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#C7CFDA]/30"
          }`}
        >
          <svg className="w-16 h-16 mx-auto text-[#E55143] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className={`text-xl font-bold mb-2 ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>เกิดข้อผิดพลาด</h2>
          <p className={`font-medium mb-4 ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#E55143] text-white rounded-lg font-semibold hover:shadow-md transition-all"
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-gray-900" : "bg-[#014167]"}`}>
      <div className="max-w-[1800px] mx-auto p-4">
        <div className="mb-4 text-center">
          <h1 className={`text-2xl font-bold mb-2 ${darkMode ? "text-gray-100" : "text-[#FDFCDF]"}`}>
            เคสที่ปรึกษาเสร็จแล้ว
          </h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm border ${
                darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#C7CFDA]/30"
              }`}
            >
              <span className={`font-semibold text-sm ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>ผลการค้นหา:</span>
              <span className={`text-xl font-bold ${darkMode ? "text-gray-100" : "text-[#014167]"}`}>
                {isSearching ? "..." : filteredCases.length}
              </span>
              <span className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>เคส</span>
            </div>
            <button
              onClick={() => {
                setExportStartDate("");
                setExportEndDate("");
                setShowExportModal(true);
              }}
              className="inline-flex items-center gap-2 bg-[#699D5D] hover:bg-[#58854D] text-white px-4 py-1.5 rounded-full shadow-sm font-semibold text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Excel
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div
          className={`mb-4 p-3 rounded-xl shadow-md border flex flex-col sm:flex-row gap-3 ${
            darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#C7CFDA]/30"
          }`}
        >
          <div className="flex-1">
            <label className={`text-xs font-bold mb-1 block ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
              🔍 ค้นหา HN
            </label>
            <input
              type="text"
              value={searchHN}
              onChange={(e) => setSearchHN(e.target.value)}
              placeholder="พิมพ์ HN..."
              className={`w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#699D5D]/20 transition-all ${
                darkMode
                  ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400"
                  : "bg-white border-[#C7CFDA]/50 text-[#014167] placeholder-[#C7CFDA]"
              }`}
            />
          </div>
          <div className="flex-1">
            <label className={`text-xs font-bold mb-1 block ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
              🏥 กรองแผนก
            </label>
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className={`w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#699D5D]/20 transition-all ${
                darkMode
                  ? "bg-gray-700 border-gray-600 text-gray-100"
                  : "bg-white border-[#C7CFDA]/50 text-[#014167]"
              }`}
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
            <label className={`text-xs font-bold mb-1 block ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
              📅 กรองวันที่
            </label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className={`w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#699D5D]/20 transition-all ${
                darkMode
                  ? "bg-gray-700 border-gray-600 text-gray-100"
                  : "bg-white border-[#C7CFDA]/50 text-[#014167]"
              }`}
            />
          </div>
          {(searchHN || filterDept || filterDate) && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchHN("");
                  setFilterDept("");
                  setFilterDate("");
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  darkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-white text-[#014167] hover:bg-gray-50"
                }`}
              >
                ✕ ล้าง
              </button>
            </div>
          )}
        </div>

        {/* Desktop table / Mobile cards */}
        <div
          className={`rounded-xl shadow-md overflow-hidden border ${
            darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#C7CFDA]/30"
          }`}
        >
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className={`text-white ${darkMode ? "bg-gray-700" : "bg-[#E55143]"}`}>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold w-[8%]">HN</th>
                  <th className="px-4 py-3 text-left text-sm font-bold w-[12%]">ชื่อ-สกุล</th>
                  <th className="px-4 py-3 text-left text-sm font-bold w-[8%]">ห้อง</th>
                  <th className="px-4 py-3 text-left text-sm font-bold w-[18%]">Dx</th>
                  <th className="px-4 py-3 text-left text-sm font-bold w-[12%]">แผนก</th>
                  <th className="px-4 py-3 text-left text-sm font-bold w-[10%]">วันที่ส่ง</th>
                  <th className="px-4 py-3 text-left text-sm font-bold w-[22%]">สถานะ / เวลา</th>
                  <th className="px-4 py-3 text-center text-sm font-bold w-[10%]">จัดการ</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? "divide-gray-700" : "divide-[#014167]/10"}`}>
                {currentCases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`px-4 py-8 text-center font-medium ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                ) : (
                  currentCases.map((caseData) => (
                    <tr
                      key={caseData.id}
                      className={`transition-colors align-top ${darkMode ? "hover:bg-gray-700/50" : "hover:bg-[#014167]/10"}`}
                    >
                      <td className={`px-4 py-3 text-sm font-semibold ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>
                        {caseData.hn}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                        {[caseData.firstName, caseData.lastName].filter(Boolean).join(" ") || "-"}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                        {caseData.room}
                      </td>
                      <td className={`px-4 py-3 text-sm flex-wrap whitespace-pre-wrap ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                        {caseData.problem}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(caseData.departments).map((dept) => (
                            <span
                              key={dept}
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                                darkMode
                                  ? "bg-gray-700 text-gray-200 border-gray-600"
                                  : "bg-[#F1AE9E] text-[#014167] border-[#F1AE9E]/30"
                              }`}
                            >
                              {dept}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                        {caseData.createdAt
                          ? new Date(caseData.createdAt).toLocaleDateString("th-TH", {
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
                              className={`p-1.5 rounded shadow-sm border ${
                                darkMode ? "bg-gray-800 border-gray-700" : "bg-white/60 border-[#014167]/10"
                              }`}
                            >
                              <span
                                className={`font-bold border-b pb-0.5 mb-0.5 block ${
                                  data.status === "cancelled" 
                                    ? "text-red-500 line-through decoration-2" 
                                    : darkMode ? "border-gray-700 text-gray-200" : "border-[#014167]/10 text-black"
                                }`}
                              >
                                {dept} {data.status === "cancelled" && "(ยกเลิก)"}
                              </span>
                              <div className={`grid grid-cols-2 gap-x-2 gap-y-0.5 ${darkMode ? "text-gray-400" : "text-black/70"}`}>
                                {data.acceptedAt && (
                                  <div>
                                    <span className={`font-semibold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>รับ:</span>{" "}
                                    {new Date(data.acceptedAt).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                                {data.admittedAt && (
                                  <div>
                                    <span className={`font-semibold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>Admit:</span>{" "}
                                    {new Date(data.admittedAt).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                                {data.returnedAt && (
                                  <div>
                                    <span className={`font-semibold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>คืน ER:</span>{" "}
                                    {new Date(data.returnedAt).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                                {data.dischargedAt && (
                                  <div>
                                    <span className={`font-semibold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>D/C:</span>{" "}
                                    {new Date(data.dischargedAt).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                                {data.completedAt && (
                                  <div>
                                    <span className={data.status === "cancelled" ? "text-red-500 font-semibold" : "text-[#E55143] font-semibold"}>
                                      {data.status === "cancelled" ? "เวลาที่ยกเลิก:" : "ปิด:"}
                                    </span>{" "}
                                    {new Date(data.completedAt).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openReConsultModal(caseData)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold hover:shadow-md transition-all duration-200 flex items-center gap-1 mx-auto mt-1 ${
                            darkMode
                              ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                              : "bg-[#F1AE9E] text-[#014167]"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className={`text-center py-8 font-medium ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>
                ไม่มีข้อมูล
              </div>
            ) : (
              currentCases.map((caseData) => (
                <div
                  key={caseData.id}
                  className={`rounded-lg p-3 border shadow-sm ${
                    darkMode ? "bg-gray-700 border-gray-600" : "bg-white border-[#014167]/10"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className={`text-sm font-bold ${darkMode ? "text-gray-100" : "text-[#014167]"}`}>
                        HN: {caseData.hn}
                      </span>
                      {(caseData.firstName || caseData.lastName) && (
                        <p className={`text-xs ${darkMode ? "text-gray-300" : "text-[#014167]/70"}`}>
                          {[caseData.firstName, caseData.lastName].filter(Boolean).join(" ")}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        darkMode ? "bg-gray-600 text-gray-300" : "bg-[#C7CFDA] text-[#014167]"
                      }`}
                    >
                      {caseData.room}
                    </span>
                  </div>
                  <p className={`text-xs mb-2 whitespace-pre-wrap ${darkMode ? "text-gray-300" : "text-[#014167]/80"}`}>
                    {caseData.problem}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {Object.keys(caseData.departments).map((dept) => (
                      <span
                        key={dept}
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${
                          caseData.departments[dept].status === "cancelled"
                            ? "bg-red-500/20 text-red-500 line-through border-red-500/30"
                            : darkMode
                              ? "bg-gray-600 text-gray-200 border-gray-500"
                              : "bg-[#F1AE9E] text-[#014167] border-[#F1AE9E]/30"
                        }`}
                      >
                        {dept} {caseData.departments[dept].status === "cancelled" && "(ยกเลิก)"}
                      </span>
                    ))}
                  </div>
                  <div className={`text-[11px] ${darkMode ? "text-gray-400" : "text-[#014167]/60"}`}>
                    {caseData.createdAt
                      ? new Date(caseData.createdAt).toLocaleDateString("th-TH", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </div>
                  <button
                    onClick={() => openReConsultModal(caseData)}
                    className={`mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                      darkMode
                        ? "bg-gray-600 text-gray-200 hover:bg-gray-500"
                        : "bg-[#F1AE9E] text-[#014167] hover:shadow-md"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          {(currentPage > 1 || hasMore) && (
            <div
              className={`px-4 py-3 border-t flex items-center justify-between ${
                darkMode ? "bg-gray-800/50 border-gray-700" : "bg-[#014167]/10 border-[#014167]/20"
              }`}
            >
              <div className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                หน้า {currentPage} — แสดง {filteredCases.length} เคส
                {loadingMore && " (กำลังโหลด...)"}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1 || loadingMore}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentPage === 1 || loadingMore
                      ? darkMode
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-[#C7CFDA] text-[#014167] cursor-not-allowed"
                      : darkMode
                      ? "bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
                      : "bg-white text-[#014167] border border-[#C7CFDA] hover:bg-[#C7CFDA]/30"
                  }`}
                >
                  ← ก่อนหน้า
                </button>
                <span
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    darkMode ? "bg-gray-700 text-gray-200" : "bg-[#699D5D] text-white"
                  }`}
                >
                  {currentPage}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={!hasMore || loadingMore}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    !hasMore || loadingMore
                      ? darkMode
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-[#C7CFDA] text-[#014167] cursor-not-allowed"
                      : darkMode
                      ? "bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700"
                      : "bg-white text-[#014167] border border-[#C7CFDA] hover:bg-[#C7CFDA]/30"
                  }`}
                >
                  ถัดไป →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Re-consult Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-[#000000]/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div
            className={`rounded-xl shadow-xl max-w-2xl w-full p-6 border animate-scale-in ${
              darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#C7CFDA]/30"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${darkMode ? "text-gray-100" : "text-[#014167]"}`}>
                Re-consult เคส HN: {selectedCase?.hn}
                {selectedCase?.firstName && (
                  <span className={`text-sm font-normal ml-2 ${darkMode ? "text-gray-400" : "text-[#014167]/60"}`}>
                    ({[selectedCase.firstName, selectedCase.lastName].filter(Boolean).join(" ")})
                  </span>
                )}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className={`transition-colors ${darkMode ? "text-gray-400 hover:text-red-400" : "text-[#014167] hover:text-[#E55143]"}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className={`mb-4 p-3 rounded-lg border ${darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-[#C7CFDA]"}`}>
              <p className={`text-xs font-semibold mb-1 ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>ปัญหาเดิม:</p>
              <p className={`text-sm whitespace-pre-wrap ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>{selectedCase?.problem}</p>
            </div>
            <div className="mb-4">
              <label className={`block text-sm font-bold mb-2 ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>
                แผนกที่ต้องการส่งปรึกษา <span className="text-[#E55143]">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_DEPARTMENTS.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDepartment(dept)}
                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                      selectedDepartments.includes(dept)
                        ? "bg-[#699D5D] text-white shadow-sm"
                        : darkMode
                        ? "bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600"
                        : "bg-white text-[#014167] hover:bg-[#C7CFDA]/30 border border-[#C7CFDA]"
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
              <p className={`text-xs font-medium mt-2 ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>
                เลือกได้หลายแผนก (คลิกเพื่อเลือก/ยกเลิก)
              </p>
            </div>
            <div className="mb-4">
              <label className={`block text-sm font-bold mb-2 ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>
                ปัญหาใหม่ / อาการเพิ่มเติม <span className="text-[#E55143]">*</span>
              </label>
              <textarea
                value={newProblem}
                onChange={(e) => setNewProblem(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-[#699D5D] focus:ring-2 focus:ring-[#699D5D]/20 transition-all duration-200 min-h-[120px] text-sm ${
                  darkMode
                    ? "bg-gray-900 border-gray-700 text-gray-200 placeholder-gray-500"
                    : "bg-white border-[#C7CFDA] text-[#014167] placeholder-[#C7CFDA]"
                }`}
                placeholder="ระบุปัญหาใหม่หรืออาการเพิ่มเติมที่ต้องการปรึกษา..."
                required
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className={`px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
                  darkMode
                    ? "bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                    : "bg-white text-[#014167] border border-[#C7CFDA] hover:bg-[#C7CFDA]/30"
                }`}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReConsult}
                disabled={isUpdating || !newProblem.trim() || selectedDepartments.length === 0}
                className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all ${
                  isUpdating || !newProblem.trim() || selectedDepartments.length === 0
                    ? darkMode
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-[#C7CFDA] text-[#014167] cursor-not-allowed"
                    : "bg-[#699D5D] text-white hover:shadow-md"
                }`}
              >
                {isUpdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>กำลังส่ง...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      )}

      {/* Export Options Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-[#000000]/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div
            className={`rounded-xl shadow-xl max-w-md w-full p-6 border animate-scale-in ${
              darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#C7CFDA]/30"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${darkMode ? "text-gray-100" : "text-[#014167]"}`}>
                Export ข้อมูล Excel
              </h2>
              <button
                onClick={() => setShowExportModal(false)}
                className={`transition-colors ${darkMode ? "text-gray-400 hover:text-red-400" : "text-[#014167] hover:text-[#E55143]"}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <p className={`text-sm ${darkMode ? "text-gray-300" : "text-[#014167]/80"}`}>
                กรุณาเลือกช่วงวันที่เริ่มต้นและสิ้นสุดของข้อมูลที่ต้องการ Export
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`text-xs font-bold mb-1 block ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                    ตั้งแต่วันที่
                  </label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#699D5D]/20 transition-all ${
                      darkMode
                        ? "bg-gray-900 border-gray-700 text-gray-200"
                        : "bg-white border-[#C7CFDA] text-[#014167]"
                    }`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-bold mb-1 block ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                    ถึงวันที่
                  </label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#699D5D]/20 transition-all ${
                      darkMode
                        ? "bg-gray-900 border-gray-700 text-gray-200"
                        : "bg-white border-[#C7CFDA] text-[#014167]"
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className={`px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
                  darkMode
                    ? "bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                    : "bg-white text-[#014167] border border-[#C7CFDA] hover:bg-[#C7CFDA]/30"
                }`}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleExportExcel}
                disabled={isExporting || !exportStartDate || !exportEndDate || exportStartDate > exportEndDate}
                className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all ${
                  isExporting || !exportStartDate || !exportEndDate || exportStartDate > exportEndDate
                    ? darkMode
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-[#C7CFDA] text-[#014167] cursor-not-allowed"
                    : "bg-[#699D5D] text-white hover:shadow-md"
                }`}
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>กำลังดึงข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Export</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
