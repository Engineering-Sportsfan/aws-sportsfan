"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronRight, Settings, Users, ArrowLeft, RotateCcw, Check, Info, Shield, PenTool, Edit2, FileText, Video, Heart, Briefcase, MessageSquare, Star, Edit3 } from "lucide-react";

export default function AssignRoles() {
  const [activeTab, setActiveTab] = useState("User Types");
  const [searchQuery, setSearchQuery] = useState("");

  const userTypes = [
    {
      id: "admin-staff",
      icon: <Users size={16} color="#388bfd" />,
      iconBg: "rgba(56, 139, 253, 0.1)",
      name: "Admin Staff",
      desc: "Internal platform administrators and operations team members.",
      roles: [
        { name: "Admin", color: "#388bfd", icon: <Shield size={12} /> },
        { name: "Author", color: "#a371f7", icon: <FileText size={12} /> },
        { name: "Moderator", color: "#e3b341", icon: <Shield size={12} /> },
      ],
      extraRoles: "+2",
      roleCount: 4,
    },
    {
      id: "content-creator",
      icon: <PenTool size={16} color="#2ea043" />,
      iconBg: "rgba(46, 160, 67, 0.1)",
      name: "Content Creator",
      desc: "Creates and manages content, articles, media and team/player profiles.",
      roles: [
        { name: "Content Creator", color: "#2ea043", icon: <PenTool size={12} /> },
        { name: "Author", color: "#a371f7", icon: <FileText size={12} /> },
      ],
      roleCount: 2,
    },
    {
      id: "live-host",
      icon: <Video size={16} color="#d29922" />,
      iconBg: "rgba(210, 153, 34, 0.1)",
      name: "Live Host",
      desc: "Hosts live shows, watch along sessions and live center operations.",
      roles: [
        { name: "Live Show Host", color: "#238636", icon: <Video size={12} /> },
        { name: "Moderator", color: "#e3b341", icon: <Shield size={12} /> },
      ],
      roleCount: 2,
    },
    {
      id: "csr-manager",
      icon: <Heart size={16} color="#2ea043" />,
      iconBg: "rgba(46, 160, 67, 0.1)",
      name: "CSR Manager",
      desc: "Manages athlete CSR programs, campaigns and CSR content.",
      roles: [
        { name: "CSR Manager", color: "#2ea043", icon: <Heart size={12} /> },
        { name: "Content Creator", color: "#2ea043", icon: <PenTool size={12} /> },
      ],
      roleCount: 2,
    },
    {
      id: "internal-staff",
      icon: <Briefcase size={16} color="#ff7b72" />,
      iconBg: "rgba(255, 123, 114, 0.1)",
      name: "Internal Staff",
      desc: "Internal team with limited access to specific tools and modules.",
      roles: [
        { name: "SF360 Staff", color: "#ff7b72", icon: <Briefcase size={12} /> },
        { name: "Author", color: "#a371f7", icon: <FileText size={12} /> },
      ],
      roleCount: 2,
    },
    {
      id: "community-moderator",
      icon: <Shield size={16} color="#e3b341" />,
      iconBg: "rgba(227, 179, 65, 0.1)",
      name: "Community Moderator",
      desc: "Manages community health, reviews, fan battles and user feedback.",
      roles: [
        { name: "Moderator", color: "#e3b341", icon: <Shield size={12} /> },
      ],
      roleCount: 1,
    },
    {
      id: "author",
      icon: <FileText size={16} color="#a371f7" />,
      iconBg: "rgba(163, 113, 247, 0.1)",
      name: "Author",
      desc: "Sports journalists and writers who submit articles for review.",
      roles: [
        { name: "Author", color: "#a371f7", icon: <FileText size={12} /> },
      ],
      roleCount: 1,
    },
    {
      id: "live-show-guest",
      icon: <MessageSquare size={16} color="#238636" />,
      iconBg: "rgba(35, 134, 54, 0.1)",
      name: "Live Show Guest",
      desc: "Invited guests appearing on live shows as co-hosts or special guests.",
      roles: [
        { name: "Live Show Host", color: "#238636", icon: <Video size={12} /> },
      ],
      roleCount: 1,
    },
    {
      id: "default-end-user",
      icon: <Star size={16} color="#388bfd" />,
      iconBg: "rgba(56, 139, 253, 0.1)",
      name: "Default End User",
      desc: "Registered fans and general users on the platform.",
      roles: [],
      roleCount: 0,
    },
  ];

  const filteredUserTypes = userTypes.filter(type => 
    type.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    type.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ padding: "0 24px 80px 24px", color: "#e6edf3", maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        .hover-btn { transition: all 0.2s; }
        .hover-btn:hover { background: rgba(56, 139, 253, 0.1) !important; border-color: #388bfd !important; }
        .hover-row { transition: background 0.2s; }
        .hover-row:hover { background: rgba(22, 27, 34, 0.5); cursor: pointer; }
        .tab-btn { transition: all 0.2s; }
        .tab-btn:hover { color: #388bfd !important; }
      `}</style>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#7d8590", marginBottom: "16px", marginTop: "16px" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        <span>User Management</span>
        <ChevronRight size={14} />
        <span>User Roles</span>
        <ChevronRight size={14} />
        <span style={{ color: "#e6edf3", fontWeight: 500 }}>Assign Roles</span>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0" }}>Assign Roles by User Type</h1>
        <p style={{ color: "#7d8590", margin: 0, fontSize: "14px" }}>Manage default role access for different types of users on the platform.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid #30363d", marginBottom: "24px" }}>
        <div 
          onClick={() => setActiveTab("User Types")}
          className="tab-btn"
          style={{ 
            padding: "0 0 12px 0", 
            cursor: "pointer", 
            color: activeTab === "User Types" ? "#388bfd" : "#7d8590",
            borderBottom: activeTab === "User Types" ? "2px solid #388bfd" : "2px solid transparent",
            fontWeight: 500,
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <Users size={16} /> User Types
        </div>
        <Link href="/admin/userroles-management/custom-role-mapping" style={{ textDecoration: "none" }}>
            <div 
            className="tab-btn"
            style={{ 
                padding: "0 0 12px 0", 
                cursor: "pointer", 
                color: activeTab === "Custom Role Mapping" ? "#388bfd" : "#7d8590",
                borderBottom: activeTab === "Custom Role Mapping" ? "2px solid #388bfd" : "2px solid transparent",
                fontWeight: 500,
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
            }}
            >
            <Settings size={16} /> Custom Role Mapping
            </div>
        </Link>
      </div>

      {/* Info Banner */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", background: "rgba(56, 139, 253, 0.1)", border: "1px solid rgba(56, 139, 253, 0.2)", borderRadius: "6px", padding: "12px 16px", marginBottom: "24px" }}>
        <Info size={18} color="#388bfd" style={{ marginTop: "2px" }} />
        <p style={{ margin: 0, fontSize: "13px", color: "#c9d1d9", lineHeight: "1.5" }}>
          Assign default roles to different types of users. These roles will be applied when a new user of that type registers or is created.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px" }}>
        {/* Left Side: Table */}
        <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", overflow: "hidden" }}>
          {/* Table Header Controls */}
          <div style={{ padding: "16px", borderBottom: "1px solid #30363d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>User Types & Role Assignment</h3>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ position: "relative" }}>
                <svg style={{ position: "absolute", left: 10, top: 8 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7d8590" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input 
                  type="text" 
                  placeholder="Search user types..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", padding: "6px 12px 6px 32px", borderRadius: "6px", fontSize: "13px", width: "200px", outline: "none" }}
                />
              </div>
              <button style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                Filter
              </button>
            </div>
          </div>

          {/* Table content */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#161b22", borderBottom: "1px solid #30363d", textAlign: "left", color: "#7d8590" }}>
                <th style={{ padding: "12px 16px", fontWeight: 500, width: "20%" }}>User Type</th>
                <th style={{ padding: "12px 16px", fontWeight: 500, width: "30%" }}>Description</th>
                <th style={{ padding: "12px 16px", fontWeight: 500, width: "35%" }}>Assigned Roles</th>
                <th style={{ padding: "12px 16px", fontWeight: 500, width: "5%" }}></th>
                <th style={{ padding: "12px 16px", fontWeight: 500, width: "10%" }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredUserTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "#7d8590" }}>No user types found matching your search.</td>
                </tr>
              ) : (
                filteredUserTypes.map((type, idx) => (
                <tr key={type.id} className="hover-row" style={{ borderBottom: idx < filteredUserTypes.length - 1 ? "1px solid #21262d" : "none" }}>
                  <td style={{ padding: "16px", verticalAlign: "top" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: type.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {type.icon}
                      </div>
                      <span style={{ fontWeight: 500, color: "#e6edf3" }}>{type.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "16px", color: "#7d8590", verticalAlign: "top", lineHeight: "1.4" }}>
                    {type.desc}
                  </td>
                  <td style={{ padding: "16px", verticalAlign: "top" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {type.roles.length > 0 ? (
                        <>
                          {type.roles.map((role, rIdx) => (
                            <div key={rIdx} style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(22, 27, 34, 0.8)", border: `1px solid ${role.color}40`, padding: "4px 8px", borderRadius: "4px", fontSize: "11px", color: role.color }}>
                              {role.icon} {role.name}
                            </div>
                          ))}
                          {type.extraRoles && (
                            <div style={{ display: "flex", alignItems: "center", background: "#21262d", border: "1px solid #30363d", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", color: "#7d8590" }}>
                              {type.extraRoles}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#7d8590" }}>No Admin Roles Assigned</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "16px", color: "#7d8590", verticalAlign: "top", textAlign: "right" }}>
                    {type.roleCount} Roles
                  </td>
                  <td style={{ padding: "16px", verticalAlign: "top", textAlign: "right" }}>
                    <Link href={`/admin/userroles-management/edit-user-type`} style={{ textDecoration: "none" }}>
                        <button className="hover-btn" style={{ background: "transparent", border: "1px solid #30363d", color: "#388bfd", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}>
                        <Edit3 size={12} /> Edit
                        </button>
                    </Link>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>

        {/* Right Side: Summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 20px 0" }}>Summary</h3>
            
            {/* Donut Chart Simulation */}
            <div style={{ position: "relative", width: "140px", height: "140px", margin: "0 auto 24px auto" }}>
              <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}>
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#21262d" strokeWidth="12" />
                {/* Simulated segments */}
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#388bfd" strokeWidth="12" strokeDasharray="50 200" strokeDashoffset="0" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#a371f7" strokeWidth="12" strokeDasharray="50 200" strokeDashoffset="-50" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#e3b341" strokeWidth="12" strokeDasharray="40 200" strokeDashoffset="-100" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#2ea043" strokeWidth="12" strokeDasharray="40 200" strokeDashoffset="-140" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ff7b72" strokeWidth="12" strokeDasharray="20 200" strokeDashoffset="-180" />
              </svg>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: 700 }}>16</div>
                <div style={{ fontSize: "10px", color: "#7d8590", textAlign: "center", lineHeight: "1.2" }}>Total Roles<br/>Assigned</div>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ fontSize: "12px", color: "#7d8590", margin: "0 0 12px 0", fontWeight: 600 }}>Roles Distribution</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { name: "Admin", color: "#388bfd", count: 3 },
                  { name: "Author", color: "#a371f7", count: 3 },
                  { name: "Moderator", color: "#e3b341", count: 3 },
                  { name: "Content Creator", color: "#2ea043", count: 2 },
                  { name: "Live Show Host", color: "#238636", count: 2 },
                  { name: "CSR Manager", color: "#d29922", count: 1 },
                  { name: "SF360 Staff", color: "#ff7b72", count: 1 },
                  { name: "No Roles Assigned", color: "#8b949e", count: 1 },
                ].map((item, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: item.color }} />
                      <span style={{ color: "#e6edf3" }}>{item.name}</span>
                    </div>
                    <span style={{ color: "#e6edf3", fontWeight: 600 }}>{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: "rgba(56, 139, 253, 0.05)", padding: "12px", borderRadius: "6px", border: "1px solid rgba(56, 139, 253, 0.1)" }}>
              <Info size={14} color="#388bfd" style={{ marginTop: "2px", flexShrink: 0 }} />
              <div style={{ fontSize: "11px", color: "#8b949e", lineHeight: "1.5" }}>
                <span style={{ color: "#e6edf3", fontWeight: 500 }}>Note</span><br />
                Changes to role assignments will only affect new users of that type. Existing users will not be impacted.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div style={{ position: "fixed", bottom: 0, left: 220, right: 0, padding: "16px 24px", background: "#161b22", borderTop: "1px solid #30363d", display: "flex", justifyContent: "space-between", zIndex: 10 }}>
        <button style={{ background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ display: "flex", gap: "12px" }}>
          <button style={{ background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            <RotateCcw size={16} /> Reset Changes
          </button>
          <button style={{ background: "#1f6feb", border: "none", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
            <Check size={16} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
