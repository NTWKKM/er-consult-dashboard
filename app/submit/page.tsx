"use client"; 

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function SubmitPage() {
  const [hn, setHn] = useState("");
  const [problem, setProblem] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false); 

  const allDepartments = [
    "Gen Sx", "Sx Trauma", "Ortho", "Neuro Sx", 
    "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT"
  ];

  const handleCheckboxChange = (dept: string) => { 
    setSelectedDepts(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept) 
        : [...prev, dept]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => { 
    e.preventDefault();
    if (!hn || !problem || selectedDepts.length === 0) {
      alert("กรุณากรอกข้อมูลให้ครบ (HN, Problem, และเลือกอย่างน้อย 1 แผนก)");
      return;
    }
    
    setIsLoading(true); 

    const departmentsMap: { [key: string]: any } = {}; 
    selectedDepts.forEach(dept => {
      departmentsMap[dept] = { status: "pending", completedAt: null };
    });

    try {
      await addDoc(collection(db, "consults"), {
        hn: hn,
        problem: problem,
        createdAt: serverTimestamp(), 
        status: "pending",
        departments: departmentsMap
      });
      
      alert("ส่งเคสปรึกษาสำเร็จ!");
      setHn("");
      setProblem("");
      setSelectedDepts([]);

    } catch (error) { 
      console.error("Error adding document: ", error);
      if (error instanceof Error) {
        alert("เกิดข้อผิดพลาด: " + error.message);
      } else {
        alert("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
      }
    } finally {
      setIsLoading(false); 
    }
  };

  // VVVV แก้ไข: เปลี่ยนดีไซน์ให้มี Header ไล่สี "ลอย" อยู่ข้างบน VVVV
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      
      <div className="relative max-w-2xl w-full">
        {/* Header ไล่สี (ใช้ Negative Margin ดันให้ลอยขึ้น) */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-5 rounded-xl shadow-2xl -mb-10 z-10 relative">
          <h1 className="text-3xl font-bold text-center">
            ส่งเคสปรึกษา (ER MNRH)
          </h1>
        </div>

        {/* การ์ดฟอร์มสีขาว */}
        <div className="bg-white pt-16 p-8 rounded-xl shadow-xl relative z-0">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* ช่องกรอก HN */}
            <div>
              <label htmlFor="hn" className="block text-sm font-bold text-gray-700 mb-2">
                HN*
              </label>
              <input 
                type="text" 
                id="hn"
                value={hn} 
                onChange={(e) => setHn(e.target.value)} 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="กรอก HN ผู้ป่วย"
              />
            </div>

            {/* ช่องกรอก Problem */}
            <div>
              <label htmlFor="problem" className="block text-sm font-bold text-gray-700 mb-2">
                Problem*
              </label>
              <textarea 
                id="problem"
                value={problem} 
                onChange={(e) => setProblem(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="เช่น TBI, Blunt abdomen..."
              />
            </div>

            {/* ช่องเลือกแผนก */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-3">
                ปรึกษาแผนก*
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {allDepartments.map(dept => (
                  <div key={dept} className="flex items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <input 
                      type="checkbox" 
                      id={dept} 
                      value={dept}
                      checked={selectedDepts.includes(dept)}
                      onChange={() => handleCheckboxChange(dept)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={dept} className="ml-3 text-sm font-medium text-gray-700">
                      {dept}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* ปุ่ม Submit (ใช้สีเขียวเดียวกับ Navbar) */}
            <div>
              <button 
                type="submit" 
                disabled={isLoading} 
                className={`w-full font-bold py-3 px-4 rounded-lg transition-colors text-white shadow-lg mt-4
                  ${isLoading 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-green-500 hover:bg-green-600'
                  }`}
              >
                {isLoading ? 'กำลังส่งข้อมูล...' : 'ส่งเคสปรึกษา'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
  // ^^^^ สิ้นสุดส่วนหน้าตาที่แก้ไข ^^^^
}