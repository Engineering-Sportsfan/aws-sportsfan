// "use client";

// import { usePathname } from "next/navigation";
// import Link from "next/link";
// import { useState } from "react";
// import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

// const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600"] });
// const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"] });

// interface NavChildItem { href: string; label: string; }
// interface NavItem {
//   href?: string; icon?: string; label: string;
//   badge?: string; children?: NavChildItem[];
// }
// interface NavGroup { label: string; items: NavItem[]; }

// const NAV: NavGroup[] = [
//   {
//     label: "Overview",
//     items: [
//       { href: "/admin", icon: "▣", label: "Dashboard" },
//       { href: "/admin/analytics", icon: "◈", label: "Analytics" },
//     ],
//   },
//   {
//     label: "Management",
//     items: [
//       {
//         label: "Users", icon: "◉", badge: "30+",
//         children: [
//           { href: "/admin/users/signups", label: "Signups" },
//           // { href: "/admin/users/otp", label: "Send & Verify OTP" },
//         ],
//       },
//       // { href: "/admin/content", icon: "◧", label: "Content / Posts"   },
//       // { href: "/admin/orders",  icon: "◫", label: "Orders & Payments", badge: "8" },
//     ],
//   },
//   {
//     label: "Auth",
//     items: [{ href: "/admin/otp-logs", icon: "⊡", label: "OTP Logs" }],
//   },
//   {
//     label: "Home Data Components",
//     items: [
//       {
//         label: "Teams 360", icon: "◉",
//         children: [
//           { href: "/admin/team360-management/add-team360", label: "Add Teams 360" },
//           { href: "/admin/team360-management/team360-list", label: "Teams 360 List" },
//         ],
//       },
//       {
//         label: "Teams 360 Playlist", icon: "◉",
//         children: [
//           { href: "/admin/team360playlist-management/add-team360playlist", label: "Add Teams 360 Playlist" },
//           { href: "/admin/team360playlist-management/team360playlist-list", label: "Teams 360 Playlist List" },
//         ],
//       },
//       {
//         label: "Players 360", icon: "◉",
//         children: [
//           { href: "/admin/player360-management/add-player360", label: "Add Player 360" },
//           { href: "/admin/player360-management/player360-list", label: "Player 360 List" },
//         ],
//       },
//       {
//         label: "Cricket Articles", icon: "◉",
//         children: [
//           { href: "/admin/cricketarticles-management/add-cricketarticles", label: "Add Cricket Article" },
//           { href: "/admin/cricketarticles-management/cricketarticles-list", label: "Cricket Articles List" },
//         ],
//       },
//       {
//         label: "Club Profiles", icon: "◉",
//         children: [
//           { href: "/admin/clubprofile-management/add-clubprofile", label: "Add Club Profile" },
//           { href: "/admin/clubprofile-management/clubprofile-list", label: "Club Profiles List" },
//         ],
//       },
//       {
//         label: "User Feedback", icon: "◉",
//         children: [
//           { href: "/admin/userfeedback-management/add-userfeedback", label: "Add User Feedback" },
//           { href: "/admin/userfeedback-management/userfeedback-list", label: "User Feedback List" },
//         ],
//       },
//        {
//         label: "Player Profiles", icon: "◉",
//         children: [
//           { href: "/admin/playerprofile-management/add-playerprofile", label: "Add Player Profile" },
//           { href: "/admin/playerprofile-management/playerprofile-list", label: "Player Profiles List" },
//         ],
//       },
//        {
//         label: "Player Profiles Playlist", icon: "◉",
//         children: [
//           { href: "/admin/playerprofileplaylist-management/add-playerprofileplaylist", label: "Add Player Profiles Playlist" },
//           { href: "/admin/playerprofileplaylist-management/playerprofileplaylist-list", label: "Player Profiles Palylist" },
//         ],
//       },
//       {
//         label: "Watch Along", icon: "◉",
//         children: [
//           { href: "/admin/watchalong-management/add-watchalong", label: "Add Watch Along" },
//           { href: "/admin/watchalong-management/watchalong-list", label: "Watch Along List" },
//         ],
//       },
//        {
//         label: "Polls & Quizes", icon: "◉",
//         children: [
//           { href: "/admin/polls-management/add-polls", label: "Add Poll" },
//           { href: "/admin/polls-management/polls-list", label: "Polls List" },
//         ],
//       },
//         {
//         label: "Host Screen", icon: "◉",
//         children: [
//           { href: "/admin/hostroom-management/add-hostroom", label: "Add Host Room" },
//           { href: "/admin/hostroom-management/hostroom-list", label: "Host Room List" },
//         ],
//       },
//       {
//         label: "Host Login Screen", icon: "◉",
//         children: [
//           { href: "/admin/hostloginscreen-management/add-hostroomlogin", label: "Add Host Login Form" },
//           { href: "/admin/hostloginscreen-management/hostroomlogin-list", label: "Host Members List" },
//         ],
//       },
//        {
//         label: "Audio Content Screen", icon: "◉",
//         children: [
//           // { href: "/admin/hostloginscreen-management/add-hostroomlogin", label: "Add Host Login Form" },
//           { href: "/admin/audiomessages-management", label: "Audio Messages List" },
//           { href: "/admin/audiodrops-management/", label: "Audio Request Drops List" },
//            { href: "/admin/audioplaylist-management/", label: "Audio List" },

