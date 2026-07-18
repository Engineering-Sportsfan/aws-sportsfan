"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronRight, Settings, ArrowLeft, RotateCcw, Check, Info, Shield, PenTool, FileText, Video, Heart, Briefcase, Plus, Search, Filter, X, Edit2, Users } from "lucide-react";

export default function EditUserType() {
  const [activeTab, setActiveTab] = useState("Assigned Roles");

  const [roles, setRoles] = useState([
    { id: "content-creator", name: "Content Creator", desc: "Create and manage content, articles, media and team/player profiles.", icon: <PenTool size={16} color="#2ea043" />, color: "#2ea043", status: "required", active: true },
    { id: "author", name: "Author", desc: "Write and submit articles. Manage own author profile and content.", icon: <FileText size={16} color="#a371f7" />, color: "#a371f7", status: "required", active: true },
    { id: "moderator", name: "Moderator", desc: "Moderate community, reviews, fan battles, comments and user feedback.", icon: <Shield size={16} color="#e3b341" />, color: "#e3b341", status: "optional", active: false },
    { id: "live-show-host", name: "Live Show Host", desc: "Host live shows, manage guests, live chat and live session operations.", icon: <Video size={16} color="#238636" />, color: "#238636", status: "optional", active: false },
    { id: "csr-manager", name: "CSR Manager", desc: "Manage CSR programs, campaigns and athlete CSR content.", icon: <Heart size={16} color="#d29922" />, color: "#d29922", status: "optional", active: false },
    { id: "sf360-staff", name: "SF360 Staff", desc: "Internal staff with limited access to assigned modules and tools.", icon: <Briefcase size={16} color="#ff7b72" />, color: "#ff7b72", status: "optional", active: false },
  ]);

  const toggleRole = (id: string) => {
    setRoles(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const toggleStatus = (id: string) => {
    setRoles(prev => prev.map(r => r.id === id ? { ...r, status: r.status === "required" ? "optional" : "required" } : r));
  };

  const clearAll = () => {
    setRoles(prev => prev.map(r => ({ ...r, active: false })));
  };

  return (
    <div style={{ padding: "0 24px 80px 24px", color: "#e6edf3", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#7d8590", marginBottom: "16px", marginTop: "16px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          <span>User Management</span>
          <ChevronRight size={14} />
          <Link href="/admin/userroles-management/assign-roles" style={{ color: "#7d8590", textDecoration: "none" }}>
            User Roles
          </Link>
          <ChevronRight size={14} />
          <span style={{ color: "#e6edf3", fontWeight: 500 }}>Edit User Type</span>
        </div>
        
        <button style={{ background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <Settings size={14} /> Role Management
        </button>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0" }}>Edit User Type</h1>
        <p style={{ color: "#7d8590", margin: 0, fontSize: "14px" }}>Update role assignments for this type of users.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px" }}>
        {/* Left Side: Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* User Type Information */}
          <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 20px 0" }}>User Type Information</h3>
            <div style={{ display: "flex", gap: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "96px", height: "96px", borderRadius: "8px", background: "#161b22", border: "1px dashed #30363d", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "8px", background: "rgba(46, 160, 67, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                    <PenTool size={24} color="#2ea043" />
                  </div>
                  <div style={{ position: "absolute", top: -6, right: -6, background: "#1f6feb", borderRadius: "50%", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                     <Edit2 size={12} color="#fff" />
                  </div>
                </div>
                <button style={{ background: "transparent", border: "none", color: "#388bfd", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}>
                  Change Icon
                </button>
                <span style={{ fontSize: "10px", color: "#7d8590", textAlign: "center", lineHeight: "1.4" }}>JPG, PNG or SVG<br/>Max 2MB</span>
              </div>
              
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#e6edf3", marginBottom: "6px" }}>User Type Name <span style={{ color: "#f85149" }}>*</span></label>
                  <input type="text" defaultValue="Content Creator" style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 12px", borderRadius: "6px", fontSize: "14px", outline: "none" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#e6edf3", marginBottom: "6px" }}>Description <span style={{ color: "#f85149" }}>*</span></label>
                  <textarea defaultValue="Creates and manages content, articles, media and team/player profiles." style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 12px", borderRadius: "6px", fontSize: "14px", outline: "none", minHeight: "60px", resize: "vertical" }} />
                </div>
                
                <div style={{ display: "flex", gap: "48px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", color: "#e6edf3", marginBottom: "8px" }}>Status</label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "36px", height: "20px", background: "#238636", borderRadius: "10px", padding: "2px", position: "relative", cursor: "pointer" }}>
                        <div style={{ width: "16px", height: "16px", background: "#fff", borderRadius: "50%", transform: "translateX(16px)" }} />
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "#e6edf3" }}>Active</span>
                    </div>
                    <span style={{ display: "block", fontSize: "11px", color: "#7d8590", marginTop: "4px" }}>Inactive user types will not be available for assignment.</span>
                  </div>
                  
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#e6edf3", marginBottom: "8px" }}>
                      Default Role Assignment <Info size={14} color="#7d8590" />
                    </label>
                    <span style={{ display: "block", fontSize: "11px", color: "#7d8590", marginTop: "4px", maxWidth: "250px" }}>Roles selected here will be assigned by default to new users of this type.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Roles Area */}
          <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", overflow: "hidden" }}>
            {/* Inner Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #30363d", background: "#161b22" }}>
              <div 
                onClick={() => setActiveTab("Assigned Roles")}
                style={{ padding: "12px 20px", fontSize: "13px", fontWeight: 500, cursor: "pointer", color: activeTab === "Assigned Roles" ? "#e6edf3" : "#7d8590", borderBottom: activeTab === "Assigned Roles" ? "2px solid #388bfd" : "2px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Users size={16} /> Assigned Roles
              </div>
              <div 
                onClick={() => setActiveTab("Permission Preview")}
                style={{ padding: "12px 20px", fontSize: "13px", fontWeight: 500, cursor: "pointer", color: activeTab === "Permission Preview" ? "#e6edf3" : "#7d8590", borderBottom: activeTab === "Permission Preview" ? "2px solid #388bfd" : "2px solid transparent", display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Shield size={16} /> Permission Preview
              </div>
            </div>

            <div style={{ padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span style={{ fontSize: "13px", color: "#7d8590" }}>Assign roles that users of this type will have access to.</span>
                <div style={{ display: "flex", gap: "12px" }}>
                  <div style={{ position: "relative" }}>
                    <Search size={14} color="#7d8590" style={{ position: "absolute", left: 10, top: 8 }} />
                    <input type="text" placeholder="Search roles..." style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3", padding: "6px 12px 6px 32px", borderRadius: "6px", fontSize: "13px", width: "180px", outline: "none" }} />
                  </div>
                  <button style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <Filter size={14} /> Filter
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {roles.map(role => (
                  <div key={role.id} style={{ display: "flex", alignItems: "center", padding: "12px", border: "1px solid #30363d", borderRadius: "6px", background: "#161b22", transition: "all 0.2s" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: `rgba(${parseInt(role.color.slice(1,3),16)},${parseInt(role.color.slice(3,5),16)},${parseInt(role.color.slice(5,7),16)},0.1)`, display: "flex", alignItems: "center", justifyContent: "center", marginRight: "16px" }}>
                      {role.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>{role.name}</div>
                      <div style={{ fontSize: "12px", color: "#7d8590" }}>{role.desc}</div>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div onClick={() => toggleRole(role.id)} style={{ width: "36px", height: "20px", background: role.active ? "#2ea043" : "#30363d", borderRadius: "10px", padding: "2px", position: "relative", cursor: "pointer", transition: "all 0.2s" }}>
                        <div style={{ width: "16px", height: "16px", background: role.active ? "#fff" : "#8b949e", borderRadius: "50%", transform: role.active ? "translateX(16px)" : "translateX(0)", transition: "all 0.2s" }} />
                      </div>
                      <div onClick={() => toggleStatus(role.id)} style={{ width: "60px", cursor: "pointer", textAlign: "center", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "10px", color: role.status === "required" ? "#2ea043" : "#7d8590", border: `1px solid ${role.status === "required" ? "rgba(46,160,67,0.4)" : "#30363d"}` }}>
                        {role.status === "required" ? "Required" : "Optional"}
                      </div>
                      <Settings size={14} color="#7d8590" style={{ cursor: "pointer" }} />
                    </div>
                  </div>
                ))}

                <button style={{ background: "transparent", border: "1px dashed #30363d", color: "#388bfd", padding: "12px", borderRadius: "6px", fontSize: "13px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "8px" }}>
                  <Plus size={16} /> Add Role
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: Summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 20px 0" }}>User Type Summary</h3>
            
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #30363d" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "rgba(46, 160, 67, 0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PenTool size={20} color="#2ea043" />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>Content Creator</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#2ea043" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2ea043" }} /> Active
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#7d8590", marginBottom: "4px" }}>Created By</div>
                <div style={{ fontSize: "12px", color: "#e6edf3" }}>Admin</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#7d8590", marginBottom: "4px" }}>Created On</div>
                <div style={{ fontSize: "12px", color: "#e6edf3" }}>May 10, 2024 10:30 AM</div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: "11px", color: "#7d8590", marginBottom: "4px" }}>Last Updated</div>
                <div style={{ fontSize: "12px", color: "#e6edf3" }}>May 20, 2024 02:45 PM</div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #30363d", paddingTop: "20px" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 16px 0", color: "#e6edf3" }}>Role Assignment Summary</h4>
              
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
                <div style={{ position: "relative", width: "70px", height: "70px", flexShrink: 0 }}>
                  <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}>
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#21262d" strokeWidth="12" />
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#2ea043" strokeWidth="12" strokeDasharray={`${(roles.filter(r => r.active).length / roles.length) * 251} 251`} strokeDashoffset="0" style={{ transition: "stroke-dasharray 0.3s" }} />
                  </svg>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700 }}>{roles.filter(r => r.active).length}</div>
                    <div style={{ fontSize: "9px", color: "#7d8590" }}>of {roles.length}</div>
                  </div>
                </div>
                
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2ea043" }}/> <span style={{ color: "#e6edf3" }}>Required Roles</span></div>
                    <span style={{ fontWeight: 600 }}>{roles.filter(r => r.active && r.status === "required").length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#388bfd" }}/> <span style={{ color: "#e6edf3" }}>Optional Roles</span></div>
                    <span style={{ fontWeight: 600 }}>{roles.filter(r => r.active && r.status === "optional").length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#8b949e" }}/> <span style={{ color: "#e6edf3" }}>Not Assigned</span></div>
                    <span style={{ fontWeight: 600 }}>{roles.filter(r => !r.active).length}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ fontSize: "12px", color: "#e6edf3", margin: 0, fontWeight: 600 }}>Assigned Roles ({roles.filter(r => r.active).length})</h4>
                  <button onClick={clearAll} style={{ background: "none", border: "none", color: "#388bfd", fontSize: "11px", cursor: "pointer" }}>Clear All</button>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {roles.filter(r => r.active).map(role => (
                    <div key={role.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#161b22", border: "1px solid #30363d", padding: "8px 12px", borderRadius: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {React.cloneElement(role.icon, { size: 14, color: role.color })}
                        <span style={{ fontSize: "12px", fontWeight: 500, color: "#e6edf3" }}>{role.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "10px", color: role.status === "required" ? "#2ea043" : "#7d8590" }}>{role.status === "required" ? "Required" : "Optional"}</span>
                        <X onClick={() => toggleRole(role.id)} size={14} color="#7d8590" style={{ cursor: "pointer" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: "rgba(56, 139, 253, 0.05)", padding: "12px", borderRadius: "6px", border: "1px solid rgba(56, 139, 253, 0.1)" }}>
                <Info size={14} color="#388bfd" style={{ marginTop: "2px", flexShrink: 0 }} />
                <div style={{ fontSize: "11px", color: "#8b949e", lineHeight: "1.5" }}>
                  <span style={{ color: "#e6edf3", fontWeight: 500 }}>Note</span><br />
                  Changes to role assignments will only affect new users of this type. Existing users will not be impacted.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div style={{ position: "fixed", bottom: 0, left: 220, right: 0, padding: "16px 24px", background: "#161b22", borderTop: "1px solid #30363d", display: "flex", justifyContent: "space-between", zIndex: 10 }}>
        <Link href="/admin/userroles-management/assign-roles" style={{ textDecoration: "none" }}>
          <button style={{ background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
            <ArrowLeft size={16} /> Back
          </button>
        </Link>
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
