// "use client";
// import { useState } from "react";

// export default function OtpPage() {
//   const [email, setEmail]       = useState("");
//   const [otp, setOtp]           = useState("");
//   const [sent, setSent]         = useState(false);
//   const [sendMsg, setSendMsg]   = useState("");
//   const [verifyMsg, setVerifyMsg] = useState("");
//   const [loading, setLoading]   = useState(false);

//   async function handleSend() {
//     if (!email) return;
//     setLoading(true); setSendMsg("");
//     const res = await fetch("/api/auth/send-otp", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ email }),
//     });
//     const data = await res.json();
//     setLoading(false);
//     if (data.success) { setSent(true); setSendMsg("✅ OTP sent to " + email); }
//     else setSendMsg("❌ " + (data.error ?? "Failed to send"));
//   }

//   async function handleVerify() {
//     if (!email || !otp) return;
//     setLoading(true); setVerifyMsg("");
//     const res = await fetch("/api/auth/verify-otp", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ email, otp }),
//     });
//     const data = await res.json();
//     setLoading(false);
//     if (data.success) setVerifyMsg("✅ OTP verified! User authenticated.");
//     else setVerifyMsg("❌ " + (data.error ?? "Verification failed"));
//   }

//   const inputStyle = {
//     width: "100%", background: "#0d1117", border: "1px solid #2d3748",
//     borderRadius: 6, padding: "9px 12px", color: "#e6edf3",
//     fontFamily: "inherit", fontSize: 13, outline: "none",
//   } as React.CSSProperties;

//   const btnStyle = (color: string) => ({
//     padding: "9px 20px", borderRadius: 6, border: "none",
//     background: color, color: "#fff", fontFamily: "inherit",
//     fontSize: 13, fontWeight: 500, cursor: "pointer",
//     opacity: loading ? 0.6 : 1,
//   } as React.CSSProperties);

//   return (
//     <div>
//       <div style={{ marginBottom: 18 }}>
//         <h1 style={{ fontSize: 17, fontWeight: 600 }}>Send &amp; Verify OTP</h1>
//         <p style={{ color: "#7d8590", fontSize: 12, marginTop: 2 }}>
//           Test OTP flow directly from the admin panel
//         </p>
//       </div>

//       <div style={{
//         background: "#161b22", border: "1px solid #21282f",
//         borderRadius: 6, padding: 24, maxWidth: 480,
//       }}>
//         {/* Email */}
//         <div style={{ marginBottom: 16 }}>
//           <div style={{ fontSize: 11, fontWeight: 600, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>
//             Email Address
//           </div>
//           <input
//             style={inputStyle}
//             type="email"
//             placeholder="user@example.com"
//             value={email}
//             onChange={e => { setEmail(e.target.value); setSent(false); setSendMsg(""); setVerifyMsg(""); }}
//           />
//         </div>

//         {/* Send button */}
//         <button style={btnStyle("#1f6feb")} onClick={handleSend} disabled={loading || !email}>
//           {loading && !sent ? "Sending…" : "Send OTP"}
//         </button>

//         {sendMsg && (
//           <div style={{ marginTop: 10, fontSize: 12, color: sendMsg.startsWith("✅") ? "#2ea043" : "#da3633" }}>
//             {sendMsg}
//           </div>
//         )}

//         {/* OTP input — shown after send */}
//         {sent && (
//           <>
//             <div style={{ height: 1, background: "#21282f", margin: "20px 0" }} />
//             <div style={{ marginBottom: 16 }}>
//               <div style={{ fontSize: 11, fontWeight: 600, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>
//                 Enter OTP
//               </div>
//               <input
//                 style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 20, letterSpacing: ".2em", textAlign: "center" }}
//                 type="text"
//                 placeholder="● ● ● ● ● ●"
//                 maxLength={6}
//                 value={otp}
//                 onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setVerifyMsg(""); }}
//               />
//             </div>
//             <button style={btnStyle("#2ea043")} onClick={handleVerify} disabled={loading || otp.length < 6}>
//               {loading ? "Verifying…" : "Verify OTP"}
//             </button>
//             {verifyMsg && (
//               <div style={{ marginTop: 10, fontSize: 12, color: verifyMsg.startsWith("✅") ? "#2ea043" : "#da3633" }}>
//                 {verifyMsg}
//               </div>
//             )}
//           </>
//         )}
//       </div>
//     </div>
//   );
// }









// app/admin/users/otp/page.tsx
"use client";
import { useState } from "react";
import axios from "axios";

type Step = "email" | "otp" | "password" | "done";

