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
  
  const hn = caseData.hn || "-";
  const room = caseData.room || "-";
  const problem = caseData.problem || "-";
  const isUrgent = caseData.isUrgent || false;
  const isCompleted = caseData.departments[departmentName]?.status === "completed";
  const completedTime = caseData.departments[departmentName]?.completedAt
    ? new Date(caseData.departments[departmentName].completedAt.seconds * 1000).toLocaleString("th-TH")
    : null;
  const timeAgo = caseData.createdAt
    ? new Date(caseData.createdAt.seconds * 1000).toLocaleString("th-TH")
    : "-";

  const handleCompleteCase = async () => {
    if (isUpdating || isCompleted) return;
    
    setIsUpdating(true);
    
    try {
      const updatedDepartments = { ...caseData.departments };
      updatedDepartments[departmentName] = {
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
    <div className={`card-shadow hover:card-shadow-hover transition-all duration-200 bg-white rounded-lg p-3 hover:-translate-y-1 ${isUrgent ? 'border-l-4 border-rose-400 ring-1 ring-rose-200/50' : 'border-l-4 border-blue-400'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${isUrgent ? 'bg-gradient-to-br from-rose-400 to-rose-500 pulse-urgent' : 'bg-gradient-to-br from-blue-400 to-cyan-500'}`}>
            {isUrgent ? (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-800">HN: {hn}</h3>
              {isUrgent && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-rose-500 text-white">
                  ด่วน
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 font-medium">{departmentName}</span>
              <span className="text-gray-300">•</span>
              <span className="text-blue-500 font-semibold">{room}</span>
            </div>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isCompleted ? 'bg-emerald-100 text-emerald-500' : 'bg-orange-100 text-orange-500'}`}
        >
          {isCompleted ? '✓' : '⏱'}
        </span>
      </div>
      
      <div className="mb-2 bg-gray-50/60 p-2 rounded-lg border border-gray-100/60">
        <p className="text-xs text-gray-500 font-semibold mb-0.5">ปัญหา:</p>
        <p className="text-sm text-gray-600 leading-snug">{problem}</p>
      </div>
      
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-gray-500">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{timeAgo}</span>
          </div>
          {isCompleted && (
            <div className="flex items-center gap-1 text-emerald-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">ปิด: {completedTime}</span>
            </div>
          )}
        </div>
        
        {!isCompleted && (
          <button
            onClick={handleCompleteCase}
            disabled={isUpdating}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition-all duration-200 flex items-center gap-1 ${
              isUpdating
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-400 to-emerald-500 text-white hover:from-emerald-500 hover:to-teal-500 shadow-sm hover:shadow-md transform hover:-translate-y-0.5'
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
        )}
      </div>
    </div>
  );
}