//         ],
//       },
//       {
//         label: "Video Messages Screen", icon: "◉",
//         children: [
//           // { href: "/admin/hostloginscreen-management/add-hostroomlogin", label: "Add Host Login Form" },
//           { href: "/admin/videodrops-management/videomessages", label: "Video Messages List" },
//           // { href: "/admin/videodrops-management/", label: "Video Request Drops List" },
//           //  { href: "/admin/videoplaylist-management/", label: "Video List" },

//         ],
//       },
//        {
//         label: "IPL Matches", icon: "◉",
//         children: [
//           { href: "/admin/cricketmatches-management/add-cricketmatches", label: "Add IPL Matches" },
//           { href: "/admin/cricketmatches-management/cricketmatches-list", label: "IPL Matches List" },
//         ],
//       },
//       {
//         label: "Women's World Cup Matches", icon: "◉",
//         children: [
//           { href: "/admin/woment20wc-management/add-woment20wc", label: "Add Women's World Cup Match" },
//           { href: "/admin/woment20wc-management/woment20wc-list", label: "Women's World Cup Matches List" },
//         ],
//       },
//        {
//         label: "Fan Battle", icon: "◉",
//         children: [
//           { href: "/admin/fanbattle-management/add-fanbattle", label: "Add Fan Battle" },
//           { href: "/admin/fanbattle-management/fanbattle-list", label: "Fan Battle List" },
//           { href: "/admin/fanbattlearena-management/add-battlearena", label: "Add Fan Battle Arena" },
//           { href: "/admin/fanbattlearena-management/battlearena-list", label: "Fan Battle Arena List" },

//         ],
//       },
//       {
//         label: "Comments Management", icon: "◉",
//         children: [
//           { href: "/admin/comments-management/comments-list", label: "All Comments" },
//         ],
//       },
//        {
//         label: "Post Reports Management", icon: "◉",
//         children: [
//           { href: "/admin/postreports-management", label: "All Post Reports" },
//         ],
//       },
//       {
//         label: "Playlists Management", icon: "◉",
//         children: [
//           { href: "/admin/playlists-management/playlists-list", label: "All Playlists" },
//         ],
//       },
//        {
//         label: "Sportsfan360 Profile", icon: "◉",
//         children: [
//           { href: "/admin/sportsfan360profile-management/add-sportsfan360", label: "Add Sportsfan360 Profile" },
//            { href: "/admin/sportsfan360profile-management/sportsfan360profile-list", label: "Sportsfan360 Profile List" },

//         ],
//       },
//       {
//         label: "User Preferences", icon: "◉",
//         children: [
//           { href: "/admin/preferences-management", label: "Preferences List" },
//         ],
//       },
//       {
//         label: "IPL Pulse", icon: "◉",
//         children: [
//           { href: "/admin/spotlight-management/add-spotlight", label: "Add Spotlight" },
//           { href: "/admin/spotlight-management/spotlight-list", label: "Spotlight List" },
//           { href: "/admin/iplpulse-management", label: "IPL Pulse Reports" },
//         ],
//       },
//       // { href: "/admin/content", icon: "◧", label: "Content / Posts"   },
//       // { href: "/admin/orders",  icon: "◫", label: "Orders & Payments", badge: "8" },
//     ],
//   },
//   {
//     label: "System",
//     items: [{ href: "/admin/settings", icon: "⊙", label: "Settings" }],
//   },

// ];

// export default function AdminLayout({ children }: { children: React.ReactNode }) {
//   const pathname = usePathname();
//   const [sidebarOpen, setSidebarOpen] = useState(false);
//   const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

//   const toggleMenu = (label: string) =>
//     setOpenMenus(p => ({ ...p, [label]: !p[label] }));

//   const pageTitle = (() => {
//     if (pathname === "/admin") return "Dashboard";
//     const seg = pathname.split("/").pop() ?? "";
//     return seg.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
//   })();

//   const SidebarContent = () => (
//   <>
//     {/* Logo */}
//     <div style={{
//       height: 52, display: "flex", alignItems: "center",
//       justifyContent: "space-between",
//       gap: 10, padding: "0 16px",
//       borderBottom: "1px solid #21282f",
//       fontSize: 14, fontWeight: 600, flexShrink: 0,
//     }}>
//       <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
//         <div style={{
//           width: 26, height: 26, borderRadius: 5, background: "#1f6feb",
//           display: "grid", placeItems: "center",
//           fontSize: 11, fontWeight: 700, color: "#fff",
//         }}>A</div>
//         AdminConsole
//       </div>
//       {/* Close button — mobile only */}
//       <button
//         onClick={() => setSidebarOpen(false)}
//         style={{
//           background: "none", border: "none", color: "#7d8590",
//           fontSize: 18, cursor: "pointer", padding: 4,
//           display: "block",
//         }}
//         className="md-hide-close"
//       >✕</button>
//     </div>

//     {/* Nav groups - with hidden scrollbar */}
//     <div style={{ 
//       overflowY: "auto", 
//       flex: 1,
//       /* Hide scrollbar for Chrome, Safari and Opera */
//       scrollbarWidth: "none", /* Firefox */
//       msOverflowStyle: "none", /* IE and Edge */
//     }}
//     className="hide-scrollbar">
//       {NAV.map((group) => (
//         <div key={group.label} style={{ padding: "12px 0", borderBottom: "1px solid #21282f" }}>
//           <div style={{
//             fontSize: 10, fontWeight: 600, letterSpacing: ".08em",
//             color: "#7d8590", textTransform: "uppercase", padding: "0 16px 6px",
//           }}>{group.label}</div>

