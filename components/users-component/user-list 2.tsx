"use client";

import Link from "next/link";
import { Plus, Users } from "lucide-react";

export default function UserList() {
  return (
    <div style={{ padding: "0 24px 80px 24px", color: "#e6edf3", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", marginTop: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "12px" }}>
            <Users size={24} /> Users
          </h1>
          <p style={{ color: "#7d8590", margin: 0, fontSize: "14px" }}>Manage platform users, view their activity and assignments.</p>
        </div>
        <Link href="/admin/user-management/users/add-user-form" style={{ textDecoration: "none" }}>
          <button style={{ background: "#1f6feb", border: "none", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
            <Plus size={16} /> Add User
          </button>
        </Link>
      </div>

      {/* Empty State / Placeholder */}
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "48px 24px", textAlign: "center", color: "#7d8590" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#21262d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
          <Users size={32} color="#7d8590" />
        </div>
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#e6edf3", margin: "0 0 8px 0" }}>No users found</h2>
        <p style={{ fontSize: "14px", margin: "0 0 24px 0", maxWidth: "400px", marginLeft: "auto", marginRight: "auto" }}>This is the placeholder for the user list view. The main focus of this step was the multi-step Create Admin User flow.</p>
        <Link href="/admin/user-management/users/add-user-form" style={{ textDecoration: "none" }}>
          <button style={{ background: "transparent", border: "1px solid #388bfd", color: "#388bfd", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}>
            Go to Add User Flow
          </button>
        </Link>
      </div>
    </div>
  );
}
