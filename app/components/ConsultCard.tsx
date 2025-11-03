"use client";

import React, { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

interface ConsultCardProps {
  caseData: any;
  caseId: string;
  departmentName: string;
}

export default function ConsultCard({ caseData, caseId, departmentName }: ConsultCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  
  const hn = caseData.hn || "-";
  const room = caseData.room || "-";
  const problem = caseData.problem || "-";
  const isUrgent = caseData.isUrgent || false;
  const isCompleted = caseData.departments[departmentName]?.status === "completed";
  const isAccepted = caseData.departments[departmentName]?.acceptedAt;
  const completedTime = caseData.departments[departmentName]?.completedAt
    ? new Date(caseData.departments[departmentName].completedAt.seconds * 1000).toLocaleString("th-TH")
    : null;
  const acceptedTime = isAccepted
    ? new Date(isAccepted.seconds * 1000).toLocaleString("th-TH", { hour: '2-digit', minute: '2-digit' })
    : null;
  const timeAgo = caseData.createdAt
    ? new Date(caseData.createdAt.seconds * 1000).toLocaleString("th-TH")
    : "-";

  const handleAcceptCase = async () => {
    if (isAccepting || isAccepted) return;
    
    setIsAccepting(true);
    
    try {
      const updatedDepartments = { ...caseData.departments };
      updatedDepartments[departmentName] = {
        ...updatedDepartments[departmentName],
        acceptedAt: serverTimestamp()
      };

      const caseRef = doc(db, "consults", caseId);
      await updateDoc(caseRef, {
        departments: updatedDepartments
      });

    } catch (error) {
      console.error("Error accepting case:", error);
      alert("เกิดข้อผิดพลาดในการรับเคส");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleCompleteCase = async () => {
    if (isUpdating || isCompleted) return;
    
    setIsUpdating(true);
    
    try {
      const updatedDepartments = { ...caseData.departments };
      updatedDepartments[departmentName] = {
        ...updatedDepartments[departmentName],
        status: "completed",
        completedAt: serverTimestamp()
      };

      const allCompleted = Object.values(updatedDepartments).every(
        (dept: any) => dept.status === "completed"
      );

      const caseRef = doc(db, "consults", caseId);
      await updateDoc(caseRef, {
        departments: updatedDepartments,
        ...(allCompleted && { status: "completed" })
      });

    } catch (error) {
      console.error("Error updating case:", error);
      alert("เกิดข้อผิดพลาดในการปิดเคส");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`card-shadow hover:card-shadow-hover transition-all duration-200 bg-[#C7CFDA] rounded-lg p-3 hover:-translate-y-1 ${isUrgent ? 'border-l-4 border-[#E55143] ring-2 ring-[#E55143]/30 pulse-urgent bg-[#E55143]/10' : 'border-l-4 border-[#699D5D]/50'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${isUrgent ? 'bg-[#E55143] pulse-urgent' : 'bg-[#699D5D]'}`}>
            {isUrgent ? (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-[#FDFCDF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#014167]">HN: {hn}</h3>
              {isUrgent && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-[#E55143] text-white shadow-md">
                  ด่วน
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#014167] font-semibold">{departmentName}</span>
              <span className="text-[#014167]/30">•</span>
              <span className="text-[#014167] font-semibold">{room}</span>
            </div>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isCompleted ? 'bg-[#699D5D]/20 text-[#699D5D]' : 'bg-[#E55143]/20 text-[#E55143]'}`}
        >
          {isCompleted ? '✓' : '⏱'}
        </span>
      </div>
      
      <div className="mb-2 bg-[#014167]/40 p-2 rounded-lg border border-[#FDFCDF]/10">
        <p className="text-xs text-[#FDFCDF] font-semibold mb-0.5">ปัญหา:</p>
        <p className="text-sm text-[#FDFCDF] leading-snug">{problem}</p>
      </div>
      
      <div className="flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[#014167]/70">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{timeAgo}</span>
          </div>
          {isCompleted && (
            <div className="flex items-center gap-1 text-[#014167]">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">ปิด: {completedTime}</span>
            </div>
          )}
          {isAccepted && (
            <div className="flex items-center gap-1 text-[#014167]">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-semibold">รับแล้ว {acceptedTime}</span>
            </div>
          )}
        </div>
        
        {!isCompleted && (
          <div className="flex gap-2">
            {!isAccepted && (
              <button
                onClick={handleAcceptCase}
                disabled={isAccepting}
                className={`flex-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1 ${
                  isAccepting
                    ? 'bg-[#014167]/40 text-[#FDFCDF]/40 cursor-not-allowed'
                    : 'bg-[#699D5D] text-[#FDFCDF] hover:shadow-lg glow-hover transform hover:-translate-y-0.5'
                }`}
              >
                {isAccepting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-[#FDFCDF] border-t-transparent rounded-full animate-spin"></div>
                    <span>กำลังรับ...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>รับเคส</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleCompleteCase}
              disabled={isUpdating}
              className={`${isAccepted ? 'flex-1' : 'flex-1'} px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1 ${
                isUpdating
                  ? 'bg-[#014167]/40 text-[#FDFCDF]/40 cursor-not-allowed'
                  : 'bg-[#E55143] text-white hover:shadow-lg glow-hover transform hover:-translate-y-0.5'
              }`}
            >
              {isUpdating ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>กำลังปิด...</span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>ปิดเคส</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