//           {group.items.map((item) => {
//             if (item.children) {
//               const isOpen = openMenus[item.label] ?? pathname.startsWith("/admin/users");
//               return (
//                 <div key={item.label}>
//                   <div
//                     onClick={() => toggleMenu(item.label)}
//                     style={{
//                       display: "flex", alignItems: "center", gap: 9,
//                       padding: "7px 16px", cursor: "pointer",
//                       color: "#7d8590", fontSize: 13,
//                     }}
//                   >
//                     <span style={{ width: 15 }}>{item.icon}</span>
//                     {item.label}
//                     {item.badge && (
//                       <span style={{
//                         marginLeft: "auto", background: "#1f6feb", color: "#fff",
//                         fontSize: 10, fontFamily: plexMono.style.fontFamily,
//                         padding: "1px 6px", borderRadius: 10, fontWeight: 600,
//                       }}>{item.badge}</span>
//                     )}
//                     <span style={{ marginLeft: item.badge ? 6 : "auto", fontSize: 10 }}>
//                       {isOpen ? "▼" : "▶"}
//                     </span>
//                   </div>
//                   {isOpen && item.children?.map((sub) => {
//                     const active = pathname === sub.href;
//                     return (
//                       <Link key={sub.href} href={sub.href} style={{ textDecoration: "none" }}
//                         onClick={() => setSidebarOpen(false)}>
//                         <div style={{
//                           padding: "6px 16px 6px 36px", fontSize: 12, cursor: "pointer",
//                           color: active ? "#e6edf3" : "#7d8590",
//                           background: active ? "rgba(31,111,235,.1)" : "transparent",
//                           borderLeft: `2px solid ${active ? "#388bfd" : "transparent"}`,
//                         }}>• {sub.label}</div>
//                       </Link>
//                     );
//                   })}
//                 </div>
//               );
//             }

//             const active = pathname === item.href;
//             return (
//               <Link key={item.href} href={item.href || "#"} style={{ textDecoration: "none" }}
//                 onClick={() => setSidebarOpen(false)}>
//                 <div style={{
//                   display: "flex", alignItems: "center", gap: 9,
//                   padding: "7px 16px", cursor: "pointer",
//                   color: active ? "#e6edf3" : "#7d8590", fontSize: 13,
//                   borderLeft: `2px solid ${active ? "#388bfd" : "transparent"}`,
//                   background: active ? "rgba(31,111,235,.1)" : "transparent",
//                 }}>
//                   <span style={{ width: 15 }}>{item.icon}</span>
//                   {item.label}
//                   {item.badge && (
//                     <span style={{
//                       marginLeft: "auto", background: "#1f6feb", color: "#fff",
//                       fontSize: 10, fontFamily: plexMono.style.fontFamily,
//                       padding: "1px 6px", borderRadius: 10, fontWeight: 600,
//                     }}>{item.badge}</span>
//                   )}
//                 </div>
//               </Link>
//             );
//           })}
//         </div>
//       ))}
//     </div>
//   </>
// );

//   return (
//     <>
//       <style>{`
//           * { box-sizing: border-box; }
//           body { margin: 0; }

//           .admin-shell {
//             display: flex;
//             height: 100vh;
//             overflow: hidden;
//             background: #0d1117;
//             color: #e6edf3;
//             font-family: ${plexSans.style.fontFamily};
//           }

//           /* Desktop sidebar */
//           .sidebar-desktop {
//             width: 220px;
//             flex-shrink: 0;
//             background: #161b22;
//             border-right: 1px solid #21282f;
//             display: flex;
//             flex-direction: column;
//             overflow-y: auto;
//           }

//           /* Mobile overlay sidebar */
//           .sidebar-overlay {
//             position: fixed;
//             inset: 0;
//             z-index: 50;
//             display: flex;
//           }
//           .sidebar-backdrop {
//             position: absolute;
//             inset: 0;
//             background: rgba(0,0,0,.6);
//           }
//           .sidebar-drawer {
//             position: relative;
//             width: 240px;
//             background: #161b22;
//             display: flex;
//             flex-direction: column;
//             height: 100%;
//             z-index: 1;
//             animation: slideIn .2s ease;
//           }
//           @keyframes slideIn {
//             from { transform: translateX(-100%); }
//             to   { transform: translateX(0); }
//           }

//           /* Hamburger — visible on mobile */
//           .hamburger { display: none; }

//           /* Hide close btn on desktop */
//           .md-hide-close { display: none !important; }

//           @media (max-width: 768px) {
//             .sidebar-desktop { display: none; }
//             .hamburger { display: flex !important; }
//             .md-hide-close { display: block !important; }
//           }

//           /* Responsive content */
//           .stats-grid {
//             display: grid;
//             grid-template-columns: repeat(4, 1fr);
//             gap: 14px;
//             margin-bottom: 20px;
//           }
//           .chart-grid {
//             display: grid;
//             grid-template-columns: 2fr 1fr;
//             gap: 14px;
//             margin-bottom: 20px;
//           }

//           @media (max-width: 1024px) {
//             .stats-grid { grid-template-columns: repeat(2, 1fr); }
//             .chart-grid { grid-template-columns: 1fr; }
//           }

//           @media (max-width: 480px) {
//             .stats-grid { grid-template-columns: 1fr 1fr; }
//           }

//           /* Table scroll on mobile */
//           .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

//           /* Content padding */
//           .main-content {
//             flex: 1;
//             overflow-y: auto;
//             padding: 20px 24px;
//           }
//           @media (max-width: 768px) {
//             .main-content { padding: 16px; }
//           }

