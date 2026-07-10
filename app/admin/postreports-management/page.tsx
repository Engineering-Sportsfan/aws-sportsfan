"use client";
import { useEffect, useState } from "react";

type AbuseFlags = {
  coordinated: boolean;
  lowTrust: boolean;
  rateLimited: boolean;
  suspiciousAuthorTarget: boolean;
};

type Report = {
  id: string;
  postId: string;
  postAuthorId: string | null;
  reporterId: string;
  reporterName: string;
  reason: string;
  status: "pending" | "actioned" | "dismissed" | "silenced" | "flagged_coordinated" | "low_trust_review";
  trustScoreAtSubmission: number;
  abuseFlags: AbuseFlags;
  createdAt: number;
  updatedAt: number;
  resolvedBy?: string;
  resolvedAt?: number;
};

type StrikeResult = {
  strikeId: string;
  strikeNumber: number;
  actionTaken: "warning" | "suspend_7" | "suspend_30" | "ban";
  suspendDays: number;
};

type ActionResult = {
  message: string;
  strikeResult: StrikeResult | null;
};

const REASON_LABELS: Record<string, string> = {
  illegal_content:        "Illegal content",
  indecent_content:       "Indecent content",
  irrelevant_content:     "Irrelevant content",
  misleading_information: "Misleading info",
  offensive_content:      "Offensive content",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:             { label: "Pending",     color: "#d29922", bg: "rgba(210,153,34,.15)"  },
  actioned:            { label: "Actioned",    color: "#2ea043", bg: "rgba(46,160,67,.15)"   },
  dismissed:           { label: "Dismissed",   color: "#7d8590", bg: "rgba(125,133,144,.15)" },
  silenced:            { label: "Silenced",    color: "#8b949e", bg: "rgba(139,148,158,.12)" },
  flagged_coordinated: { label: "Coordinated", color: "#f78166", bg: "rgba(247,129,102,.15)" },
  low_trust_review:    { label: "Low Trust",   color: "#a371f7", bg: "rgba(163,113,247,.15)" },
};

const STRIKE_ACTION_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  warning:    { label: "Warning issued",       color: "#d29922", icon: "⚠️" },
  suspend_7:  { label: "Suspended 7 days",     color: "#f78166", icon: "⏸" },
  suspend_30: { label: "Suspended 30 days",    color: "#da3633", icon: "⏸" },
  ban:        { label: "Permanently banned",   color: "#da3633", icon: "🚫" },
};

