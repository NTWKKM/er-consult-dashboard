"use client";

import React, { useState } from "react";
import { updateConsult } from "@/lib/db";

import { Consult, ConsultDepartment, getConsultById } from "@/lib/db";

interface ConsultCardProps {
  caseData: Consult;
  caseId: string;
  departmentName: string;
  darkMode?: boolean;
  onUpdate?: () => void;
}

export default function ConsultCard({ caseData, caseId, departmentName, darkMode = false, onUpdate }: ConsultCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const SURGERY_DEPTS = ["Gen Sx", "Sx Trauma", "Neuro Sx", "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT", "PED SX"];
  const ORTHO_DEPTS = ["Ortho"];

  const hn = caseData.hn || "-";
  const room = caseData.room || "-";
  const problem = caseData.problem || "-";
  const isUrgent = caseData.isUrgent || false;
  const isCompleted = caseData.departments[departmentName]?.status === "completed";
  const isAccepted = caseData.departments[departmentName]?.acceptedAt;
  const completedTime = caseData.departments[departmentName]?.completedAt
    ? new Date(caseData.departments[departmentName].completedAt).toLocaleString("th-TH")
    : null;
  const acceptedTime = isAccepted
    ? new Date(isAccepted).toLocaleString("th-TH", { hour: '2-digit', minute: '2-digit' })
    : null;
  const timeAgo = caseData.createdAt
    ? new Date(caseData.createdAt).toLocaleString("th-TH")
    : "-";

  const actionStatus = caseData.departments[departmentName]?.actionStatus || "";

  const handleActionStatusChange = async (newStatus: string) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const latestCaseData = await getConsultById(caseId);
      if (!latestCaseData) throw new Error("Case not found");
      
      const updatedDepartments = { ...latestCaseData.departments };
      const isSurgeryDept = SURGERY_DEPTS.includes(departmentName);
      const targetDepts = isSurgeryDept ? SURGERY_DEPTS : ORTHO_DEPTS;
      const now = new Date().toISOString();
      Object.keys(updatedDepartments).forEach(dept => {
        if (targetDepts.includes(dept) && updatedDepartments[dept].status === 'pending') {
          updatedDepartments[dept] = { 
            ...updatedDepartments[dept], 
            acceptedAt: updatedDepartments[dept].acceptedAt || now,
            actionStatus: newStatus
          };
          
          if (newStatus === 'รับเคส' && !updatedDepartments[dept].acceptedAt) {
            updatedDepartments[dept].acceptedAt = now;
          } else if (newStatus === 'Admit') {
            updatedDepartments[dept].admittedAt = now;
          } else if (newStatus === 'คืน ER') {
            updatedDepartments[dept].returnedAt = now;
          } else if (newStatus === 'D/C') {
            updatedDepartments[dept].dischargedAt = now;
          }
        }
      });
      await updateConsult(caseId, { departments: updatedDepartments });
      onUpdate?.();
    } catch (error) {
      console.error("Error updating status:", error);
      alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    } finally { setIsUpdating(false); }
  };

  const handleCompleteCase = async () => {
    if (isUpdating || isCompleted) return;
    setIsUpdating(true);
    try {
      const latestCaseData = await getConsultById(caseId);
      if (!latestCaseData) throw new Error("Case not found");
      
      const updatedDepartments = { ...latestCaseData.departments };
      updatedDepartments[departmentName] = {
        ...updatedDepartments[departmentName],
        status: "completed",
        completedAt: new Date().toISOString(),
      };
      const allCompleted = Object.values(updatedDepartments).every((dept: ConsultDepartment) => dept.status === "completed");
      await updateConsult(caseId, {
          departments: updatedDepartments,
          ...(allCompleted && { status: "completed" }),
      });
      onUpdate?.();
    } catch (error) {
      console.error("Error updating case:", error);
      alert("เกิดข้อผิดพลาดในการปิดเคส");
    } finally { setIsUpdating(false); }
  };

  return (
    <div className={`card-shadow hover:card-shadow-hover transition-all duration-200 rounded-lg p-3 hover:-translate-y-1 ${darkMode
        ? `bg-gray-800 ${isUrgent ? 'border-l-4 border-[#E55143] ring-2 ring-[#E55143]/30 pulse-urgent bg-[#E55143]/10' : 'border-l-4 border-gray-700'}`
        : `bg-[#C7CFDA] ${isUrgent ? 'border-l-4 border-[#E55143] ring-2 ring-[#E55143]/30 pulse-urgent bg-[#E55143]/10' : 'border-l-4 border-[#699D5D]/50'}`
      }`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${isUrgent ? 'bg-[#E55143] pulse-urgent' : 'bg-[#699D5D]'}`}>
            {isUrgent ? (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            ) : (
              <svg className="w-5 h-5 text-[#FDFCDF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-base font-bold ${darkMode ? 'text-gray-100' : 'text-[#014167]'}`}>HN: {hn}</h3>
              {isUrgent && (<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-[#E55143] text-white shadow-md">ด่วน</span>)}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`font-semibold ${darkMode ? 'text-gray-300' : 'text-[#014167]'}`}>{departmentName}</span>
              <span className={darkMode ? 'text-gray-600' : 'text-[#C7CFDA]'}>•</span>
              <span className={`font-semibold ${darkMode ? 'text-gray-300' : 'text-[#014167]'}`}>{room}</span>
            </div>
            {Object.keys(caseData.departments).filter(d => d !== departmentName && caseData.departments[d].status === 'pending').length > 0 && (
              <div className="flex items-center gap-1 text-xs mt-1">
                <span className={`font-medium ${darkMode ? 'text-gray-400' : 'text-[#014167]'}`}>แผนกอื่น:</span>
                <span className={`font-semibold underline ${darkMode ? 'text-gray-300' : 'text-[#014167]'}`}>
                  {Object.keys(caseData.departments).filter(d => d !== departmentName && caseData.departments[d].status === 'pending').join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isCompleted ? 'bg-[#699D5D]/20 text-[#699D5D]' : 'bg-[#E55143]/20 text-[#E55143]'}`}>
          {isCompleted ? '✓' : '⏱'}
        </span>
      </div>

      <div className="mb-2 bg-[#014167]/40 p-2 rounded-lg border border-[#FDFCDF]/10">
        <p className="text-xs text-[#FDFCDF] font-semibold mb-0.5">Dx:</p>
        <p className="text-sm text-[#FDFCDF] leading-snug">{problem}</p>
      </div>

      <div className="flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1 font-medium ${darkMode ? 'text-gray-400' : 'text-[#014167]'}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="font-medium">{timeAgo}</span>
          </div>
          {isCompleted && (
            <div className={`flex items-center gap-1 ${darkMode ? 'text-gray-300' : 'text-[#014167]'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="font-semibold">ปิด: {completedTime}</span>
            </div>
          )}
          {isAccepted && (
            <div className={`flex items-center gap-1 ${darkMode ? 'text-gray-300' : 'text-[#014167]'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span className="font-semibold">{actionStatus || "รับเคส"} {acceptedTime}</span>
            </div>
          )}
        </div>

        {!isCompleted && (
          <div className="flex gap-2">
            <div className={`flex-1 relative ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`}>
              <select
                value={actionStatus || (isAccepted ? "รับเคส" : "")}
                onChange={(e) => handleActionStatusChange(e.target.value)}
                className={`w-full h-full px-2 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 appearance-none text-center cursor-pointer ${
                  actionStatus || isAccepted
                    ? (darkMode ? 'bg-[#699D5D]/20 text-gray-200 border border-[#699D5D]' : 'bg-[#699D5D]/10 text-[#014167] border border-[#699D5D]')
                    : (darkMode ? 'bg-[#699D5D] text-white hover:shadow-lg glow-hover' : 'bg-[#699D5D] text-white hover:shadow-lg glow-hover')
                }`}
              >
                <option value="" disabled>เลือกสถานะ</option>
                {['รับเคส', 'Admit', 'คืน ER', 'D/C'].map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 ${actionStatus || isAccepted ? (darkMode ? 'text-[#699D5D]' : 'text-[#014167]') : 'text-white'}`}>
                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
            <button onClick={handleCompleteCase} disabled={isUpdating} className={`flex-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1 ${isUpdating ? (darkMode ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-[#C7CFDA] text-[#014167] cursor-not-allowed') : 'bg-[#E55143] text-white hover:shadow-lg glow-hover transform hover:-translate-y-0.5'}`}>
              {isUpdating ? (<><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>กำลังปิด...</span></>) : (<><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span>ปิดเคส</span></>)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
