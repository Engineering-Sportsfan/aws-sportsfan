"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, Settings, ArrowLeft, RotateCcw, Check, Info, Shield, Search, User as UserIcon, Edit2, Play, CircleDot, CheckCircle2, ChevronDown } from "lucide-react";

export default function CustomRoleMapping() {

  const [modules, setModules] = React.useState([
    { name: "Overview & Management", color: "#388bfd", selected: true, active: true },
    { name: "Content & Live", color: "#e3b341", selected: true, active: false },
    { name: "Athlete Features", color: "#ff7b72", selected: true, active: false },
    { name: "Monetisation", color: "#2ea043", selected: true, active: false },
    { name: "Ecommerce", color: "#a371f7", selected: false, active: false },
    { name: "Community & Moderation", color: "#d29922", selected: true, active: false },
    { name: "System", color: "#7d8590", selected: false, active: false },
  ]);

  const [permissions, setPermissions] = React.useState([
    { name: "Dashboard", desc: "View platform dashboard and analytics overview", icon: <UserIcon size={14}/>, val: "view" },
    { name: "Analytics & Reports", desc: "Access analytics and generate reports", icon: <UserIcon size={14}/>, val: "view" },
    { name: "Users Management", desc: "Manage users and their access", icon: <UserIcon size={14}/>, val: "edit" },
    { name: "OTP Logs", desc: "View OTP activity and logs", icon: <UserIcon size={14}/>, val: "view" },
    { name: "Audit Log", desc: "View audit logs and system activities", icon: <UserIcon size={14}/>, val: "view" },
    { name: "Verification Queue", desc: "Review and manage verification requests", icon: <UserIcon size={14}/>, val: "edit" },
    { name: "Feature Flags", desc: "Manage feature flags and rollouts", icon: <UserIcon size={14}/>, val: "no" },
    { name: "Developer Config", desc: "Manage developer configurations", icon: <UserIcon size={14}/>, val: "no" },
    { name: "Settings", desc: "Manage platform settings", icon: <UserIcon size={14}/>, val: "edit" },
  ]);

  const handleModuleClick = (index: number) => {
    setModules(prev => prev.map((m, i) => ({ ...m, active: i === index })));
  };

  const handleModuleToggle = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setModules(prev => prev.map((m, i) => i === index ? { ...m, selected: !m.selected } : m));
  };

  const setPermission = (index: number, val: string) => {
    setPermissions(prev => prev.map((p, i) => i === index ? { ...p, val } : p));
  };

  return (
    <div style={{ padding: "0 24px 80px 24px", color: "#e6edf3", maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        .hover-btn { transition: all 0.2s; }
        .hover-btn:hover { background: rgba(56, 139, 253, 0.1) !important; border-color: #388bfd !important; }
        .hover-module { transition: background 0.2s; }
        .hover-module:hover { background: rgba(22, 27, 34, 0.8) !important; cursor: pointer; }
        .hover-checkbox { cursor: pointer; transition: transform 0.1s; }
        .hover-checkbox:active { transform: scale(0.9); }
      `}</style>
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
          <span style={{ color: "#e6edf3", fontWeight: 500 }}>Custom Role Mapping</span>
        </div>
        
        <button className="hover-btn" style={{ background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <Settings size={14} /> Role Management
        </button>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0" }}>Custom Role Mapping</h1>
        <p style={{ color: "#7d8590", margin: 0, fontSize: "14px" }}>Create a custom role by selecting modules and permissions.</p>
      </div>

      {/* Progress Steps */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "32px", maxWidth: "600px", margin: "0 auto 32px auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#e6edf3", fontSize: "13px", fontWeight: 500 }}>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#1f6feb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>1</div>
          Role Information
        </div>
        <div style={{ flex: 1, height: "2px", background: "#1f6feb", margin: "0 16px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#e6edf3", fontSize: "13px", fontWeight: 500 }}>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#1f6feb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>2</div>
          Module & Permissions
        </div>
        <div style={{ flex: 1, height: "2px", background: "#30363d", margin: "0 16px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#7d8590", fontSize: "13px", fontWeight: 500 }}>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#21262d", border: "1px solid #30363d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>3</div>
          Review & Save
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px" }}>
        {/* Left Side: Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px" }}>
            <div style={{ padding: "20px", borderBottom: "1px solid #30363d" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 4px 0", color: "#e6edf3" }}>Select Modules & Permissions</h3>
              <p style={{ fontSize: "13px", color: "#7d8590", margin: 0 }}>Choose modules and set permission level for this custom role.</p>
            </div>

            <div style={{ display: "flex" }}>
              {/* Modules Sidebar */}
              <div style={{ width: "260px", borderRight: "1px solid #30363d", padding: "16px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 12px 0", color: "#e6edf3" }}>Modules</h4>
                <div style={{ position: "relative", marginBottom: "16px" }}>
                  <Search size={14} color="#7d8590" style={{ position: "absolute", left: 10, top: 10 }} />
                  <input type="text" placeholder="Search modules..." style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 12px 8px 32px", borderRadius: "6px", fontSize: "13px", outline: "none" }} />
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {modules.map((m, i) => (
                    <div key={i} className="hover-module" onClick={() => handleModuleClick(i)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: m.active ? "rgba(31,111,235,0.1)" : "transparent", borderRadius: "6px", cursor: "pointer", borderLeft: m.active ? "2px solid #388bfd" : "2px solid transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div className="hover-checkbox" onClick={(e) => handleModuleToggle(i, e)} style={{ width: "16px", height: "16px", borderRadius: "4px", background: m.selected ? "#1f6feb" : "transparent", border: m.selected ? "none" : "1px solid #30363d", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {m.selected && <Check size={12} color="#fff" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: "13px", color: m.active ? "#e6edf3" : (m.selected ? "#c9d1d9" : "#7d8590"), fontWeight: m.active ? 600 : 400 }}>{m.name}</span>
                      </div>
                      {m.active && <ChevronRight size={14} color="#388bfd" />}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #30363d", fontSize: "12px", color: "#7d8590" }}>
                  5 of 7 modules selected
                </div>
              </div>

              {/* Permissions Area */}
              <div style={{ flex: 1, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                  <div>
                    <h3 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 4px 0", color: "#e6edf3" }}>Overview & Management</h3>
                    <p style={{ fontSize: "13px", color: "#7d8590", margin: 0 }}>Manage platform overview and core management features.</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#388bfd", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
                    <CheckCircle2 size={14} /> Select All <ChevronDown size={14} />
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #30363d" }}>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", fontWeight: 500, color: "#7d8590" }}>Permissions</th>
                      <th style={{ textAlign: "center", padding: "12px 8px", fontSize: "12px", fontWeight: 500, color: "#7d8590", width: "70px" }}>No Access</th>
                      <th style={{ textAlign: "center", padding: "12px 8px", fontSize: "12px", fontWeight: 500, color: "#7d8590", width: "70px" }}>View</th>
                      <th style={{ textAlign: "center", padding: "12px 8px", fontSize: "12px", fontWeight: 500, color: "#7d8590", width: "70px" }}>Edit</th>
                      <th style={{ textAlign: "center", padding: "12px 8px", fontSize: "12px", fontWeight: 500, color: "#7d8590", width: "70px" }}>Full Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((p, i) => (
                      <tr key={i} style={{ borderBottom: i < permissions.length - 1 ? "1px solid #21262d" : "none" }}>
                        <td style={{ padding: "16px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{ color: "#7d8590" }}>{p.icon}</div>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 500, color: "#e6edf3", marginBottom: "2px" }}>{p.name}</div>
                              <div style={{ fontSize: "11px", color: "#7d8590" }}>{p.desc}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div className="hover-checkbox" onClick={() => setPermission(i, "no")} style={{ width: "16px", height: "16px", borderRadius: "50%", border: p.val === "no" ? "none" : "1px solid #7d8590", background: p.val === "no" ? "#1f6feb" : "transparent", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {p.val === "no" && <Check size={10} color="#fff" strokeWidth={3} />}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div className="hover-checkbox" onClick={() => setPermission(i, "view")} style={{ width: "16px", height: "16px", borderRadius: "50%", border: p.val === "view" ? "none" : "1px solid #7d8590", background: p.val === "view" ? "#1f6feb" : "transparent", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {p.val === "view" && <Check size={10} color="#fff" strokeWidth={3} />}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div className="hover-checkbox" onClick={() => setPermission(i, "edit")} style={{ width: "16px", height: "16px", borderRadius: "50%", border: p.val === "edit" ? "none" : "1px solid #7d8590", background: p.val === "edit" ? "#1f6feb" : "transparent", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {p.val === "edit" && <Check size={10} color="#fff" strokeWidth={3} />}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div className="hover-checkbox" onClick={() => setPermission(i, "full")} style={{ width: "16px", height: "16px", borderRadius: "50%", border: p.val === "full" ? "none" : "1px solid #7d8590", background: p.val === "full" ? "#1f6feb" : "transparent", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {p.val === "full" && <Check size={10} color="#fff" strokeWidth={3} />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Info */}
            <div style={{ padding: "16px", borderTop: "1px solid #30363d" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: "rgba(56, 139, 253, 0.05)", padding: "12px", borderRadius: "6px", border: "1px solid rgba(56, 139, 253, 0.1)" }}>
                <Info size={16} color="#388bfd" style={{ marginTop: "1px", flexShrink: 0 }} />
                <div style={{ fontSize: "12px", color: "#c9d1d9", lineHeight: "1.5" }}>
                  <span style={{ color: "#e6edf3", fontWeight: 500 }}>Note:</span> 'View' allows read-only access, 'Edit' allows modifications, and 'Full Access' includes all actions.
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: Summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 20px 0" }}>Custom Role Summary</h3>
            
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #30363d", textAlign: "center" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "12px", background: "rgba(163, 113, 247, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                <UserIcon size={28} color="#a371f7" />
              </div>
              <div style={{ fontSize: "11px", color: "#7d8590", marginBottom: "6px" }}>Custom Role Name</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "#e6edf3" }}>Support Editor</span>
                <Edit2 size={12} color="#388bfd" style={{ cursor: "pointer" }} />
              </div>
            </div>

            <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #30363d" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#e6edf3", marginBottom: "8px" }}>Description</div>
              <div style={{ fontSize: "12px", color: "#7d8590", lineHeight: "1.5" }}>Role to manage support related content and community interactions.</div>
            </div>

            <div style={{ marginBottom: "24px", paddingBottom: "20px", borderBottom: "1px solid #30363d" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ fontSize: "12px", fontWeight: 600, margin: 0, color: "#e6edf3" }}>Modules Selected</h4>
                <span style={{ fontSize: "11px", color: "#7d8590" }}>5 of 7</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {modules.filter(m => m.selected).map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#e6edf3" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "2px", background: m.color }} />
                    {m.name}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 16px 0", color: "#e6edf3" }}>Permission Overview</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "rgba(163, 113, 247, 0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a371f7" }}/></div>
                    <span style={{ color: "#7d8590" }}>Full Access</span>
                  </div>
                  <span style={{ color: "#e6edf3", fontWeight: 600 }}>6</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "rgba(56, 139, 253, 0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#388bfd" }}/></div>
                    <span style={{ color: "#7d8590" }}>Edit Access</span>
                  </div>
                  <span style={{ color: "#e6edf3", fontWeight: 600 }}>12</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "rgba(46, 160, 67, 0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2ea043" }}/></div>
                    <span style={{ color: "#7d8590" }}>View Access</span>
                  </div>
                  <span style={{ color: "#e6edf3", fontWeight: 600 }}>14</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "rgba(139, 148, 158, 0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#8b949e" }}/></div>
                    <span style={{ color: "#7d8590" }}>No Access</span>
                  </div>
                  <span style={{ color: "#e6edf3", fontWeight: 600 }}>8</span>
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
          <button style={{ background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}>
            Save as Draft
          </button>
          <button style={{ background: "#1f6feb", border: "none", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
            Next: Review & Save <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