export default function ReportsPage() {
  const [reports, setReports]           = useState<Report[]>([]);
  const [loading, setLoading]           = useState(true);
  const [updating, setUpdating]         = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [expandedFlags, setExpandedFlags] = useState<string | null>(null);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    reportId: string;
    resolution: "validated" | "dismissed";
    postId: string;
    reason: string;
  } | null>(null);
  const [adminNote, setAdminNote] = useState("");

  // Result toast
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

  useEffect(() => { fetchReports(); }, []);

  async function fetchReports() {
    setLoading(true);
    try {
      const res  = await fetch("/api/post-report");
      const data = await res.json();
      setReports(data.reports ?? []);
    } catch { setReports([]); }
    finally  { setLoading(false); }
  }

  async function handleResolve() {
    if (!confirmModal) return;
    const { reportId, resolution } = confirmModal;
    setUpdating(reportId);
    setConfirmModal(null);

    try {
      const res  = await fetch("/api/post-report", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reportId, resolution, adminId: "admin", adminNote: adminNote || null }),
      });
      const data = await res.json();

      setReports(prev =>
        prev.map(r =>
          r.id === reportId
            ? { ...r, status: resolution === "validated" ? "actioned" : "dismissed", resolvedAt: Date.now() }
            : (resolution === "validated" && r.postId === confirmModal.postId &&
               ["pending","flagged_coordinated","low_trust_review"].includes(r.status))
              ? { ...r, status: "actioned", resolvedAt: Date.now() }
              : r
        )
      );

      setActionResult({ message: data.message, strikeResult: data.strikeResult ?? null });
      setTimeout(() => setActionResult(null), 6000);
    } catch {
      alert("Failed to update report.");
    } finally {
      setUpdating(null);
      setAdminNote("");
    }
  }

  const filtered = reports.filter(r => {
    const matchSearch =
      r.reporterName.toLowerCase().includes(search.toLowerCase()) ||
      r.reporterId.toLowerCase().includes(search.toLowerCase())   ||
      r.postId.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchReason = reasonFilter === "all" || r.reason === reasonFilter;
    return matchSearch && matchStatus && matchReason;
  });

  const counts = {
    total:    reports.length,
    pending:  reports.filter(r => r.status === "pending").length,
    actioned: reports.filter(r => r.status === "actioned").length,
    flagged:  reports.filter(r => r.status === "flagged_coordinated" || r.status === "low_trust_review").length,
  };

  const anyFlag = (flags: AbuseFlags) =>
    flags.coordinated || flags.lowTrust || flags.rateLimited || flags.suspiciousAuthorTarget;

  return (
    <>
      <style>{`
        .reports-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px; margin-bottom: 20px;
        }
        @media (max-width: 700px) { .reports-stats { grid-template-columns: repeat(2, 1fr); } }

        .toolbar-wrap {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px; border-bottom: 1px solid #21282f; flex-wrap: wrap;
        }
        .search-wrap {
          display: flex; align-items: center; gap: 6px;
          background: #0d1117; border: 1px solid #2d3748;
          border-radius: 6px; padding: 5px 10px; width: 220px;
        }
        @media (max-width: 520px) { .search-wrap { width: 100%; } }
        .filter-select {
          background: #0d1117; border: 1px solid #2d3748; border-radius: 6px;
          padding: 5px 8px; color: #e6edf3; font-size: 11px;
          font-family: inherit; cursor: pointer; outline: none;
        }
        .table-scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .table-scroll-x table { width: 100%; border-collapse: collapse; min-width: 860px; }
        .table-container {
          background: #161b22; border: 1px solid #21282f;
          border-radius: 6px; overflow: hidden;
        }
        .action-cell { display: flex; gap: 6px; flex-wrap: nowrap; }
        .flags-popup {
          position: absolute; right: 0; top: 28px; z-index: 40;
          background: #1c2330; border: 1px solid #30363d; border-radius: 8px;
          padding: 10px 12px; min-width: 190px; box-shadow: 0 8px 24px rgba(0,0,0,.5);
        }
        tr:hover { background: rgba(255,255,255,.02); }
        .overlay {
          position: fixed; inset: 0; z-index: 50;
          background: rgba(0,0,0,.7);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .modal {
          background: #161b22; border: 1px solid #30363d;
          border-radius: 12px; padding: 24px; width: 100%; max-width: 420px;
          box-shadow: 0 16px 48px rgba(0,0,0,.6);
        }
        .toast {
          position: fixed; bottom: 24px; right: 24px; z-index: 60;
          background: #1c2330; border: 1px solid #30363d;
          border-radius: 10px; padding: 14px 18px;
          box-shadow: 0 8px 32px rgba(0,0,0,.5);
          max-width: 320px; animation: slideUp .25s ease;
        }
        @keyframes slideUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600 }}>Reports</h1>
        <p style={{ color: "#7d8590", fontSize: 12, marginTop: 2 }}>
          Review and resolve community post reports
        </p>
      </div>

      {/* Stat Cards */}
      <div className="reports-stats">
        {[
          { label: "Total Reports", value: counts.total,    color: "#388bfd" },
          { label: "Pending",       value: counts.pending,  color: "#d29922" },
          { label: "Actioned",      value: counts.actioned, color: "#2ea043" },
          { label: "Needs Review",  value: counts.flagged,  color: "#a371f7" },
        ].map(s => (
          <div key={s.label} style={{
            background: "#161b22", border: "1px solid #21282f",
            borderTop: `2px solid ${s.color}`, borderRadius: 6, padding: 16,
          }}>
            <div style={{ fontSize: 11, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".06em" }}>
              {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 6 }}>
              {loading ? "—" : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="table-container">
        <div className="toolbar-wrap">
          <div className="search-wrap">
            <span style={{ color: "#7d8590" }}>⌕</span>
            <input
              placeholder="Reporter, post ID…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ border:"none", background:"none", outline:"none", color:"#e6edf3", fontSize:12, width:"100%", fontFamily:"inherit" }}
            />
          </div>
          <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
            <option value="silenced">Silenced</option>
            <option value="flagged_coordinated">Coordinated</option>
            <option value="low_trust_review">Low Trust</option>
          </select>
          <select className="filter-select" value={reasonFilter} onChange={e => setReasonFilter(e.target.value)}>
            <option value="all">All Reasons</option>
            {Object.entries(REASON_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={fetchReports} style={{
            marginLeft:"auto", padding:"5px 12px", borderRadius:6,
            border:"1px solid #30363d", background:"transparent",
            color:"#7d8590", fontSize:11, cursor:"pointer", fontFamily:"inherit",
          }}>↻ Refresh</button>
          <div style={{ fontSize:12, color:"#7d8590" }}>{filtered.length} of {reports.length}</div>
        </div>

        <div className="table-scroll-x">
          <table>
            <thead>
              <tr style={{ background:"#1c2330", borderBottom:"1px solid #21282f" }}>
                {["#","Reporter","Post ID","Reason","Status","Trust","Abuse Flags","Reported At","Actions"].map(h => (
                  <th key={h} style={{
                    textAlign:"left", padding:"8px 14px",
                    fontSize:10, fontWeight:600, letterSpacing:".07em",
                    textTransform:"uppercase", color:"#7d8590", whiteSpace:"nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding:24, textAlign:"center", color:"#7d8590" }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding:24, textAlign:"center", color:"#7d8590" }}>No reports found</td></tr>
              ) : filtered.map((r, i) => {
                const isUpdating = updating === r.id;
                const isPending  = ["pending","flagged_coordinated","low_trust_review"].includes(r.status);
                const sc         = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                const flags      = r.abuseFlags ?? {};
                const hasFlags   = anyFlag(flags);
                const initials   = (r.reporterName ?? "?").split(" ").map((n:string) => n[0]).join("").toUpperCase().slice(0,2);
                const trustPct   = Math.round((r.trustScoreAtSubmission ?? 1) * 100);
                const trustColor = trustPct >= 70 ? "#2ea043" : trustPct >= 40 ? "#d29922" : "#da3633";

                return (
                  <tr key={r.id} style={{
                    borderBottom: i < filtered.length-1 ? "1px solid #21282f" : "none",
                    opacity: isUpdating ? 0.5 : 1, transition: "opacity .2s",
                  }}>
                    <td style={{ padding:"10px 14px", color:"#7d8590", fontFamily:"var(--font-mono)", fontSize:12 }}>{i+1}</td>

                    <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{
                          width:28, height:28, borderRadius:"50%", flexShrink:0,
                          background:"rgba(31,111,235,.2)", color:"#388bfd",
                          display:"grid", placeItems:"center", fontSize:10, fontWeight:700,
                        }}>{initials}</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:500 }}>{r.reporterName ?? "—"}</div>
                          <div style={{ fontSize:10, color:"#7d8590", marginTop:1 }}>{r.reporterId}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding:"10px 14px" }}>
                      <span style={{
                        fontFamily:"var(--font-mono)", fontSize:11, color:"#388bfd",
                        background:"rgba(56,139,253,.1)", padding:"2px 6px",
                        borderRadius:4, cursor:"pointer",
                      }} title={r.postId}>{r.postId.slice(0,10)}…</span>
                    </td>

                    <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                      <span style={{
                        fontSize:11, color:"#e6edf3",
                        background:"rgba(255,255,255,.06)",
                        padding:"2px 8px", borderRadius:4,
                      }}>{REASON_LABELS[r.reason] ?? r.reason}</span>
                    </td>

                    <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                      <span style={{
                        display:"inline-flex", alignItems:"center", gap:4,
                        padding:"2px 8px", borderRadius:10,
                        fontSize:10, fontWeight:600,
                        background:sc.bg, color:sc.color,
                      }}>
                        <span style={{ width:5, height:5, borderRadius:"50%", background:"currentColor" }} />
                        {sc.label}
                      </span>
                    </td>

                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:44, height:5, borderRadius:3, background:"rgba(255,255,255,.08)", overflow:"hidden" }}>
                          <div style={{ width:`${trustPct}%`, height:"100%", background:trustColor, borderRadius:3 }} />
                        </div>
                        <span style={{ fontSize:11, fontFamily:"var(--font-mono)", color:trustColor }}>{trustPct}%</span>
                      </div>
                    </td>

                    <td style={{ padding:"10px 14px" }}>
                      {!hasFlags ? (
                        <span style={{ color:"#7d8590", fontSize:11 }}>—</span>
                      ) : (
                        <div style={{ position:"relative", display:"inline-block" }}>
                          <button
                            onClick={() => setExpandedFlags(expandedFlags === r.id ? null : r.id)}
                            style={{
                              padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:600,
                              background:"rgba(247,129,102,.15)", color:"#f78166",
                              border:"1px solid rgba(247,129,102,.3)",
                              cursor:"pointer", fontFamily:"inherit",
                            }}
                          >⚑ Flagged</button>
                          {expandedFlags === r.id && (
                            <div className="flags-popup">
                              <div style={{ fontSize:10, color:"#7d8590", marginBottom:8, textTransform:"uppercase", letterSpacing:".06em" }}>Abuse Flags</div>
                              {[
                                { key:"rateLimited",            label:"Rate Limited"        },
                                { key:"coordinated",            label:"Coordinated Attack"  },
                                { key:"suspiciousAuthorTarget", label:"Targeting Author"    },
                                { key:"lowTrust",               label:"Low Trust Reporter"  },
                              ].map(f => {
                                const active = flags[f.key as keyof AbuseFlags];
                                return (
                                  <div key={f.key} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                                    <span style={{ width:7, height:7, borderRadius:"50%", background:active?"#f78166":"#2ea043", flexShrink:0 }} />
                                    <span style={{ fontSize:11, color:active?"#f78166":"#7d8590" }}>{f.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:11, color:"#7d8590", whiteSpace:"nowrap" }}>
                      {r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN",{ dateStyle:"medium", timeStyle:"short" }) : "—"}
                    </td>

                    <td style={{ padding:"10px 14px" }}>
                      <div className="action-cell">
                        {isPending ? (
                          <>
                            <button
                              onClick={() => setConfirmModal({ reportId:r.id, resolution:"validated", postId:r.postId, reason:r.reason })}
                              disabled={isUpdating}
                              style={{
                                padding:"4px 10px", borderRadius:5, fontSize:11, fontWeight:500,
                                border:"1px solid #2ea043", background:"transparent", color:"#2ea043",
                                cursor:isUpdating?"not-allowed":"pointer", fontFamily:"inherit", whiteSpace:"nowrap",
                              }}
                            >{isUpdating ? "…" : "Action"}</button>
                            <button
                              onClick={() => setConfirmModal({ reportId:r.id, resolution:"dismissed", postId:r.postId, reason:r.reason })}
                              disabled={isUpdating}
                              style={{
                                padding:"4px 10px", borderRadius:5, fontSize:11, fontWeight:500,
                                border:"1px solid #30363d", background:"transparent", color:"#7d8590",
                                cursor:isUpdating?"not-allowed":"pointer", fontFamily:"inherit", whiteSpace:"nowrap",
                              }}
                            >Dismiss</button>
                          </>
                        ) : (
                          <span style={{ fontSize:11, color:"#7d8590" }}>
                            {r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString("en-IN",{ dateStyle:"short" }) : "Resolved"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div className="overlay" onClick={() => setConfirmModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            {confirmModal.resolution === "validated" ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <div style={{
                    width:36, height:36, borderRadius:"50%",
                    background:"rgba(218,54,51,.15)", color:"#da3633",
                    display:"grid", placeItems:"center", fontSize:18, flexShrink:0,
                  }}>⚑</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600 }}>Action this report?</div>
                    <div style={{ fontSize:11, color:"#7d8590", marginTop:2 }}>This will remove the post and strike the author.</div>
                  </div>
                </div>

                {/* What will happen */}
                <div style={{
                  background:"#0d1117", border:"1px solid #21282f", borderRadius:8,
                  padding:"12px 14px", marginBottom:16,
                }}>
                  <div style={{ fontSize:10, color:"#7d8590", textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>
                    What will happen
                  </div>
                  {[
                    { icon:"🚫", text:"Post will be soft-removed from the feed"             },
                    { icon:"⚠️", text:"Author will receive a strike on their account"        },
                    { icon:"📋", text:"All related reports for this post will be auto-closed" },
                    { icon:"📈", text:"Reporter's trust score will increase"                  },
                  ].map((item, idx) => (
                    <div key={idx} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:13 }}>{item.icon}</span>
                      <span style={{ fontSize:12, color:"#8b949e" }}>{item.text}</span>
                    </div>
                  ))}
                </div>

                {/* Reason display */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:"#7d8590", marginBottom:6 }}>REPORT REASON</div>
                  <span style={{
                    fontSize:11, background:"rgba(255,255,255,.06)",
                    padding:"3px 10px", borderRadius:4, color:"#e6edf3",
                  }}>{REASON_LABELS[confirmModal.reason] ?? confirmModal.reason}</span>
                </div>

                {/* Admin note */}
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, color:"#7d8590", marginBottom:6 }}>ADMIN NOTE (optional)</div>
                  <textarea
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                    placeholder="Add context for audit log…"
                    rows={2}
                    style={{
                      width:"100%", background:"#0d1117", border:"1px solid #2d3748",
                      borderRadius:6, padding:"8px 10px", color:"#e6edf3",
                      fontSize:12, fontFamily:"inherit", resize:"none", outline:"none",
                      boxSizing:"border-box",
                    }}
                  />
                </div>

                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => { setConfirmModal(null); setAdminNote(""); }} style={{
                    flex:1, padding:"9px 0", borderRadius:6, border:"1px solid #30363d",
                    background:"transparent", color:"#7d8590", fontSize:12,
                    cursor:"pointer", fontFamily:"inherit",
                  }}>Cancel</button>
                  <button onClick={handleResolve} style={{
                    flex:1, padding:"9px 0", borderRadius:6, border:"none",
                    background:"#da3633", color:"#fff", fontSize:12, fontWeight:600,
                    cursor:"pointer", fontFamily:"inherit",
                  }}>Confirm Action</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>Dismiss this report?</div>
                <div style={{ fontSize:12, color:"#7d8590", marginBottom:16, lineHeight:1.6 }}>
                  The post will remain visible. The reporter&apos;s trust score will decrease slightly if this dismissal pattern continues.
                </div>
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, color:"#7d8590", marginBottom:6 }}>ADMIN NOTE (optional)</div>
                  <textarea
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                    placeholder="Reason for dismissal…"
                    rows={2}
                    style={{
                      width:"100%", background:"#0d1117", border:"1px solid #2d3748",
                      borderRadius:6, padding:"8px 10px", color:"#e6edf3",
                      fontSize:12, fontFamily:"inherit", resize:"none", outline:"none",
                      boxSizing:"border-box",
                    }}
                  />
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => { setConfirmModal(null); setAdminNote(""); }} style={{
                    flex:1, padding:"9px 0", borderRadius:6, border:"1px solid #30363d",
                    background:"transparent", color:"#7d8590", fontSize:12,
                    cursor:"pointer", fontFamily:"inherit",
                  }}>Cancel</button>
                  <button onClick={handleResolve} style={{
                    flex:1, padding:"9px 0", borderRadius:6, border:"none",
                    background:"#30363d", color:"#e6edf3", fontSize:12, fontWeight:600,
                    cursor:"pointer", fontFamily:"inherit",
                  }}>Dismiss Report</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Action Result Toast ── */}
      {actionResult && (
        <div className="toast">
          <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
            <span style={{ fontSize:18, flexShrink:0 }}>
              {actionResult.strikeResult ? STRIKE_ACTION_CONFIG[actionResult.strikeResult.actionTaken]?.icon ?? "✅" : "✅"}
            </span>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:"#e6edf3", marginBottom:4 }}>
                {actionResult.message}
              </div>
              {actionResult.strikeResult && (
                <div style={{ fontSize:11, color:"#7d8590" }}>
                  Strike #{actionResult.strikeResult.strikeNumber} —{" "}
                  <span style={{ color: STRIKE_ACTION_CONFIG[actionResult.strikeResult.actionTaken]?.color ?? "#e6edf3" }}>
                    {STRIKE_ACTION_CONFIG[actionResult.strikeResult.actionTaken]?.label}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => setActionResult(null)}
              style={{ marginLeft:"auto", background:"none", border:"none", color:"#7d8590", cursor:"pointer", fontSize:14, flexShrink:0 }}
            >✕</button>
          </div>
        </div>
      )}
    </>
  );
}