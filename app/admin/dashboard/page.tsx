// "use client";

// import { StatCard, TableWrap, TableToolbar, Badge, UserCell } from "@/components/admin/ui";
// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import axios from "axios";

// const api = axios.create({
//     withCredentials: true,
//     headers: {
//         "Content-Type": "application/json",
//     },
// });

// export default function DashboardPage() {
//     const router = useRouter();
//     const [loading, setLoading] = useState(true);

//     useEffect(() => {
//         const checkAuth = async () => {
//             try {
//                 const response = await api.get("/api/auth/me");
//                 if (!response.data.success || !response.data.user) {
//                     router.push("/admin");
//                 }
//             } catch (err:unknown) {
//                 console.log("DASHBOARD AUTH ERROR:", err);
//                 router.push("/admin");
//             } finally {
//                 setLoading(false);
//             }
//         };
//         checkAuth();
//     }, [router]);

//     if (loading) {
//         return (
//             <div className="flex items-center justify-center h-64">
//                 <div className="text-gray-400">Loading...</div>
//             </div>
//         );
//     }

//     return (
//         <div>
//             {/* Header */}
//             <div style={{ marginBottom: 18 }}>
//                 <h1 style={{ fontSize: 17, fontWeight: 600 }}>Overview</h1>
//                 <p style={{ color: "#7d8590", fontSize: 12, marginTop: 2 }}>
//                     Real-time snapshot — March 2026
//                 </p>
//             </div>

//             {/* Stat Cards */}
//             <div className="stats-grid">
//                 <StatCard label="Total Users" value="1,284" delta="12.4% vs last month" deltaDir="up" color="blue" />
//                 <StatCard label="Revenue (Month)" value="₹4.8L" delta="8.1% vs last month" deltaDir="up" color="green" />
//                 <StatCard label="Pending Orders" value="38" delta="3 new in last hour" deltaDir="down" color="yellow" />
//                 <StatCard label="Failed OTPs (24h)" value="14" delta="Above normal" deltaDir="down" color="red" />
//             </div>

//             {/* Revenue Chart + Activity */}
//             <div className="chart-grid">
//                 {/* Revenue Chart */}
//                 <TableWrap>
//                     <TableToolbar>
//                         <div>
//                             <div style={{ fontSize: 13, fontWeight: 600 }}>Revenue Trend</div>
//                             <div style={{ fontSize: 11, color: "#7d8590" }}>Last 7 months</div>
//                         </div>
//                     </TableToolbar>
//                     <div style={{ padding: "16px 14px" }}>
//                         <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: "100px" }}>
//                             {[55, 70, 48, 85, 60, 92, 100].map((h, i) => (
//                                 <div key={i} style={{ flex: 1, display: "flex", gap: 2, alignItems: "flex-end" }}>
//                                     <div style={{ flex: 1, height: `${h}%`, borderRadius: "3px 3px 0 0", background: "#1f6feb", opacity: .7 }} />
//                                     <div style={{ flex: 1, height: `${h * .85}%`, borderRadius: "3px 3px 0 0", background: "#2ea043", opacity: .7 }} />
//                                 </div>
//                             ))}
//                         </div>
//                         <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
//                             {["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map(m => (
//                                 <div key={m} style={{
//                                     flex: 1, textAlign: "center", fontSize: 10,
//                                     color: "#7d8590", fontFamily: "var(--font-mono)",
//                                 }}>{m}</div>
//                             ))}
//                         </div>
//                         <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
//                             {[{ color: "#1f6feb", label: "Revenue" }, { color: "#2ea043", label: "Orders" }].map(l => (
//                                 <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#7d8590" }}>
//                                     <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
//                                     {l.label}
//                                 </div>
//                             ))}
//                         </div>
//                     </div>
//                 </TableWrap>

//                 {/* Activity Feed */}
//                 <TableWrap>
//                     <TableToolbar>
//                         <div style={{ fontSize: 13, fontWeight: 600 }}>Recent Activity</div>
//                     </TableToolbar>
//                     <div style={{ padding: "0 14px" }}>
//                         {[
//                             { color: "#2ea043", action: "New user registered", meta: "ravi.k@gmail.com via OTP", time: "2 min ago" },
//                             { color: "#388bfd", action: "Order #4821 placed", meta: "₹2,490 — UPI payment", time: "11 min ago" },
//                             { color: "#da3633", action: "OTP failed (3 attempts)", meta: "+91 98765 43210", time: "24 min ago" },
//                             { color: "#d29922", action: "Post flagged for review", meta: '"Best Deals" — automated flag', time: "1 hr ago" },
//                             { color: "#2ea043", action: "Payment confirmed", meta: "Order #4819 — ₹1,200", time: "2 hr ago" },
//                         ].map((ev, i, arr) => (
//                             <div key={i} style={{
//                                 display: "flex", gap: 10, padding: "10px 0",
//                                 borderBottom: i < arr.length - 1 ? "1px solid #21282f" : "none",
//                             }}>
//                                 <div style={{
//                                     width: 7, height: 7, borderRadius: "50%",
//                                     background: ev.color, marginTop: 5, flexShrink: 0,
//                                 }} />
//                                 <div>
//                                     <div style={{ fontSize: 12, fontWeight: 500 }}>{ev.action}</div>
//                                     <div style={{ fontSize: 11, color: "#7d8590" }}>{ev.meta}</div>
//                                     <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "var(--font-mono)", marginTop: 4 }}>{ev.time}</div>
//                                 </div>
//                             </div>
//                         ))}
//                     </div>
//                 </TableWrap>
//             </div>