//           /* Topbar search hide on small */
//           .search-bar {
//             background: #0d1117;
//             border: 1px solid #2d3748;
//             border-radius: 6px;
//             padding: 5px 10px;
//             color: #e6edf3;
//             font-size: 12px;
//             width: 220px;
//             outline: none;
//           }
//           @media (max-width: 640px) {
//             .search-bar { display: none; }
//           }
//         `}</style>
//       <div className="admin-shell">

//           {/* Desktop Sidebar */}
//           <nav className="sidebar-desktop">
//             <SidebarContent />
//           </nav>

//           {/* Mobile Sidebar Overlay */}
//           {sidebarOpen && (
//             <div className="sidebar-overlay">
//               <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
//               <div className="sidebar-drawer">
//                 <SidebarContent />
//               </div>
//             </div>
//           )}

//           {/* Main */}
//           <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

//             {/* Topbar */}
//             <div style={{
//               height: 52, flexShrink: 0,
//               background: "#161b22", borderBottom: "1px solid #21282f",
//               display: "flex", alignItems: "center", gap: 12, padding: "0 20px",
//             }}>
//               {/* Hamburger */}
//               <button
//                 className="hamburger"
//                 onClick={() => setSidebarOpen(true)}
//                 style={{
//                   background: "none", border: "none", color: "#e6edf3",
//                   fontSize: 20, cursor: "pointer", padding: 4,
//                   alignItems: "center",
//                 }}
//               >☰</button>

//               <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{pageTitle}</div>

//               <div style={{
//                 fontFamily: plexMono.style.fontFamily, fontSize: 10,
//                 background: "rgba(46,160,67,.15)", color: "#2ea043",
//                 padding: "2px 8px", borderRadius: 12, border: "1px solid #2ea043",
//                 whiteSpace: "nowrap",
//               }}>● LIVE</div>

//               <input placeholder="Search…" className="search-bar" />

//               <div style={{
//                 width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
//                 background: "linear-gradient(135deg,#1f6feb,#388bfd)",
//                 display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
//               }}>AD</div>
//             </div>

//             {/* Page content */}
//             <div className="main-content">
//               {children}
//             </div>
//           </div>
//         </div>
//     </>
//   );
// }





"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { useSession } from "next-auth/react";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"] });

interface NavChildItem { href: string; label: string; }
interface NavItem {
  href?: string; icon?: string; label: string;
  badge?: string; children?: NavChildItem[];
}
interface NavGroup { label: string; items: NavItem[]; }

