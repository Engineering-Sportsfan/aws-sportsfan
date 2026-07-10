"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronRight, Upload, Check, Shield, User, Edit2, Lock, ArrowLeft, Settings, Search, MonitorPlay, MessageSquare, DollarSign, LayoutTemplate, Users } from "lucide-react";

export default function AddUserForm() {
  const [step, setStep] = useState(1);

  // Fake states for UI toggles
  const [roles, setRoles] = useState({
    admin: false,
    contentCreator: false,
    author: false,
    moderator: true, // Example default
    liveHost: false,
    csrManager: false,
    contentOrganizer: false,
    sf360Staff: false,
  });

  const toggleRole = (key: keyof typeof roles) => {
    setRoles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const activeRolesCount = Object.values(roles).filter(Boolean).length;
  // Fake total permissions count
  const totalPermissions = activeRolesCount * 12 + (roles.admin ? 12 : 0) + (roles.contentCreator ? 8 : 0);

  if (step === 2) {
    return (
      <div style={{ padding: "0 24px 80px 24px", color: "#e6edf3", maxWidth: "1200px", margin: "0 auto" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#7d8590", marginBottom: "16px", marginTop: "16px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><User size={14} /> User Management</span>
          <ChevronRight size={14} />
          <span>Create Admin User</span>
          <ChevronRight size={14} />
          <span style={{ color: "#e6edf3", fontWeight: 500 }}>Review & Confirm</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0" }}>Create New Admin User</h1>
          <p style={{ color: "#7d8590", margin: 0, fontSize: "14px" }}>Review all details before creating the user account.</p>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px", fontSize: "14px", fontWeight: 500 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#3fb950" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#3fb950", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={14} />
            </div>
            User Information
          </div>
          <div style={{ flex: 1, height: "1px", background: "#30363d" }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#3fb950" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#3fb950", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={14} />
            </div>
            Assign Roles & Permissions
          </div>
          <div style={{ flex: 1, height: "1px", background: "#30363d" }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#e6edf3" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#1f6feb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              3
            </div>
            Review & Confirm
          </div>
        </div>

        <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
          {/* Main Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* User Info Card */}
            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "24px", position: "relative" }}>
              <h2 style={{ fontSize: "16px", margin: "0 0 24px 0", fontWeight: 600 }}>User Information</h2>
              <button onClick={() => setStep(1)} style={{ position: "absolute", top: "24px", right: "24px", background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                <Edit2 size={14} /> Edit
              </button>
              
              <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                <div style={{ position: "relative" }}>
                  <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#388bfd", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 600 }}>RM</div>
                  <div style={{ position: "absolute", bottom: 0, right: 0, width: "20px", height: "20px", background: "#161b22", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: "16px", height: "16px", background: "#2ea043", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Check size={10} />
                    </div>
                  </div>
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                    <span style={{ fontSize: "18px", fontWeight: 600 }}>Rahul Mehta</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, color: "#3fb950", border: "1px solid rgba(46,160,67,.4)" }}>
                      <Check size={10} /> Verified
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Email Address</div>
                      <div style={{ fontSize: "13px", color: "#e6edf3" }}>rahul.mehta@sf360.com</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Phone Number</div>
                      <div style={{ fontSize: "13px", color: "#e6edf3" }}>+91 98765 43210</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Employee ID</div>
                      <div style={{ fontSize: "13px", color: "#e6edf3" }}>SF360-EMP-1245</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Department</div>
                      <div style={{ fontSize: "13px", color: "#e6edf3" }}>Operations</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Account Status</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#e6edf3" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2ea043" }}></div>
                        Active
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Date Added</div>
                      <div style={{ fontSize: "13px", color: "#e6edf3" }}>May 20, 2024 11:30 AM</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Assigned Roles Card */}
            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "24px", position: "relative" }}>
              <h2 style={{ fontSize: "16px", margin: "0 0 24px 0", fontWeight: 600 }}>Assigned Roles</h2>
              <button onClick={() => setStep(1)} style={{ position: "absolute", top: "24px", right: "24px", background: "transparent", border: "1px solid #30363d", color: "#e6edf3", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                <Edit2 size={14} /> Edit
              </button>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", gap: "12px", padding: "16px", border: "1px solid #30363d", borderRadius: "8px", background: "rgba(56,139,253,.05)" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(56,139,253,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Shield size={16} color="#388bfd" />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>Admin</div>
                    <div style={{ fontSize: "12px", color: "#7d8590", lineHeight: "1.4" }}>Manage platform operations, users, content and system settings.</div>
                  </div>
                </div>
                
                <div style={{ display: "flex", gap: "12px", padding: "16px", border: "1px solid #30363d", borderRadius: "8px", background: "rgba(46,160,67,.05)" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(46,160,67,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Edit2 size={16} color="#2ea043" />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>Content Creator</div>
                    <div style={{ fontSize: "12px", color: "#7d8590", lineHeight: "1.4" }}>Create and manage content, articles, media and profiles.</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", padding: "16px", border: "1px solid #30363d", borderRadius: "8px", background: "rgba(210,168,255,.05)" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(210,168,255,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Edit2 size={16} color="#d2a8ff" />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>Author</div>
                    <div style={{ fontSize: "12px", color: "#7d8590", lineHeight: "1.4" }}>Write and submit articles. Manage author profile and content.</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", padding: "16px", border: "1px solid #30363d", borderRadius: "8px", background: "rgba(0,178,205,.05)" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(0,178,205,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <MonitorPlay size={16} color="#00b2cd" />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>Live Show Host</div>
                    <div style={{ fontSize: "12px", color: "#7d8590", lineHeight: "1.4" }}>Host live shows, manage guests, live chat and operations.</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", padding: "16px", border: "1px solid #30363d", borderRadius: "8px", background: "rgba(227,179,65,.05)" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(227,179,65,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Shield size={16} color="#e3b341" />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>Moderator</div>
                    <div style={{ fontSize: "12px", color: "#7d8590", lineHeight: "1.4" }}>Moderate community, reviews, fan battles and user feedback.</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", padding: "16px", border: "1px solid #30363d", borderRadius: "8px", background: "rgba(63,185,80,.05)" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(63,185,80,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <User size={16} color="#3fb950" />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>CSR Manager</div>
                    <div style={{ fontSize: "12px", color: "#7d8590", lineHeight: "1.4" }}>Manage CSR programs, campaigns and athlete CSR content.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Role Summary Card */}
            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "24px" }}>
              <h2 style={{ fontSize: "16px", margin: "0 0 16px 0", fontWeight: 600 }}>Role Summary</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>
                <div style={{ padding: "16px", border: "1px solid #30363d", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Roles Selected</div>
                    <div style={{ fontSize: "20px", fontWeight: 600, color: "#388bfd" }}>6</div>
                    <div style={{ fontSize: "11px", color: "#7d8590", marginTop: "4px" }}>of 9 available</div>
                  </div>
                  <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "rgba(56,139,253,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Users size={20} color="#388bfd" />
                  </div>
                </div>
                <div style={{ padding: "16px", border: "1px solid #30363d", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Total Permissions</div>
                    <div style={{ fontSize: "20px", fontWeight: 600, color: "#3fb950" }}>72</div>
                    <div style={{ fontSize: "11px", color: "#7d8590", marginTop: "4px" }}>across all roles</div>
                  </div>
                  <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "rgba(46,160,67,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Shield size={20} color="#2ea043" />
                  </div>
                </div>
                <div style={{ padding: "16px", border: "1px solid #30363d", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Modules Access</div>
                    <div style={{ fontSize: "20px", fontWeight: 600, color: "#d2a8ff" }}>12</div>
                    <div style={{ fontSize: "11px", color: "#7d8590", marginTop: "4px" }}>will be accessible</div>
                  </div>
                  <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "rgba(210,168,255,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <LayoutTemplate size={20} color="#d2a8ff" />
                  </div>
                </div>
                <div style={{ padding: "16px", border: "1px solid rgba(227,179,65,.4)", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(227,179,65,.05)" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "4px" }}>Data Access Level</div>
                    <div style={{ fontSize: "20px", fontWeight: 600, color: "#e3b341" }}>High</div>
                    <div style={{ fontSize: "11px", color: "#7d8590", marginTop: "4px" }}>Wide access granted</div>
                  </div>
                  <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "rgba(227,179,65,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Lock size={20} color="#e3b341" />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
              <button onClick={() => setStep(1)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} /> Back
              </button>
              <div style={{ display: "flex", gap: "12px" }}>
                <button style={{ background: "transparent", border: "1px solid #388bfd", color: "#388bfd", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}>
                  Save as Draft
                </button>
                <button style={{ background: "#1f6feb", border: "none", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                  <User size={16} /> Create User
                </button>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div style={{ width: "300px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "24px", textAlign: "center" }}>
              <h3 style={{ fontSize: "14px", margin: "0 0 20px 0", fontWeight: 600, textAlign: "left" }}>User Creation Summary</h3>
              
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#388bfd", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: 600, margin: "0 auto 16px auto", position: "relative" }}>
                RM
                <div style={{ position: "absolute", bottom: 0, right: 0, width: "24px", height: "24px", background: "#161b22", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: "20px", height: "20px", background: "#2ea043", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={12} />
                  </div>
                </div>
              </div>
              
              <div style={{ fontSize: "18px", fontWeight: 600, color: "#e6edf3", marginBottom: "4px" }}>Rahul Mehta</div>
              <div style={{ fontSize: "13px", color: "#7d8590", marginBottom: "12px" }}>rahul.mehta@sf360.com</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, color: "#3fb950", border: "1px solid rgba(46,160,67,.4)", marginBottom: "24px" }}>
                <Check size={10} /> Verified
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #30363d", paddingTop: "20px", textAlign: "left", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#7d8590", display: "flex", alignItems: "center", gap: "8px" }}><Users size={14}/> Department</span>
                  <span style={{ color: "#e6edf3" }}>Operations</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#7d8590", display: "flex", alignItems: "center", gap: "8px" }}><Search size={14}/> Phone</span>
                  <span style={{ color: "#e6edf3" }}>+91 98765 43210</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#7d8590", display: "flex", alignItems: "center", gap: "8px" }}><User size={14}/> Employee ID</span>
                  <span style={{ color: "#e6edf3" }}>SF360-EMP-1245</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#7d8590", display: "flex", alignItems: "center", gap: "8px" }}><Shield size={14}/> Status</span>
                  <span style={{ color: "#3fb950", display: "flex", alignItems: "center", gap: "4px" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3fb950" }}></div> Active</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#7d8590", display: "flex", alignItems: "center", gap: "8px" }}><Users size={14}/> Roles Assigned</span>
                  <span style={{ color: "#e6edf3" }}>6</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#7d8590", display: "flex", alignItems: "center", gap: "8px" }}><Shield size={14}/> Total Permissions</span>
                  <span style={{ color: "#e6edf3" }}>72</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#7d8590", display: "flex", alignItems: "center", gap: "8px" }}><Lock size={14}/> Access Level</span>
                  <span style={{ color: "#e3b341", border: "1px solid rgba(227,179,65,.4)", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>High</span>
                </div>
              </div>
            </div>

            <div style={{ background: "transparent", border: "none" }}>
              <h3 style={{ fontSize: "14px", margin: "0 0 16px 0", fontWeight: 600 }}>What Happens Next?</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px", color: "#7d8590" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <div style={{ color: "#3fb950", marginTop: "2px" }}><Check size={14} /></div>
                  User will be created with assigned roles
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <div style={{ color: "#3fb950", marginTop: "2px" }}><Check size={14} /></div>
                  Permissions will be applied automatically
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <div style={{ color: "#3fb950", marginTop: "2px" }}><Check size={14} /></div>
                  Welcome email will be sent to the user
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <div style={{ color: "#3fb950", marginTop: "2px" }}><Check size={14} /></div>
                  User can login and access the system
                </div>
              </div>
            </div>

            <div style={{ background: "rgba(56,139,253,.1)", border: "1px solid rgba(56,139,253,.4)", borderRadius: "8px", padding: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ color: "#388bfd" }}><Shield size={16} /></div>
              <div style={{ fontSize: "12px", color: "#e6edf3", lineHeight: "1.5" }}>
                By creating this user, you agree to the <span style={{ color: "#388bfd", cursor: "pointer" }}>access control policy and data security guidelines</span> of SportsFan360.
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // STEP 1 UI
  return (
    <div style={{ padding: "0 24px 80px 24px", color: "#e6edf3", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#7d8590", marginBottom: "16px", marginTop: "16px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><User size={14} /> User Management</span>
        <ChevronRight size={14} />
        <span style={{ color: "#e6edf3", fontWeight: 500 }}>Create Admin User</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0" }}>Create New Admin User</h1>
        <p style={{ color: "#7d8590", margin: 0, fontSize: "14px" }}>Add a new team member and assign appropriate roles and permissions.</p>
      </div>

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* User Information */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#1f6feb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>1</div>
              <h2 style={{ fontSize: "16px", margin: 0, fontWeight: 600 }}>User Information</h2>
            </div>
            
            <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#21262d", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <User size={32} color="#7d8590" />
                  <div style={{ position: "absolute", bottom: "-4px", right: "-4px", width: "28px", height: "28px", background: "#1f6feb", borderRadius: "50%", border: "2px solid #161b22", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Upload size={14} color="#fff" />
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "13px", color: "#e6edf3", marginBottom: "4px" }}>Upload Photo</div>
                  <div style={{ fontSize: "11px", color: "#7d8590" }}>JPG, PNG or WebP<br/>Max 2MB</div>
                </div>
              </div>

              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Full Name <span style={{color: "#f85149"}}>*</span></label>
                  <input type="text" placeholder="Enter full name" style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px", color: "#e6edf3", fontSize: "14px", outline: "none" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Email Address <span style={{color: "#f85149"}}>*</span></label>
                  <input type="email" placeholder="Enter email address" style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px", color: "#e6edf3", fontSize: "14px", outline: "none" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Phone Number</label>
                  <div style={{ display: "flex" }}>
                    <select style={{ width: "70px", background: "#0d1117", border: "1px solid #30363d", borderRight: "none", borderRadius: "6px 0 0 6px", padding: "8px", color: "#e6edf3", fontSize: "14px", outline: "none", appearance: "none" }}>
                      <option>+91</option>
                    </select>
                    <input type="text" placeholder="Enter phone number" style={{ flex: 1, background: "#0d1117", border: "1px solid #30363d", borderRadius: "0 6px 6px 0", padding: "8px 12px", color: "#e6edf3", fontSize: "14px", outline: "none" }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Employee ID</label>
                  <input type="text" placeholder="Enter employee ID (optional)" style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px", color: "#e6edf3", fontSize: "14px", outline: "none" }} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #30363d" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Department</label>
                <select style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "8px 12px", color: "#e6edf3", fontSize: "14px", outline: "none", appearance: "none" }}>
                  <option>Select department</option>
                  <option>Operations</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Account Status</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px" }}>
                  <div style={{ width: "36px", height: "20px", background: "#2ea043", borderRadius: "10px", padding: "2px", cursor: "pointer", position: "relative" }}>
                    <div style={{ width: "16px", height: "16px", background: "#fff", borderRadius: "50%", transform: "translateX(16px)" }} />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>Active</span>
                </div>
                <div style={{ fontSize: "11px", color: "#7d8590", marginTop: "4px" }}>Inactive users cannot log in to the system.</div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#e6edf3" }}>Email Verification</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, color: "#3fb950", background: "rgba(46,160,67,.1)" }}>
                    <Check size={14} /> Verified
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Assign Roles */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#1f6feb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>2</div>
                <div>
                  <h2 style={{ fontSize: "16px", margin: 0, fontWeight: 600 }}>Assign Roles</h2>
                  <div style={{ fontSize: "13px", color: "#7d8590", marginTop: "2px" }}>Toggle roles to grant appropriate access. You can assign multiple roles to a single user.</div>
                </div>
              </div>
              <button style={{ background: "transparent", border: "1px solid #388bfd", color: "#388bfd", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                <Check size={14} /> Select All
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Role Items */}
              {[
                { key: "superAdmin", icon: <Shield size={16} color="#f85149" />, name: "Super Admin", desc: "Full platform access with all permissions. Can manage users, roles, settings, and all modules.", color: "#f85149" },
                { key: "admin", icon: <Shield size={16} color="#388bfd" />, name: "Admin", desc: "Manage platform operations, users, content, and most system settings.", color: "#388bfd" },
                { key: "contentCreator", icon: <Edit2 size={16} color="#2ea043" />, name: "Content Creator", desc: "Create and manage content, articles, media, and team/player profiles.", color: "#2ea043" },
                { key: "author", icon: <Edit2 size={16} color="#d2a8ff" />, name: "Author", desc: "Write and submit articles. Manage own author profile and content.", color: "#d2a8ff" },
                { key: "moderator", icon: <Shield size={16} color="#e3b341" />, name: "Moderator", desc: "Moderate community, reviews, fan battles, comments, and user feedback.", color: "#e3b341" },
                { key: "liveHost", icon: <MonitorPlay size={16} color="#00b2cd" />, name: "Live Show Host", desc: "Host live shows, manage guests, live chat, and live session operations.", color: "#00b2cd" },
                { key: "csrManager", icon: <User size={16} color="#3fb950" />, name: "CSR Manager", desc: "Manage CSR programs, campaigns, and athlete CSR content.", color: "#3fb950" },
                { key: "contentOrganizer", icon: <LayoutTemplate size={16} color="#388bfd" />, name: "Content Organizer", desc: "Manage content layout, display order, and section visibility across platforms.", color: "#388bfd" },
                { key: "sf360Staff", icon: <Users size={16} color="#f85149" />, name: "SF360 Staff", desc: "Internal staff with limited access to assigned modules and tools.", color: "#f85149" },
              ].map((role) => (
                <div key={role.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", border: `1px solid ${roles[role.key as keyof typeof roles] ? role.color : "#30363d"}`, borderRadius: "8px", background: roles[role.key as keyof typeof roles] ? `${role.color}11` : "transparent" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ marginTop: "2px" }}>{role.icon}</div>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: role.color, marginBottom: "4px" }}>{role.name}</div>
                      <div style={{ fontSize: "12px", color: "#7d8590" }}>{role.desc}</div>
                    </div>
                  </div>
                  <div onClick={() => toggleRole(role.key as keyof typeof roles)} style={{ width: "36px", height: "20px", background: roles[role.key as keyof typeof roles] ? role.color : "#30363d", borderRadius: "10px", padding: "2px", cursor: "pointer", position: "relative", transition: "all 0.2s" }}>
                    <div style={{ width: "16px", height: "16px", background: roles[role.key as keyof typeof roles] ? "#fff" : "#8b949e", borderRadius: "50%", transform: roles[role.key as keyof typeof roles] ? "translateX(16px)" : "translateX(0)", transition: "all 0.2s" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
            <Link href="/admin/user-management/users/user-list" style={{ textDecoration: "none" }}>
              <button style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}>
                Cancel
              </button>
            </Link>
            <div style={{ display: "flex", gap: "12px" }}>
              <button style={{ background: "transparent", border: "1px solid #388bfd", color: "#388bfd", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}>
                Save as Draft
              </button>
              <button onClick={() => setStep(2)} style={{ background: "#1f6feb", border: "none", color: "#fff", padding: "8px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                <User size={16} /> Create User
              </button>
            </div>
          </div>

        </div>

        {/* Right Sidebar: Permission Preview */}
        <div style={{ width: "300px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "24px" }}>
            <h3 style={{ fontSize: "14px", margin: "0 0 4px 0", fontWeight: 600 }}>Permission Preview</h3>
            <div style={{ fontSize: "12px", color: "#7d8590", marginBottom: "20px" }}>Summary of permissions for this user</div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
              <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "11px", color: "#7d8590", marginBottom: "4px" }}>Roles Selected</div>
                <div style={{ fontSize: "20px", fontWeight: 600, color: "#388bfd" }}>{activeRolesCount}</div>
              </div>
              <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "11px", color: "#7d8590", marginBottom: "4px" }}>Total Permissions</div>
                <div style={{ fontSize: "20px", fontWeight: 600, color: "#3fb950" }}>{totalPermissions}</div>
              </div>
            </div>

            <h4 style={{ fontSize: "13px", margin: "0 0 16px 0", fontWeight: 600, borderTop: "1px solid #30363d", paddingTop: "20px" }}>Permissions Breakdown</h4>
            
            {activeRolesCount > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#7d8590" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#388bfd" }}></div>
                    User Management
                  </div>
                  <div style={{ color: "#e6edf3" }}>12</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#7d8590" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2ea043" }}></div>
                    Content & Live
                  </div>
                  <div style={{ color: "#e6edf3" }}>14</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#7d8590" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#e3b341" }}></div>
                    Community & Moderation
                  </div>
                  <div style={{ color: "#e6edf3" }}>6</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#7d8590" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#d2a8ff" }}></div>
                    Ecommerce & Monetisation
                  </div>
                  <div style={{ color: "#e6edf3" }}>4</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#7d8590" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7d8590" }}></div>
                    System & Settings
                  </div>
                  <div style={{ color: "#e6edf3" }}>{roles.admin || roles.superAdmin ? "10" : "0"}</div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: "1px solid #30363d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px auto" }}>
                  <Lock size={20} color="#7d8590" />
                </div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#e6edf3", marginBottom: "4px" }}>Select roles to see permissions</div>
                <div style={{ fontSize: "12px", color: "#7d8590", lineHeight: "1.5" }}>Choose one or more roles from the left to preview their permissions.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