//             {/* Latest Signups */}
//             <TableWrap>
//                 <TableToolbar>
//                     <div style={{ fontSize: 13, fontWeight: 600 }}>Latest Signups</div>
//                     <div style={{ marginLeft: "auto" }}>
//                         <a href="/admin/users/signups" style={{ fontSize: 12, color: "#388bfd", textDecoration: "none" }}>
//                             View all →
//                         </a>
//                     </div>
//                 </TableToolbar>

//                 <div className="table-scroll">
//                     <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
//                         <thead>
//                             <tr style={{ background: "#1c2330", borderBottom: "1px solid #21282f" }}>
//                                 {["User", "Joined", "Method", "Status"].map(h => (
//                                     <th key={h} style={{
//                                         textAlign: "left", padding: "8px 14px",
//                                         fontSize: 10, fontWeight: 600, letterSpacing: ".07em",
//                                         textTransform: "uppercase", color: "#7d8590", whiteSpace: "nowrap",
//                                     }}>{h}</th>
//                                 ))}
//                             </tr>
//                         </thead>
//                         <tbody>
//                             {[
//                                 { name: "Ravi Kumar", email: "ravi.k@gmail.com", date: "22 Mar 2026", status: "Active" as const },
//                                 { name: "Priya Sharma", email: "priya.s@yahoo.com", date: "21 Mar 2026", status: "Active" as const },
//                                 { name: "Arjun Mehta", email: "arjun.m@outlook.com", date: "21 Mar 2026", status: "Pending" as const },
//                             ].map((u, i, arr) => (
//                                 <tr key={i} style={{ borderBottom: i < arr.length - 1 ? "1px solid #21282f" : "none" }}>
//                                     <td style={{ padding: "9px 14px" }}>
//                                         <UserCell name={u.name} email={u.email} index={i} />
//                                     </td>
//                                     <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap" }}>
//                                         {u.date}
//                                     </td>
//                                     <td style={{ padding: "9px 14px" }}>
//                                         <Badge variant="blue">OTP</Badge>
//                                     </td>
//                                     <td style={{ padding: "9px 14px" }}>
//                                         <Badge variant={u.status === "Active" ? "green" : "yellow"} dot>
//                                             {u.status}
//                                         </Badge>
//                                     </td>
//                                 </tr>
//                             ))}
//                         </tbody>
//                     </table>
//                 </div>
//             </TableWrap>
//         </div>
//     );
// }








"use client";

import { StatCard, TableWrap, TableToolbar, Badge, UserCell } from "@/components/admin/ui";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";

