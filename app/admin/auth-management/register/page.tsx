



"use client";

import { useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";

type Step = "register" | "otp" | "password";


export default function RegisterPage() {
  const [step, setStep] = useState<Step>("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendMsg, setResendMsg] = useState("");
  const [redirecting, setRedirecting] = useState(false);
   const router = useRouter();

  // ── Password validation ───────────────────────
  const has8 = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const passValid = has8 && hasUpper && hasSpecial;
  const passMatch = password === confirmPass && confirmPass.length > 0;

  // ── OTP helpers ───────────────────────────────
  const otp = otpDigits.join("");

  function handleOtpChange(val: string, i: number) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otpDigits];
    next[i] = val;
    setOtpDigits(next);
    if (val && i < 5) {
      document.getElementById(`otp-${i + 1}`)?.focus();
    }
  }

  function handleOtpKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === "Backspace" && !otpDigits[i] && i > 0) {
      document.getElementById(`otp-${i - 1}`)?.focus();
    }
  }

  // ── Step 1: Send OTP ─────────────────────────
  // async function handleContinue() {
  //   if (!firstName || !lastName || !email) return;
  //   setLoading(true); setError("");
  //   try {
  //     await axios.post('/api/auth/send-otp', { email, firstName, lastName });
  //     setStep("otp");
  //   } catch (err: unknown) {
  //     if (axios.isAxiosError(err)) {
  //       if (err.response?.status === 409) {
  //         setError("This email is already registered. Please log in instead.");
  //       } else if (err.response?.status === 400) {
  //         setError("Please fill in all required fields.");
  //       } else if (err.response?.data?.error) {
  //         setError(err.response.data.error);
  //       } else {
  //         setError("Failed to send OTP. Please check your connection and try again.");
  //       }
  //     } else {
  //       setError("Unable to connect to the server. Please try again later.");
  //     }
  //   } finally {
  //     setLoading(false);
  //   }
  // }




  async function handleContinue() {
    if (!firstName || !lastName || !email) return;
    setLoading(true); setError("");
    try {
      await axios.post('/api/auth/send-otp', { email, firstName, lastName });
      setStep("otp");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 409) {
          setRedirecting(true);
          setError("This email is already registered. Redirecting to login page...");
          setTimeout(() => {
           router.push("/auth/login");
          }, 3000);
        } else if (err.response?.status === 400) {
          setError("Please fill in all required fields.");
        } else if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else {
          setError("Failed to send OTP. Please check your connection and try again.");
        }
      } else {
        setError("Unable to connect to the server. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP ────────────────────────
  async function handleVerifyOtp() {
    if (otp.length < 6) return;
    setLoading(true); setError("");
    try {
      await axios.post('/api/auth/verify-otp', { email, otp });
      setStep("password");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 400) {
          setError("Invalid OTP. Please check the code and try again.");
        } else if (err.response?.status === 404) {
          setError("OTP expired or not found. Please request a new OTP.");
        } else if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else {
          setError("Verification failed. Please try again.");
        }
      } else {
        setError("Unable to verify OTP. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Resend OTP ────────────────────────────────
  async function handleResend() {
    setResendMsg(""); setError("");
    try {
      await axios.post('/api/auth/send-otp', { email, firstName, lastName });
      setOtpDigits(["", "", "", "", "", ""]);
      setResendMsg("New OTP sent successfully! Check your email.");
      document.getElementById("otp-0")?.focus();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 429) {
          setError("Too many attempts. Please wait a moment before requesting again.");
        } else if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else {
          setError("Failed to resend OTP. Please try again later.");
        }
      } else {
        setError("Unable to resend OTP. Please check your connection.");
      }
    }
  }

  // ── Step 3: Set Password ──────────────────────
  async function handleSetPassword() {
    if (!passValid || !passMatch) return;
    setLoading(true); setError("");
    try {
      await axios.post('/api/auth/set-password', { email, password });
     router.push("/auth/login");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 400) {
          setError("Please enter a valid password (8+ characters, with uppercase and special character).");
        } else if (err.response?.status === 404) {
          setError("User not found. Please register again.");
        } else if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else {
          setError("Failed to set password. Please try again.");
        }
      } else {
        setError("Unable to set password. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Shared input class ────────────────────────
  const inputCls = "w-full bg-black/40 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder:text-gray-500 border border-transparent focus:border-gray-600 transition";

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-6 relative bg-gradient-to-b from-[#3a0000] via-black to-[#120000]">

      {/* Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-900/30 via-transparent to-orange-600/20 pointer-events-none" />

      {/* Logo + Title */}
      <div className="flex flex-col items-center z-10">
        <img src="/images/Logo.png" alt="logo" className="lg:w-[56px] lg:h-[66.66px] mb-2" />
        <h1 className="text-white text-[20px] md:text-2xl font-semibold text-center">
          {step === "password" ? "Set your password" : "Let's create your account!"}
        </h1>
      </div>

      {/* ── STEP: REGISTER ── */}
      {step === "register" && (
        <div className="relative z-10 w-[300px] md:w-full max-w-sm px-5 py-4 rounded-3xl bg-[#222222] shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
          <div className="rounded-2xl p-1 space-y-3 mb-6">
            <input
              type="text" placeholder="First Name*"
              className={inputCls} value={firstName}
              onChange={e => setFirstName(e.target.value)}
            />
            <input
              type="text" placeholder="Last Name*"
              className={inputCls} value={lastName}
              onChange={e => setLastName(e.target.value)}
            />
            <input
              type="email" placeholder="Email Address"
              className={inputCls} value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleContinue()}
            />
          </div>

          {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}

          {/* <button
            onClick={handleContinue}
            disabled={loading || !firstName || !lastName || !email}
            className="w-full bg-gray-300 text-black py-3 rounded-full font-medium mb-6 hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending OTP…" : "Continue"}
          </button> */}
          <button
            onClick={handleContinue}
            disabled={loading || redirecting || !firstName || !lastName || !email}
            className="w-full bg-gray-300 text-black py-3 rounded-full font-medium mb-6 hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending OTP…" : redirecting ? "Redirecting..." : "Continue"}
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-[1px] bg-gray-700" />
            <span className="text-gray-500 text-xs tracking-widest">OR</span>
            <div className="flex-1 h-[1px] bg-gray-700" />
          </div>

          <button className="w-full border border-gray-400 text-white py-3 rounded-full font-medium flex items-center justify-center gap-2 mb-6 hover:bg-white hover:text-black transition">
            <span className="text-lg font-bold">G</span>
            Continue with Google
          </button>

          <p className="text-gray-300 text-sm text-center">
            Already a member?{" "}
            <Link href="/auth/login">
              <span className="font-semibold text-white cursor-pointer">Log in</span>
            </Link>
          </p>
        </div>
      )}

      {/* ── STEP: OTP (bottom sheet style) ── */}
      {step === "otp" && (
        <div className="relative z-10 w-[340px] md:w-full max-w-sm px-5">
          {/* OTP Sheet */}
          <div className="rounded-t-3xl rounded-b-3xl bg-[#1a1a1a] px-6 py-7 shadow-[0_-8px_40px_rgba(0,0,0,0.6)] mt-2">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-white text-lg font-semibold">Enter the OTP</h2>
              <button
                onClick={() => { setStep("register"); setOtpDigits(["", "", "", "", "", ""]); setError(""); }}
                className="text-gray-400 hover:text-white text-xl"
              >×</button>
            </div>

            <p className="text-gray-400 text-sm mb-6">
              Please enter the OTP sent to{" "}
              <span className="text-white font-medium">{email}</span>
            </p>

            {/* OTP boxes */}
            {/* <div className="flex gap-2 mb-6 justify-between">
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text" inputMode="numeric"
                  maxLength={1} value={d}
                  onChange={e => handleOtpChange(e.target.value, i)}
                  onKeyDown={e => handleOtpKeyDown(e, i)}
                  className="w-11 h-12 text-center text-white text-xl font-semibold bg-black/50 border border-gray-600 rounded-xl outline-none focus:border-gray-300 transition"
                />
              ))}
            </div> */}
            <div className="flex gap-2 md:gap-2 mb-6 justify-between">
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleOtpChange(e.target.value, i)}
                  onKeyDown={e => handleOtpKeyDown(e, i)}
                  className="w-10 h-10 sm:w-8 sm:h-12 md:w-12 md:h-12 -ml-2 md:-ml-2 text-center text-white text-lg sm:text-xl font-semibold bg-black/50 border border-gray-600 rounded-xl outline-none focus:border-gray-300 transition"
                />
              ))}
            </div>

            {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}
            {resendMsg && <p className="text-green-400 text-xs text-center mb-3">{resendMsg}</p>}

            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length < 6}
              className="w-full bg-gray-300 text-black py-3 rounded-full font-medium mb-3 hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Verifying…" : "Confirm"}
            </button>

            <button
              onClick={handleResend}
              className="w-full border border-gray-500 text-white py-3 rounded-full font-medium hover:bg-white/10 transition"
            >
              Resend OTP
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: SET PASSWORD ── */}
      {step === "password" && (
        <div className="relative z-10 w-[300px] md:w-full max-w-sm px-5 py-8 rounded-3xl bg-[#222222] shadow-[0_20px_60px_rgba(0,0,0,0.8)]">

          {/* Password field */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                placeholder="Password"
                className={inputCls + " pr-10"}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPass ? "🙈" : "👁"}
              </button>
            </div>

            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm Password"
                className={inputCls + " pr-10"}
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSetPassword()}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showConfirm ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Validation hints */}
          <div className="grid grid-cols-2 gap-1 mb-5">
            {[
              { ok: has8, label: "8+ characters" },
              { ok: hasUpper, label: "1 Uppercase" },
              { ok: hasSpecial, label: "1 special character" },
              { ok: passMatch, label: "Passwords match" },
            ].map(({ ok, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`text-xs font-bold ${ok ? "text-green-400" : "text-gray-600"}`}>
                  {ok ? "✓" : "○"}
                </span>
                <span className={`text-xs ${ok ? "text-green-400" : "text-gray-500"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}

          <button
            onClick={handleSetPassword}
            disabled={loading || !passValid || !passMatch}
            className="w-full bg-gray-300 text-black py-3 rounded-full font-medium mb-3 hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Setting up…" : "Confirm"}
          </button>

          <button
            onClick={() => { setStep("otp"); setError(""); }}
            className="w-full border border-gray-500 text-white py-3 rounded-full font-medium hover:bg-white/10 transition"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}