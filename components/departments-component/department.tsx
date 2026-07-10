"use client";

import React from "react";
import Link from "next/link";
import { Search, Filter, ChevronRight, User, Users, Edit2, Shield, Settings, Plus, Download, Network, Share2, MoreVertical, Briefcase, Radio, Star } from "lucide-react";

export default function DepartmentList() {
  const departments = [
    { name: "Operations", desc: "Handles platform operations, user management and system settings.", head: "Rahul Mehta", headEmail: "rahul.mehta@sf360.com", users: 24, status: "Active", icon: <User size={16} color="#d2a8ff" />, bg: "rgba(210,168,255,.1)" },
    { name: "Content & Editorial", desc: "Manages content creation, articles, media and author operations.", head: "Priya Sharma", headEmail: "priya.sharma@sf360.com", users: 18, status: "Active", icon: <Edit2 size={16} color="#388bfd" />, bg: "rgba(56,139,253,.1)" },
    { name: "Live Production", desc: "Oversees live shows, hosts, guests and live center operations.", head: "Vikram Singh", headEmail: "vikram.singh@sf360.com", users: 15, status: "Active", icon: <Radio size={16} color="#00b2cd" />, bg: "rgba(0,178,205,.1)" },
    { name: "Community & Moderation", desc: "Manages community health, moderation, feedback and fan engagement.", head: "Neha Kapoor", headEmail: "neha.kapoor@sf360.com", users: 12, status: "Active", icon: <Star size={16} color="#3fb950" />, bg: "rgba(63,185,80,.1)" },
    { name: "Ecommerce", desc: "Handles store, products, orders and partner management.", head: "Arjun Das", headEmail: "arjun.das@sf360.com", users: 9, status: "Active", icon: <Briefcase size={16} color="#f85149" />, bg: "rgba(248,81,73,.1)" },
    { name: "Compliance & Security", desc: "Responsible for verification, security, audit and compliance.", head: "Rohit Verma", headEmail: "rohit.verma@sf360.com", users: 6, status: "Active", icon: <Shield size={16} color="#2ea043" />, bg: "rgba(46,160,67,.1)" },
    { name: "Marketing & CSR", desc: "Manages CSR programs, campaigns and marketing initiatives.", head: "Ananya Iyer", headEmail: "ananya.iyer@sf360.com", users: 7, status: "Active", icon: <Share2 size={16} color="#e3b341" />, bg: "rgba(227,179,65,.1)" },
    { name: "Technology", desc: "Handles system development, devops and technical support.", head: "Karan Nair", headEmail: "karan.nair@sf360.com", users: 14, status: "Inactive", icon: <Settings size={16} color="#a371f7" />, bg: "rgba(163,113,247,.1)" },
    { name: "Human Resources", desc: "Manages HR operations, recruitment and employee relations.", head: "Siddharth Rao", headEmail: "siddharth.rao@sf360.com", users: 5, status: "Inactive", icon: <Users size={16} color="#7d8590" />, bg: "rgba(125,133,144,.1)" },
    { name: "Finance", desc: "Handles financial planning, billing, reports and accounting.", head: "Meera Joshi", headEmail: "meera.joshi@sf360.com", users: 4, status: "Inactive", icon: <Briefcase size={16} color="#7d8590" />, bg: "rgba(125,133,144,.1)" },
  ];

  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("All Status");

  const filteredDepartments = departments.filter(dept => {
    const matchesSearch = dept.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          dept.head.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          dept.desc.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All Status" || dept.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ padding: "0 24px 80px 24px", color: "#e6edf3", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0" }}>Departments</h1>
          <p style={{ color: "#7d8590", margin: 0, fontSize: "14px" }}>Organize your team by departments. Manage department information and hierarchy.</p>
        </div>
        <Link href="/admin/department-management/add-department-form" style={{ textDecoration: "none" }}>
          <button style={{ background: "#1f6feb", border: "none", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
            <Plus size={16} /> Add Department
          </button>
        </Link>
      </div>

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* Main Table Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Controls */}
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#7d8590" }} />
              <input 
                type="text" 
                placeholder="Search departments..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px 8px 32px", color: "#e6edf3", fontSize: "13px", outline: "none", width: "100%" }} 
              />
            </div>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px", color: "#e6edf3", fontSize: "13px", outline: "none", width: "160px", appearance: "none" }}
            >
              <option value="All Status">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {/* Table */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 180px 80px 100px 60px", padding: "12px 20px", borderBottom: "1px solid #30363d", fontSize: "12px", color: "#7d8590", fontWeight: 600 }}>
              <div>Department Name</div>
              <div>Description</div>
              <div>Head / Manager</div>
              <div style={{ textAlign: "center" }}>Users</div>
              <div style={{ textAlign: "center" }}>Status</div>
              <div style={{ textAlign: "center" }}>Actions</div>
            </div>
            
            {filteredDepartments.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#7d8590" }}>No departments found matching your filters.</div>
            ) : (
              filteredDepartments.map((dept, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "200px 1fr 180px 80px 100px 60px", padding: "16px 20px", borderBottom: "1px solid #30363d", fontSize: "13px", alignItems: "center", transition: "background 0.2s", cursor: "pointer" }} onMouseOver={e => e.currentTarget.style.background = "#21262d"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: dept.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {dept.icon}
                  </div>
                  <span style={{ fontWeight: 500, color: "#e6edf3" }}>{dept.name}</span>
                </div>
                <div style={{ color: "#7d8590", paddingRight: "20px", lineHeight: "1.4" }}>
                  {dept.desc}
                </div>
                <div>
                  <div style={{ fontWeight: 500, color: "#e6edf3", marginBottom: "2px" }}>{dept.head}</div>
                  <div style={{ fontSize: "11px", color: "#7d8590" }}>{dept.headEmail}</div>
                </div>
                <div style={{ textAlign: "center", color: "#e6edf3" }}>
                  {dept.users}
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, color: dept.status === "Active" ? "#3fb950" : "#388bfd", border: `1px solid ${dept.status === "Active" ? "rgba(46,160,67,.4)" : "rgba(56,139,253,.4)"}` }}>
                    {dept.status}
                  </span>
                </div>
                <div style={{ textAlign: "center", color: "#7d8590" }}>
                  <MoreVertical size={16} style={{ cursor: "pointer" }} />
                </div>
              </div>
            )))}
            
            {/* Pagination */}
            <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#7d8590", fontSize: "12px" }}>
              <div>Showing 1 to 10 of 10 departments</div>
              <div style={{ display: "flex", gap: "4px" }}>
                <button style={{ background: "transparent", border: "1px solid #30363d", color: "#7d8590", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /></button>
                <button style={{ background: "#1f6feb", border: "1px solid #1f6feb", color: "#fff", padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontWeight: 500 }}>1</button>
                <button style={{ background: "transparent", border: "1px solid #30363d", color: "#7d8590", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{ width: "300px", display: "flex", flexDirection: "column", gap: "20px" }}>
          
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", margin: "0 0 20px 0", fontWeight: 600 }}>Department Summary</h3>
            
            <div style={{ position: "relative", width: "160px", height: "160px", margin: "0 auto 24px auto" }}>
              {/* Fake Donut Chart */}
              <div style={{ width: "160px", height: "160px", borderRadius: "50%", border: "16px solid #30363d", borderTopColor: "#d2a8ff", borderRightColor: "#388bfd", borderBottomColor: "#3fb950", borderLeftColor: "#a371f7", transform: "rotate(-15deg)" }}></div>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "#e6edf3" }}>10</div>
                <div style={{ fontSize: "11px", color: "#7d8590", textAlign: "center" }}>Total<br/>Departments</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", textAlign: "center", borderTop: "1px solid #30363d", paddingTop: "16px" }}>
              <div>
                <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Active</div>
                <div style={{ fontSize: "18px", fontWeight: 600, color: "#e6edf3" }}>7</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Inactive</div>
                <div style={{ fontSize: "18px", fontWeight: 600, color: "#e6edf3" }}>3</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Total Users</div>
                <div style={{ fontSize: "18px", fontWeight: 600, color: "#e6edf3" }}>114</div>
              </div>
            </div>
          </div>

          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", margin: "0 0 16px 0", fontWeight: 600 }}>Quick Actions</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Link href="/admin/department-management/add-department-form" style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.opacity = "0.8"} onMouseOut={e => e.currentTarget.style.opacity = "1"}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(56,139,253,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Plus size={16} color="#388bfd" />
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#e6edf3", marginBottom: "2px" }}>Add Department</div>
                    <div style={{ fontSize: "11px", color: "#7d8590" }}>Create a new department</div>
                  </div>
                </div>
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.opacity = "0.8"} onMouseOut={e => e.currentTarget.style.opacity = "1"}>
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(56,139,253,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Network size={16} color="#388bfd" />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "#e6edf3", marginBottom: "2px" }}>View Hierarchy</div>
                  <div style={{ fontSize: "11px", color: "#7d8590" }}>See department structure</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.opacity = "0.8"} onMouseOut={e => e.currentTarget.style.opacity = "1"}>
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(56,139,253,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Download size={16} color="#388bfd" />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "#e6edf3", marginBottom: "2px" }}>Export Departments</div>
                  <div style={{ fontSize: "11px", color: "#7d8590" }}>Download department list</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", margin: "0 0 16px 0", fontWeight: 600 }}>Recent Activity</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "relative" }}>
              <div style={{ position: "absolute", top: "10px", bottom: "10px", left: "5px", width: "1px", background: "#30363d" }}></div>
              
              <div style={{ display: "flex", gap: "12px", position: "relative", zIndex: 1 }}>
                <div style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#161b22", border: "2px solid #2ea043", marginTop: "4px", flexShrink: 0 }}></div>
                <div>
                  <div style={{ fontSize: "12px", color: "#e6edf3", marginBottom: "4px" }}>Operations department updated</div>
                  <div style={{ fontSize: "11px", color: "#7d8590" }}>May 20, 2024 02:45 PM</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", position: "relative", zIndex: 1 }}>
                <div style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#161b22", border: "2px solid #388bfd", marginTop: "4px", flexShrink: 0 }}></div>
                <div>
                  <div style={{ fontSize: "12px", color: "#e6edf3", marginBottom: "4px" }}>Technology department added</div>
                  <div style={{ fontSize: "11px", color: "#7d8590" }}>May 18, 2024 11:30 AM</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", position: "relative", zIndex: 1 }}>
                <div style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#161b22", border: "2px solid #f85149", marginTop: "4px", flexShrink: 0 }}></div>
                <div>
                  <div style={{ fontSize: "12px", color: "#e6edf3", marginBottom: "4px" }}>Marketing & CSR department updated</div>
                  <div style={{ fontSize: "11px", color: "#7d8590" }}>May 15, 2024 09:10 AM</div>
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "#388bfd", marginTop: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                View all activity <ChevronRight size={12} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}