export default function OtpPage() {
    const [step, setStep] = useState<Step>("email");
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPass, setConfirmPass] = useState("");
    const [loading, setLoading] = useState(false);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [token, setToken] = useState("");

    function setError(text: string) { setMsg({ text: "❌ " + text, ok: false }); }
    function setSuccess(text: string) { setMsg({ text: "✅ " + text, ok: true }); }

    // ── Step 1: Send OTP ─────────────────────────────
    async function handleSend() {
        if (!email || !firstName || !lastName) return;
        setLoading(true); setMsg(null);
        try {
            await axios.post("/api/auth/send-otp", { email, firstName, lastName });
            setSuccess("OTP sent to " + email);
            setStep("otp");
        } catch (err: unknown) {
            if(err instanceof Error) {
                setError(err.message);
            } else {
                setError("Failed to send OTP");
            }
        
        } finally {
            setLoading(false);
        }
    }

    // ── Step 2: Verify OTP ───────────────────────────
    async function handleVerify() {
        if (!email || otp.length < 6) return;
        setLoading(true); setMsg(null);
        try {
            await axios.post("/api/auth/verify-otp", { email, otp });
            setSuccess("OTP verified! Now set your password.");
            setStep("password");
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }

    // ── Step 3: Set Password ─────────────────────────
  async function handleSetPassword() {
    if (password !== confirmPass) { setError("Passwords do not match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setMsg(null);
    try {
        await axios.post("/api/auth/set-password", { email, password });
        setSuccess("Password set! Logging you in…");
        await handleLogin(password); // ✅ pass password directly
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errorMessage);
        setLoading(false);
    }
}

    // ── Step 4: Login ────────────────────────────────
   async function handleLogin(currentPassword?: string) {
    // ✅ use passed password, fallback to state
    const loginPassword = currentPassword ?? password;
    try {
        const res = await axios.post("/api/auth/login", {
            email,
            password: loginPassword,
        });
        setToken(res.data.token ?? "");
        setSuccess("Logged in successfully!");
        setStep("done");
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errorMessage);
    } finally {
        setLoading(false);
    }
}

    // ── Reset ────────────────────────────────────────
    function handleReset() {
        setStep("email"); setEmail(""); setOtp("");
        setPassword(""); setConfirmPass("");
        setFirstName(""); setLastName(""); 
        setMsg(null); setToken("");
    }

    // ── Styles ───────────────────────────────────────
    const inputStyle = {
        width: "100%", background: "#0d1117",
        border: "1px solid #2d3748", borderRadius: 6,
        padding: "9px 12px", color: "#e6edf3",
        fontFamily: "inherit", fontSize: 13, outline: "none",
    } as React.CSSProperties;

    const btnStyle = (color: string, disabled?: boolean) => ({
        padding: "9px 20px", borderRadius: 6, border: "none",
        background: disabled ? "#2d3748" : color,
        color: "#fff", fontFamily: "inherit",
        fontSize: 13, fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
        transition: "background .15s",
    } as React.CSSProperties);

    const fieldLabel = {
        fontSize: 11, fontWeight: 600, color: "#7d8590",
        textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 6,
    };

    // ── Progress bar ─────────────────────────────────
    const STEPS = ["Email", "OTP", "Password", "Done"];
    const stepIndex = { email: 0, otp: 1, password: 2, done: 3 }[step];

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 18 }}>
                <h1 style={{ fontSize: 17, fontWeight: 600 }}>Send &amp; Verify OTP</h1>
                <p style={{ color: "#7d8590", fontSize: 12, marginTop: 2 }}>
                    OTP → Verify → Set Password → Login
                </p>
            </div>

            {/* Progress steps */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24, maxWidth: 480 }}>
                {STEPS.map((label, i) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: "50%",
                                background: i <= stepIndex ? "#1f6feb" : "#1c2330",
                                border: `2px solid ${i <= stepIndex ? "#388bfd" : "#2d3748"}`,
                                display: "grid", placeItems: "center",
                                fontSize: 11, fontWeight: 700,
                                color: i <= stepIndex ? "#fff" : "#7d8590",
                                transition: "all .3s",
                            }}>{i < stepIndex ? "✓" : i + 1}</div>
                            <div style={{ fontSize: 10, color: i <= stepIndex ? "#e6edf3" : "#7d8590", whiteSpace: "nowrap" }}>
                                {label}
                            </div>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div style={{
                                flex: 1, height: 2, margin: "0 4px", marginBottom: 16,
                                background: i < stepIndex ? "#1f6feb" : "#2d3748",
                                transition: "background .3s",
                            }} />
                        )}
                    </div>
                ))}
            </div>

            {/* Card */}
            <div style={{
                background: "#161b22", border: "1px solid #21282f",
                borderRadius: 6, padding: 24, maxWidth: 480,
            }}>

                {/* ── STEP: EMAIL ── */}
                {step === "email" && (
                    <div>
                        {/* First & Last Name */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={fieldLabel}>First Name</div>
                                <input
                                    style={inputStyle}
                                    type="text"
                                    placeholder="John"
                                    value={firstName}
                                    onChange={e => { setFirstName(e.target.value); setMsg(null); }}
                                />
                            </div>
                            <div>
                                <div style={fieldLabel}>Last Name</div>
                                <input
                                    style={inputStyle}
                                    type="text"
                                    placeholder="Doe"
                                    value={lastName}
                                    onChange={e => { setLastName(e.target.value); setMsg(null); }}
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={fieldLabel}>Email Address</div>
                            <input
                                style={inputStyle}
                                type="email"
                                placeholder="user@example.com"
                                value={email}
                                onChange={e => { setEmail(e.target.value); setMsg(null); }}
                                onKeyDown={e => e.key === "Enter" && handleSend()}
                            />
                        </div>

                        <button
                            style={btnStyle("#1f6feb", !email || !firstName || !lastName)}
                            onClick={handleSend}
                            disabled={loading || !email || !firstName || !lastName}
                        >
                            {loading ? "Sending…" : "Send OTP →"}
                        </button>
                    </div>
                )}

                {/* ── STEP: OTP ── */}
                {step === "otp" && (
                    <div>
                        <div style={{ fontSize: 12, color: "#7d8590", marginBottom: 16 }}>
                            OTP sent to <span style={{ color: "#e6edf3", fontWeight: 500 }}>{email}</span>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={fieldLabel}>Enter OTP</div>
                            <input
                                style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".25em", textAlign: "center" }}
                                type="text" placeholder="● ● ● ● ● ●"
                                maxLength={6} value={otp}
                                onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setMsg(null); }}
                                onKeyDown={e => e.key === "Enter" && handleVerify()}
                            />
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                style={btnStyle("#2ea043", otp.length < 6)}
                                onClick={handleVerify}
                                disabled={loading || otp.length < 6}
                            >
                                {loading ? "Verifying…" : "Verify OTP →"}
                            </button>
                            <button
                                style={btnStyle("#21282f")}
                                onClick={() => { setStep("email"); setOtp(""); setMsg(null); }}
                            >
                                ← Back
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP: SET PASSWORD ── */}
                {step === "password" && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={fieldLabel}>New Password</div>
                            <input
                                style={inputStyle} type="password"
                                placeholder="Min. 6 characters"
                                value={password}
                                onChange={e => { setPassword(e.target.value); setMsg(null); }}
                            />
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <div style={fieldLabel}>Confirm Password</div>
                            <input
                                style={{
                                    ...inputStyle,
                                    borderColor: confirmPass && confirmPass !== password ? "#da3633" : "#2d3748",
                                }}
                                type="password"
                                placeholder="Re-enter password"
                                value={confirmPass}
                                onChange={e => { setConfirmPass(e.target.value); setMsg(null); }}
                                onKeyDown={e => e.key === "Enter" && handleSetPassword()}
                            />
                            {confirmPass && confirmPass !== password && (
                                <div style={{ fontSize: 11, color: "#da3633", marginTop: 4 }}>Passwords do not match</div>
                            )}
                        </div>
                        <button
                            style={btnStyle("#1f6feb", password.length < 6 || password !== confirmPass)}
                            onClick={handleSetPassword}
                            disabled={loading || password.length < 6 || password !== confirmPass}
                        >
                            {loading ? "Setting password…" : "Set Password & Login →"}
                        </button>
                    </div>
                )}

                {/* ── STEP: DONE ── */}
                {step === "done" && (
                    <div style={{ textAlign: "center", padding: "10px 0" }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>All done!</div>
                        <div style={{ fontSize: 12, color: "#7d8590", marginBottom: 16 }}>
                            <span style={{ color: "#e6edf3" }}>{email}</span> is registered and logged in.
                        </div>
                        {token && (
                            <div style={{
                                background: "#0d1117", border: "1px solid #2d3748",
                                borderRadius: 6, padding: 12, marginBottom: 16,
                                textAlign: "left",
                            }}>
                                <div style={{ fontSize: 10, color: "#7d8590", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".07em" }}>Auth Token</div>
                                <div style={{
                                    fontFamily: "var(--font-mono)", fontSize: 11,
                                    color: "#2ea043", wordBreak: "break-all",
                                }}>{token}</div>
                            </div>
                        )}
                        <button style={btnStyle("#21282f")} onClick={handleReset}>
                            Start over
                        </button>
                    </div>
                )}

                {/* Message */}
                {msg && step !== "done" && (
                    <div style={{
                        marginTop: 14, fontSize: 12,
                        color: msg.ok ? "#2ea043" : "#da3633",
                        padding: "8px 10px",
                        background: msg.ok ? "rgba(46,160,67,.1)" : "rgba(218,54,51,.1)",
                        borderRadius: 4, border: `1px solid ${msg.ok ? "#2ea043" : "#da3633"}`,
                    }}>
                        {msg.text}
                    </div>
                )}
            </div>
        </div>
    );
}