const api = axios.create({
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

export default function DashboardPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<{
        name?: string | null;
        email?: string | null;
        image?: string | null;
        firstName?: string;
        lastName?: string;
        role?: string;
        status?: string;
    } | null>(null);

    useEffect(() => {
        // Wait for NextAuth session to be resolved
        if (status === "loading") {
            return; // Still loading, do nothing
        }

        const checkAuth = async () => {
            try {
                // First check NextAuth session
                if (status === "authenticated" && session?.user) {
                    setUser(session.user);
                    setLoading(false);
                    return;
                }

                // Fallback: Check your backend API
                const response = await api.get("/api/auth/me");
                if (response.data.success && response.data.user) {
                    setUser(response.data.user);
                    setLoading(false);
                } else {
                    // Not authenticated, redirect to login
                    router.push("/admin");
                }
            } catch (err) {
                console.error("Auth check error:", err);
                router.push("/admin");
            }
        };

        checkAuth();
    }, [router, status, session]);

    // Show loading spinner while checking authentication
    if (loading || status === "loading") {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400 mx-auto mb-4"></div>
                    Loading dashboard...
                </div>
            </div>
        );
    }

    // If not authenticated, don't render anything (redirect will happen)
    if (!user) {
        return null;
    }

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 18 }}>
                <h1 style={{ fontSize: 17, fontWeight: 600 }}>Overview</h1>
                <p style={{ color: "#7d8590", fontSize: 12, marginTop: 2 }}>
                    Real-time snapshot — March 2026
                </p>
            </div>

            {/* Stat Cards */}
            <div className="stats-grid">
                <StatCard label="Total Users" value="1,284" delta="12.4% vs last month" deltaDir="up" color="blue" />
                <StatCard label="Revenue (Month)" value="₹4.8L" delta="8.1% vs last month" deltaDir="up" color="green" />
                <StatCard label="Pending Orders" value="38" delta="3 new in last hour" deltaDir="down" color="yellow" />
                <StatCard label="Failed OTPs (24h)" value="14" delta="Above normal" deltaDir="down" color="red" />
            </div>

            {/* Revenue Chart + Activity */}
            <div className="chart-grid">
                {/* Revenue Chart */}
                <TableWrap>
                    <TableToolbar>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>Revenue Trend</div>
                            <div style={{ fontSize: 11, color: "#7d8590" }}>Last 7 months</div>
                        </div>
                    </TableToolbar>
                    <div style={{ padding: "16px 14px" }}>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: "100px" }}>
                            {[55, 70, 48, 85, 60, 92, 100].map((h, i) => (
                                <div key={i} style={{ flex: 1, display: "flex", gap: 2, alignItems: "flex-end" }}>
                                    <div style={{ flex: 1, height: `${h}%`, borderRadius: "3px 3px 0 0", background: "#1f6feb", opacity: .7 }} />
                                    <div style={{ flex: 1, height: `${h * .85}%`, borderRadius: "3px 3px 0 0", background: "#2ea043", opacity: .7 }} />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            {["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map(m => (
                                <div key={m} style={{
                                    flex: 1, textAlign: "center", fontSize: 10,
                                    color: "#7d8590", fontFamily: "var(--font-mono)",
                                }}>{m}</div>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                            {[{ color: "#1f6feb", label: "Revenue" }, { color: "#2ea043", label: "Orders" }].map(l => (
                                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#7d8590" }}>
                                    <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                                    {l.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </TableWrap>

                {/* Activity Feed */}
                <TableWrap>
                    <TableToolbar>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Recent Activity</div>
                    </TableToolbar>
                    <div style={{ padding: "0 14px" }}>
                        {[
                            { color: "#2ea043", action: "New user registered", meta: "ravi.k@gmail.com via OTP", time: "2 min ago" },
                            { color: "#388bfd", action: "Order #4821 placed", meta: "₹2,490 — UPI payment", time: "11 min ago" },
                            { color: "#da3633", action: "OTP failed (3 attempts)", meta: "+91 98765 43210", time: "24 min ago" },
                            { color: "#d29922", action: "Post flagged for review", meta: '"Best Deals" — automated flag', time: "1 hr ago" },
                            { color: "#2ea043", action: "Payment confirmed", meta: "Order #4819 — ₹1,200", time: "2 hr ago" },
                        ].map((ev, i, arr) => (
                            <div key={i} style={{
                                display: "flex", gap: 10, padding: "10px 0",
                                borderBottom: i < arr.length - 1 ? "1px solid #21282f" : "none",
                            }}>
                                <div style={{
                                    width: 7, height: 7, borderRadius: "50%",
                                    background: ev.color, marginTop: 5, flexShrink: 0,
                                }} />
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 500 }}>{ev.action}</div>
                                    <div style={{ fontSize: 11, color: "#7d8590" }}>{ev.meta}</div>
                                    <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "var(--font-mono)", marginTop: 4 }}>{ev.time}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </TableWrap>
            </div>

            {/* Latest Signups */}
            <TableWrap>
                <TableToolbar>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Latest Signups</div>
                    <div style={{ marginLeft: "auto" }}>
                        <a href="/admin/users/signups" style={{ fontSize: 12, color: "#388bfd", textDecoration: "none" }}>
                            View all →
                        </a>
                    </div>
                </TableToolbar>

                <div className="table-scroll">
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                        <thead>
                            <tr style={{ background: "#1c2330", borderBottom: "1px solid #21282f" }}>
                                {["User", "Joined", "Method", "Status"].map(h => (
                                    <th key={h} style={{
                                        textAlign: "left", padding: "8px 14px",
                                        fontSize: 10, fontWeight: 600, letterSpacing: ".07em",
                                        textTransform: "uppercase", color: "#7d8590", whiteSpace: "nowrap",
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { name: "Ravi Kumar", email: "ravi.k@gmail.com", date: "22 Mar 2026", status: "Active" as const },
                                { name: "Priya Sharma", email: "priya.s@yahoo.com", date: "21 Mar 2026", status: "Active" as const },
                                { name: "Arjun Mehta", email: "arjun.m@outlook.com", date: "21 Mar 2026", status: "Pending" as const },
                            ].map((u, i, arr) => (
                                <tr key={i} style={{ borderBottom: i < arr.length - 1 ? "1px solid #21282f" : "none" }}>
                                    <td style={{ padding: "9px 14px" }}>
                                        <UserCell name={u.name} email={u.email} index={i} />
                                    </td>
                                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap" }}>
                                        {u.date}
                                    </td>
                                    <td style={{ padding: "9px 14px" }}>
                                        <Badge variant="blue">OTP</Badge>
                                    </td>
                                    <td style={{ padding: "9px 14px" }}>
                                        <Badge variant={u.status === "Active" ? "green" : "yellow"} dot>
                                            {u.status}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </TableWrap>
        </div>
    );
}