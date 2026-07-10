"use client";

import Link from "next/link";
import { ChevronRight, Save, X } from "lucide-react";

export default function AddDepartmentForm() {
  return (
    <div style={{ padding: "0 24px 80px 24px", color: "#e6edf3", maxWidth: "800px", margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#7d8590", marginBottom: "16px", marginTop: "16px" }}>
        <Link href="/admin/department-management/department-list" style={{ color: "#7d8590", textDecoration: "none" }}>
          Departments
        </Link>
        <ChevronRight size={14} />
        <span style={{ color: "#e6edf3", fontWeight: 500 }}>Add Department</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0" }}>Create New Department</h1>
        <p style={{ color: "#7d8590", margin: 0, fontSize: "14px" }}>Set up a new organizational department and assign a manager.</p>
      </div>

      {/* Form Area */}
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #30363d" }}>
          <h2 style={{ fontSize: "16px", margin: 0, fontWeight: 600 }}>Department Details</h2>
        </div>
        
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Department Name <span style={{color: "#f85149"}}>*</span></label>
            <input type="text" placeholder="e.g. Content Creation" style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px", color: "#e6edf3", fontSize: "14px", outline: "none" }} />
          </div>
          
          <div>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Description <span style={{color: "#f85149"}}>*</span></label>
            <textarea placeholder="Describe the responsibilities of this department..." rows={4} style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px", color: "#e6edf3", fontSize: "14px", outline: "none", resize: "none" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Head / Manager</label>
              <select style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px", color: "#e6edf3", fontSize: "14px", outline: "none", appearance: "none" }}>
                <option>Select manager...</option>
                <option>Rahul Mehta</option>
                <option>Priya Sharma</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Status</label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px" }}>
                <div style={{ width: "36px", height: "20px", background: "#2ea043", borderRadius: "10px", padding: "2px", cursor: "pointer", position: "relative" }}>
                  <div style={{ width: "16px", height: "16px", background: "#fff", borderRadius: "50%", transform: "translateX(16px)" }} />
                </div>
                <span style={{ fontSize: "13px", fontWeight: 500 }}>Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div style={{ position: "fixed", bottom: 0, left: 220, right: 0, padding: "16px 24px", background: "#161b22", borderTop: "1px solid #30363d", display: "flex", justifyContent: "space-between", zIndex: 10 }}>
        <Link href="/admin/department-management/department-list" style={{ textDecoration: "none" }}>
          <button style={{ background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
            <X size={16} /> Cancel
          </button>
        </Link>
        <button style={{ background: "#1f6feb", border: "none", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
          <Save size={16} /> Save Department
        </button>
      </div>
    </div>
  );
}