// FULL NAVIGATION - All modules (for regular users)
const FULL_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", icon: "▣", label: "Dashboard" },
      { href: "/admin/analytics", icon: "◈", label: "Analytics" },
    ],
  },
  {
    label: "Management",
    items: [
      {
        label: "User Management", icon: "👥",
        children: [
          { href: "/admin/user-management/users/add-user-form", label: "Add User" },
          { href: "/admin/user-management/users/user-list", label: "User List" },
          { href: "/admin/userroles-management/assign-roles", label: "User Roles" },
          { href: "/admin/department-management/add-department-form", label: "Add Department" },
          { href: "/admin/department-management/department-list", label: "Department List" },
        ],
      },
      {
        label: "Users", icon: "◉", badge: "30+",
        children: [
          { href: "/admin/users/signups", label: "Signups" },
        ],
      },
      {
        label: "Points & Rewards", icon: "🪙",
        children: [
          { href: "/admin/points-management", label: "Points & Rules Config" },
        ],
      },
    ],
  },
  {
    label: "Auth",
    items: [{ href: "/admin/otp-logs", icon: "⊡", label: "OTP Logs" }],
  },
  {
    label: "Home Data Components",
    items: [
      {
        label: "Store Management", icon: "◉",
        children: [
          { href: "/admin/store-management/addCategory", label: "Add Category" },
          { href: "/admin/store-management/addCoach", label: "Add Coach" },
          { href: "/admin/store-management/addExperience", label: "Add Experience" },
          { href: "/admin/store-management/addEvent", label: "Add Event" },
          { href: "/admin/store-management/addAuction", label: "Add Auction" },
          { href: "/admin/store-management/addAthlete", label: "Add Athlete" },
          { href: "/admin/store-management/addMerchandise", label: "Add Merchandise" },
          { href: "/admin/store-management/addBrand", label: "Add Brand" },
          { href: "/admin/store-management/addDigitalProduct", label: "Add Digital Product" },
          { href: "/admin/store-management/addMembership", label: "Add Membership" },
        ],
      },
      {
        label: "Teams 360", icon: "◉",
        children: [
          { href: "/admin/team360-management/add-team360", label: "Add Teams 360" },
          { href: "/admin/team360-management/team360-list", label: "Teams 360 List" },
        ],
      },
      {
        label: "Teams 360 Playlist", icon: "◉",
        children: [
          { href: "/admin/team360playlist-management/add-team360playlist", label: "Add Teams 360 Playlist" },
          { href: "/admin/team360playlist-management/team360playlist-list", label: "Teams 360 Playlist List" },
        ],
      },
      {
        label: "Players 360", icon: "◉",
        children: [
          { href: "/admin/player360-management/add-player360", label: "Add Player 360" },
          { href: "/admin/player360-management/player360-list", label: "Player 360 List" },
        ],
      },
      {
        label: "Cricket Articles", icon: "◉",
        children: [
          { href: "/admin/cricketarticles-management/add-cricketarticles", label: "Add Cricket Article" },
          { href: "/admin/cricketarticles-management/cricketarticles-list", label: "Cricket Articles List" },
        ],
      },
      {
        label: "Club Profiles", icon: "◉",
        children: [
          { href: "/admin/clubprofile-management/add-clubprofile", label: "Add Club Profile" },
          { href: "/admin/clubprofile-management/clubprofile-list", label: "Club Profiles List" },
        ],
      },
      {
        label: "User Feedback", icon: "◉",
        children: [
          { href: "/admin/userfeedback-management/add-userfeedback", label: "Add User Feedback" },
          { href: "/admin/userfeedback-management/userfeedback-list", label: "User Feedback List" },
        ],
      },
      {
        label: "Player Profiles", icon: "◉",
        children: [
          { href: "/admin/playerprofile-management/add-playerprofile", label: "Add Player Profile" },
          { href: "/admin/playerprofile-management/playerprofile-list", label: "Player Profiles List" },
        ],
      },
      {
        label: "Player Profiles Playlist", icon: "◉",
        children: [
          { href: "/admin/playerprofileplaylist-management/add-playerprofileplaylist", label: "Add Player Profiles Playlist" },
          { href: "/admin/playerprofileplaylist-management/playerprofileplaylist-list", label: "Player Profiles Playlist" },
        ],
      },
        {
        label: "Onboarding", icon: "◉",
        children: [
          { href: "/admin/onboarding-management/add-onboarding", label: "Add Onboarding" },
          
        ],
      },
      {
        label: "Watch Along", icon: "◉",
        children: [
          { href: "/admin/watchalong-management/add-watchalong", label: "Add Watch Along" },
          { href: "/admin/watchalong-management/watchalong-list", label: "Watch Along List" },
        ],
      },
      {
        label: "Focus Group Matches", icon: "◉",
        children: [
          { href: "/admin/focusmatch-management/add-focusmatch", label: "Add Focus Match" },
          { href: "/admin/focusmatch-management/focusmatch-list", label: "Matches List" },
        ],
      },
      {
        label: "RoAR Management", icon: "◉",
        children: [
          { href: "/admin/roar-management/add-roar", label: "Add RoAR Show" },
          { href: "/admin/roar-management/roar-list", label: "RoAR Show List" },
          { href: "/admin/roar-management/posts-list", label: "RoAR Posts & Comments" },
          { href: "/admin/roar-management/add-prediction", label: "Add RoAR Predictions" },
          { href: "/admin/roar-management/add-trivia", label: "Add RoAR Trivia" },
          { href: "/admin/roar-management/add-battle", label: "Add RoAR Battle" },
        ],
      },
      {
        label: "Polls & Quizes", icon: "◉",
        children: [
          { href: "/admin/polls-management/add-polls", label: "Add Poll" },
          { href: "/admin/polls-management/polls-list", label: "Polls List" },
        ],
      },
      {
        label: "Host Screen", icon: "◉",
        children: [
          { href: "/admin/hostroom-management/add-hostroom", label: "Add Host Room" },
          { href: "/admin/hostroom-management/hostroom-list", label: "Host Room List" },
        ],
      },
      {
        label: "Host Login Screen", icon: "◉",
        children: [
          { href: "/admin/hostloginscreen-management/add-hostroomlogin", label: "Add Host Login Form" },
          { href: "/admin/hostloginscreen-management/hostroomlogin-list", label: "Host Members List" },
        ],
      },
      {
        label: "Audio Content Screen", icon: "◉",
        children: [
          { href: "/admin/audiomessages-management", label: "Audio Messages List" },
          { href: "/admin/audiodrops-management/", label: "Audio Request Drops List" },
          { href: "/admin/audioplaylist-management/", label: "Audio List" },
        ],
      },
      {
        label: "Video Messages Screen", icon: "◉",
        children: [
          { href: "/admin/videodrops-management/videomessages", label: "Video Messages List" },
        ],
      },
      {
        label: "Cricket Matches", icon: "◉",
        children: [
          { href: "/admin/cricketmatches-management/add-cricketmatches", label: "Add Cricket Matches" },
          { href: "/admin/cricketmatches-management/cricketmatches-list", label: "Cricket Matches List" },
        ],
      },
    
     
       {
        label: "FIFA Players Stats", icon: "◉",
        children: [
          { href: "/admin/fifaplayerstats-management/add-fifaplayerstats", label: "Add FIFA Players Stats" },
          { href: "/admin/fifaplayerstats-management/fifaplayerstats-list", label: "FIFA Players Stats List" },
        ],
      },
       {
        label: "FIFA Clubs", icon: "◉",
        children: [
          { href: "/admin/fifaclub-management/add-fifaclub", label: "Add FIFA Club" },
          { href: "/admin/fifaclub-management/fifaclub-list", label: "FIFA Club List" },
        ],
      },
        {
        label: "WT20 Clubs", icon: "◉",
        children: [
          { href: "/admin/wt20club-management/add-wt20club", label: "Add WT20 Club" },
          { href: "/admin/wt20club-management/wt20club-list", label: "WT20 Club List" },
        ],
      },
      {
        label: "Fan Battle", icon: "◉",
        children: [
          { href: "/admin/fanbattle-management/add-fanbattle", label: "Add Fan Battle" },
          { href: "/admin/fanbattle-management/fanbattle-list", label: "Fan Battle List" },
          { href: "/admin/fanbattlearena-management/add-battlearena", label: "Add Fan Battle Arena" },
          { href: "/admin/fanbattlearena-management/battlearena-list", label: "Fan Battle Arena List" },
        ],
      },
      {
        label: "Comments Management", icon: "◉",
        children: [
          { href: "/admin/comments-management/comments-list", label: "All Comments" },
        ],
      },
      {
        label: "Post Reports Management", icon: "◉",
        children: [
          { href: "/admin/postreports-management", label: "All Post Reports" },
        ],
      },
      {
        label: "Playlists Management", icon: "◉",
        children: [
          { href: "/admin/playlists-management/playlists-list", label: "All Playlists" },
        ],
      },
      {
        label: "Sportsfan360 Profile", icon: "◉",
        children: [
          { href: "/admin/sportsfan360profile-management/add-sportsfan360", label: "Add Sportsfan360 Profile" },
          { href: "/admin/sportsfan360profile-management/sportsfan360profile-list", label: "Sportsfan360 Profile List" },
        ],
      },
      {
        label: "User Preferences", icon: "◉",
        children: [
          { href: "/admin/preferences-management", label: "Preferences List" },
        ],
      },
      {
        label: "IPL Pulse", icon: "◉",
        children: [
          { href: "/admin/spotlight-management/add-spotlight", label: "Add Spotlight" },
          { href: "/admin/spotlight-management/spotlight-list", label: "Spotlight List" },
          { href: "/admin/iplpulse-management", label: "IPL Pulse Reports" },
        ],
      },
      {
        label: "Sentiment Engine", icon: "◉",
        children: [
          { href: "/admin/sentiment-management", label: "Sentiment Dashboard" },
        ],
      },
      { href: "/admin/content", icon: "◧", label: "Content / Posts" },
      { href: "/admin/orders", icon: "◫", label: "Orders & Payments", badge: "8" },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/settings", icon: "⊙", label: "Settings" }],
  },
];

