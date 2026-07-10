"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AuthMode = "login" | "register";
type RegisterStep = "info" | "otp" | "password";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [registerStep, setRegisterStep] = useState<RegisterStep>("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [regEmail, setRegEmail] = useState("");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regOtp, setRegOtp] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");

  // ===== LOGIN HANDLER =====
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!loginEmail || !loginPassword) {
        throw new Error("Email and password required");
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      setSuccess("✅ Login successful! Redirecting...");
      setTimeout(() => router.push("/admin"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // ===== REGISTER STEP 1: SEND OTP =====
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!regEmail || !regFirstName || !regLastName) {
        throw new Error("Email and full name required");
      }

      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regEmail,
          firstName: regFirstName,
          lastName: regLastName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send OTP");
      }

      setSuccess("✅ OTP sent to your email");
      setTimeout(() => setRegisterStep("otp"), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  // ===== REGISTER STEP 2: VERIFY OTP =====
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!regOtp) {
        throw new Error("OTP required");
      }

      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail, otp: regOtp }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "OTP verification failed");
      }

      setSuccess("✅ Email verified! Now set your password");
      setTimeout(() => setRegisterStep("password"), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  // ===== REGISTER STEP 3: SET PASSWORD =====
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!regPassword || !regConfirmPassword) {
        throw new Error("Password required");
      }

      if (regPassword !== regConfirmPassword) {
        throw new Error("Passwords do not match");
      }

      if (regPassword.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }

      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail, password: regPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to set password");
      }

      setSuccess("✅ Registration complete! Logging you in...");
      
      // Auto-login after registration
      setTimeout(async () => {
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: regEmail, password: regPassword }),
        });

        if (loginRes.ok) {
          router.push("/admin");
        } else {
          setMode("login");
          setLoginEmail(regEmail);
          setLoginPassword(regPassword);
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setLoading(false);
    }
  };

  // ===== RESET FORM =====
  const resetForms = () => {
    setLoginEmail("");
    setLoginPassword("");
    setRegEmail("");
    setRegFirstName("");
    setRegLastName("");
    setRegOtp("");
    setRegPassword("");
    setRegConfirmPassword("");
    setRegisterStep("info");
    setError("");
    setSuccess("");
  };

  const switchMode = (newMode: AuthMode) => {
    resetForms();
    setMode(newMode);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">SportsFan Admin</h1>
          <p className="text-gray-400">Manage your platform with ease</p>
        </div>

        {/* Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 shadow-lg">
          {/* Tabs */}
          <div className="flex gap-4 mb-6 border-b border-gray-700">
            <button
              onClick={() => switchMode("login")}
              className={`pb-3 px-2 text-sm font-medium transition-colors ${
                mode === "login"
                  ? "border-b-2 border-blue-500 text-blue-400"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => switchMode("register")}
              className={`pb-3 px-2 text-sm font-medium transition-colors ${
                mode === "register"
                  ? "border-b-2 border-blue-500 text-blue-400"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              Register
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-green-900/20 border border-green-700 rounded text-green-300 text-sm">
              {success}
            </div>
          )}

          {/* ===== LOGIN FORM ===== */}
          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded transition-colors"
              >
                {loading ? "Logging in..." : "Login"}
              </button>

              <p className="text-center text-sm text-gray-400 mt-4">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="text-blue-400 hover:text-blue-300 font-medium"
                >
                  Register here
                </button>
              </p>
            </form>
          )}

          {/* ===== REGISTER FORM ===== */}
          {mode === "register" && (
            <form onSubmit={registerStep === "info" ? handleSendOtp : registerStep === "otp" ? handleVerifyOtp : handleSetPassword} className="space-y-4">
              {/* Step 1: Email & Name */}
              {registerStep === "info" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="your@email.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="John"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="Doe"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded transition-colors"
                  >
                    {loading ? "Sending OTP..." : "Send OTP"}
                  </button>
                </>
              )}

              {/* Step 2: OTP Verification */}
              {registerStep === "otp" && (
                <>
                  <p className="text-sm text-gray-400 mb-4">
                    We sent an OTP to <strong>{regEmail}</strong>
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Enter OTP
                    </label>
                    <input
                      type="text"
                      value={regOtp}
                      onChange={(e) => setRegOtp(e.target.value)}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 text-center tracking-widest text-lg"
                      placeholder="000000"
                      maxLength={6}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded transition-colors"
                  >
                    {loading ? "Verifying..." : "Verify OTP"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegisterStep("info")}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded transition-colors"
                  >
                    Back
                  </button>
                </>
              )}

              {/* Step 3: Set Password */}
              {registerStep === "password" && (
                <>
                  <p className="text-sm text-gray-400 mb-4">
                    Now set your password for <strong>{regEmail}</strong>
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded transition-colors"
                  >
                    {loading ? "Creating Account..." : "Complete Registration"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRegisterStep("info");
                      setRegOtp("");
                    }}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded transition-colors"
                  >
                    Back
                  </button>
                </>
              )}
            </form>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-gray-500 mt-6">
            Protected by JWT authentication
          </p>
        </div>
      </div>
    </div>
  );
}