// LIMITED NAVIGATION - Only Watch Along (for restricted users)
const LIMITED_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", icon: "▣", label: "Dashboard" },
    ],
  },
  {
    label: "Home Data Components",
    items: [
      {
        label: "Watch Along", icon: "◉",
        children: [
          { href: "/admin/watchalong-management/add-watchalong", label: "Add Watch Along" },
          { href: "/admin/watchalong-management/watchalong-list", label: "Watch Along List" },
        ],
      },
    ],
  },
];

// List of restricted users (only see Watch Along module)
const RESTRICTED_USERS = [
  // "venkyiimb@gmail.com",
  // "sethi.anshul39@gmail.com"
  ""
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [isRestrictedUser, setIsRestrictedUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const toggleMenu = (label: string) =>
    setOpenMenus(p => ({ ...p, [label]: !p[label] }));

  // Check user email and determine if restricted
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      const userEmail = session.user.email.toLowerCase();
      setIsRestrictedUser(RESTRICTED_USERS.includes(userEmail));
    }
    setIsLoading(false);
  }, [session, status]);

  // Select NAV based on user type
  const NAV = isRestrictedUser ? LIMITED_NAV : FULL_NAV;

  // CHECK: If user is on login page (/admin), show NO sidebar
  const isLoginPage = pathname === "/admin";

  // If on login page, render just the children (login form) with no sidebar
  if (isLoginPage) {
    return (
      <div className="min-h-screen w-full" style={{ background: "#0d1117" }}>
        {children}
      </div>
    );
  }

  // Show loading while checking session
  if (isLoading || status === "loading") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#0d1117" }}>
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Otherwise, show full layout with sidebar for authenticated pages
  const pageTitle = (() => {
    if (pathname === "/admin/dashboard") return "Dashboard";
    const seg = pathname.split("/").pop() ?? "";
    return seg.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  })();

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{
        height: 52, display: "flex", alignItems: "center",
        justifyContent: "space-between",
        gap: 10, padding: "0 16px",
        borderBottom: "1px solid #21282f",
        fontSize: 14, fontWeight: 600, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 120 143" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
              <defs>
                <linearGradient id="sportsfanLogoGradient" x1="0" y1="71.43" x2="120" y2="71.43" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FF1379" />
                  <stop offset="1" stopColor="#FE7604" />
                </linearGradient>
              </defs>
              <path d="M56.824 0.097C54.024 0.29 51.224 0.579 48.472 1.159C39.878 2.848 32.009 6.228 24.912 11.346C18.201 16.174 12.746 22.112 8.497 29.161C8.353 29.402 8.256 29.692 8.111 29.933C8.208 30.03 8.256 30.078 8.353 30.127C13.132 32.492 17.912 34.858 22.788 37.224C22.981 36.982 23.126 36.789 23.271 36.548C25.057 33.796 27.085 31.237 29.45 28.968C37.078 21.533 46.203 17.429 56.776 16.56C61.121 16.222 65.37 16.56 69.618 17.526C82.895 20.519 94.047 29.595 99.696 42.003C101.53 46.011 102.689 50.163 103.269 54.459C103.413 55.57 103.51 56.68 103.51 57.791C103.51 60.494 103.317 63.15 102.979 65.805C102.544 69.523 101.82 73.24 100.806 76.861C97.041 90.331 90.04 101.87 79.902 111.526C74.205 116.933 67.784 121.278 60.735 124.658C60.493 124.754 60.204 124.899 59.963 124.996C53.252 121.858 47.217 117.899 41.713 112.974C37.947 109.643 32.589 103.753 31.526 101.773C32.492 101.242 33.554 100.76 34.616 100.325C35.678 99.842 36.692 99.408 37.803 98.973C38.865 98.539 39.927 98.152 40.989 97.766C42.099 97.38 43.161 96.994 44.272 96.656C45.334 96.318 46.444 95.98 47.555 95.69C48.617 95.352 49.727 95.111 50.789 94.821C51.9 94.58 53.059 94.29 54.169 94.049C55.279 93.856 56.438 93.614 57.549 93.421C58.659 93.276 59.818 93.083 60.928 92.938C62.087 92.793 63.245 92.649 64.356 92.552C65.515 92.407 66.625 92.359 67.735 92.262C67.784 92.117 67.832 92.069 67.832 92.021C67.832 91.924 67.832 91.828 67.784 91.779C66.818 86.469 65.804 81.206 64.839 75.944C64.839 75.896 64.839 75.896 64.79 75.847C64.79 75.847 64.742 75.847 64.694 75.799C64.018 75.702 63.294 75.847 62.618 75.896C59.48 76.185 56.39 76.62 53.3 77.199C46.444 78.454 39.782 80.289 33.264 82.8C30.078 84.006 26.892 85.407 23.802 86.903C23.512 87.048 23.271 87.241 22.933 87.193C21.726 84.972 19.457 78.406 18.443 73.82C17.96 71.888 17.574 69.957 17.332 67.929C18.829 67.06 20.326 66.24 21.822 65.515C23.367 64.743 24.912 64.019 26.457 63.343C28.002 62.667 29.547 62.039 31.14 61.46C32.733 60.881 34.326 60.301 35.968 59.818C37.609 59.287 39.251 58.805 40.892 58.37C42.534 57.984 44.175 57.598 45.865 57.26C47.507 56.922 49.196 56.632 50.838 56.342C52.528 56.101 54.217 55.956 55.907 55.763C57.597 55.618 59.238 55.522 60.976 55.377C61.025 54.991 60.928 54.653 60.88 54.315C60.687 53.494 60.542 52.673 60.397 51.852C59.625 47.749 58.9 43.693 58.128 39.589C58.08 39.348 58.08 39.058 57.838 38.865C57.693 38.865 57.5 38.865 57.355 38.865C55.955 39.01 54.604 39.106 53.204 39.203C50.548 39.493 47.845 39.879 45.189 40.313C39.203 41.424 33.313 42.921 27.567 44.948C18.008 48.28 9.077 52.866 0.725 58.611C0.483 58.756 0.193 58.949 0 59.142C0 59.287 0 59.432 0 59.529C0.145 63.102 0.387 66.626 0.918 70.15C1.497 74.158 2.366 78.068 3.428 81.931C10.38 106.36 27.085 126.734 49.631 138.369C52.817 140.011 56.052 141.459 59.383 142.715C59.818 142.859 60.204 142.956 60.59 142.715C60.638 142.715 60.735 142.666 60.783 142.666C72.901 138.031 83.619 131.176 92.84 122.051C104.331 110.657 112.248 97.187 116.642 81.641C117.8 77.585 118.621 73.482 119.2 69.33C119.394 67.64 119.587 65.95 119.732 64.26C119.973 61.46 120.118 58.66 119.876 55.859C119.635 52.625 119.152 49.39 118.428 46.252C114.711 30.368 104.524 16.56 90.426 8.304C82.412 3.573 73.77 0.917 64.501 0.193C63.004 0.048 61.556 0 60.059 0C58.997 0 57.935 0.048 56.824 0.097Z" fill="url(#sportsfanLogoGradient)" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff", lineHeight: "1", letterSpacing: "0.5px" }}>SF360</span>
            <span style={{ fontSize: "10px", fontWeight: 600, color: "#7d8590", letterSpacing: "1px", textTransform: "uppercase" }}>Admin Console</span>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={() => setSidebarOpen(false)}
          style={{
            background: "none", border: "none", color: "#7d8590",
            fontSize: 18, cursor: "pointer", padding: 4,
            display: "block",
          }}
          className="md-hide-close"
        >✕</button>
      </div>

      {/* Nav groups - with hidden scrollbar */}
      <div style={{
        overflowY: "auto",
        flex: 1,
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
        className="hide-scrollbar">
        {NAV.map((group) => (
          <div key={group.label} style={{ padding: "12px 0", borderBottom: "1px solid #21282f" }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: ".08em",
              color: "#7d8590", textTransform: "uppercase", padding: "0 16px 6px",
            }}>{group.label}</div>

            {group.items.map((item) => {
              if (item.children) {
                const isOpen = openMenus[item.label] ?? (pathname.startsWith("/admin/watchalong") || pathname.startsWith("/admin/roar"));
                return (
                  <div key={item.label}>
                    <div
                      onClick={() => toggleMenu(item.label)}
                      style={{
                        display: "flex", alignItems: "center", gap: 9,
                        padding: "7px 16px", cursor: "pointer",
                        color: "#7d8590", fontSize: 13,
                      }}
                    >
                      <span style={{ width: 15 }}>{item.icon}</span>
                      {item.label}
                      {item.badge && (
                        <span style={{
                          marginLeft: "auto", background: "#1f6feb", color: "#fff",
                          fontSize: 10, fontFamily: plexMono.style.fontFamily,
                          padding: "1px 6px", borderRadius: 10, fontWeight: 600,
                        }}>{item.badge}</span>
                      )}
                      <span style={{ marginLeft: item.badge ? 6 : "auto", fontSize: 10 }}>
                        {isOpen ? "▼" : "▶"}
                      </span>
                    </div>
                    {isOpen && item.children?.map((sub) => {
                      const active = pathname === sub.href || pathname.startsWith(sub.href + "/");
                      return (
                        <Link key={sub.href} href={sub.href} style={{ textDecoration: "none" }}
                          onClick={() => setSidebarOpen(false)}>
                          <div style={{
                            padding: "6px 16px 6px 36px", fontSize: 12, cursor: "pointer",
                            color: active ? "#e6edf3" : "#7d8590",
                            background: active ? "rgba(31,111,235,.1)" : "transparent",
                            borderLeft: `2px solid ${active ? "#388bfd" : "transparent"}`,
                          }}>• {sub.label}</div>
                        </Link>
                      );
                    })}
                  </div>
                );
              }

              const active = pathname === item.href || (item.href && pathname.startsWith(item.href + "/"));
              return (
                <Link key={item.href} href={item.href || "#"} style={{ textDecoration: "none" }}
                  onClick={() => setSidebarOpen(false)}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "7px 16px", cursor: "pointer",
                    color: active ? "#e6edf3" : "#7d8590", fontSize: 13,
                    borderLeft: `2px solid ${active ? "#388bfd" : "transparent"}`,
                    background: active ? "rgba(31,111,235,.1)" : "transparent",
                  }}>
                    <span style={{ width: 15 }}>{item.icon}</span>
                    {item.label}
                    {item.badge && (
                      <span style={{
                        marginLeft: "auto", background: "#1f6feb", color: "#fff",
                        fontSize: 10, fontFamily: plexMono.style.fontFamily,
                        padding: "1px 6px", borderRadius: 10, fontWeight: 600,
                      }}>{item.badge}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      
      {/* Show restricted access indicator for limited users */}
      {isRestrictedUser && (
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid #21282f",
          fontSize: "11px",
          color: "#f85149",
          textAlign: "center",
          backgroundColor: "rgba(248,81,73,0.1)"
        }}>
          🔒 Restricted Access - Limited Modules
        </div>
      )}
    </>
  );

  return (
    <>
      <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; }

          .admin-shell {
            display: flex;
            height: 100vh;
            overflow: hidden;
            background: #0d1117;
            color: #e6edf3;
            font-family: ${plexSans.style.fontFamily};
          }

          /* Desktop sidebar */
          .sidebar-desktop {
            width: 220px;
            flex-shrink: 0;
            background: #161b22;
            border-right: 1px solid #21282f;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
          }

          /* Mobile overlay sidebar */
          .sidebar-overlay {
            position: fixed;
            inset: 0;
            z-index: 50;
            display: flex;
          }
          .sidebar-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,.6);
          }
          .sidebar-drawer {
            position: relative;
            width: 240px;
            background: #161b22;
            display: flex;
            flex-direction: column;
            height: 100%;
            z-index: 1;
            animation: slideIn .2s ease;
          }
          @keyframes slideIn {
            from { transform: translateX(-100%); }
            to   { transform: translateX(0); }
          }

          /* Hamburger — visible on mobile */
          .hamburger { display: none; }

          /* Hide close btn on desktop */
          .md-hide-close { display: none !important; }

          @media (max-width: 768px) {
            .sidebar-desktop { display: none; }
            .hamburger { display: flex !important; }
            .md-hide-close { display: block !important; }
          }

          /* Responsive content */
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 14px;
            margin-bottom: 20px;
          }
          .chart-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 14px;
            margin-bottom: 20px;
          }

          @media (max-width: 1024px) {
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
            .chart-grid { grid-template-columns: 1fr; }
          }

          @media (max-width: 480px) {
            .stats-grid { grid-template-columns: 1fr 1fr; }
          }

          /* Table scroll on mobile */
          .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

          /* Content padding */
          .main-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px 24px;
          }
          @media (max-width: 768px) {
            .main-content { padding: 16px; }
          }

          /* Topbar search hide on small */
          .search-bar {
            background: #0d1117;
            border: 1px solid #2d3748;
            border-radius: 6px;
            padding: 5px 10px;
            color: #e6edf3;
            font-size: 12px;
            width: 220px;
            outline: none;
          }
          @media (max-width: 640px) {
            .search-bar { display: none; }
          }
        `}</style>
      <div className="admin-shell">

        {/* Desktop Sidebar */}
        <nav className="sidebar-desktop">
          <SidebarContent />
        </nav>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="sidebar-overlay">
            <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
            <div className="sidebar-drawer">
              <SidebarContent />
            </div>
          </div>
        )}

        {/* Main */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Topbar */}
          <div style={{
            height: 52, flexShrink: 0,
            background: "#161b22", borderBottom: "1px solid #21282f",
            display: "flex", alignItems: "center", gap: 12, padding: "0 20px",
          }}>
            {/* Hamburger */}
            <button
              className="hamburger"
              onClick={() => setSidebarOpen(true)}
              style={{
                background: "none", border: "none", color: "#e6edf3",
                fontSize: 20, cursor: "pointer", padding: 4,
                alignItems: "center",
              }}
            >☰</button>

            <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{pageTitle}</div>

            <div style={{
              fontFamily: plexMono.style.fontFamily, fontSize: 10,
              background: "rgba(46,160,67,.15)", color: "#2ea043",
              padding: "2px 8px", borderRadius: 12, border: "1px solid #2ea043",
              whiteSpace: "nowrap",
            }}>● LIVE</div>

            <input placeholder="Search…" className="search-bar" />

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7d8590" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                <div style={{ position: "absolute", top: 2, right: 2, background: "#f85149", color: "#fff", fontSize: 9, fontWeight: 600, width: 14, height: 14, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>8</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg,#1f6feb,#388bfd)",
                  display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, color: "#fff"
                }}>AD</div>
              </div>
            </div>
          </div>

          {/* Page content */}
          <div className="main-content">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}