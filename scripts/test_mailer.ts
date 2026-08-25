import nodemailer from "nodemailer";
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function diagnoseMailer() {
  console.log("======================================================================");
  console.log("🔍 DIAGNOSING EMAIL SMTP CONFIGURATION");
  console.log("======================================================================\n");

  const email = process.env.EMAIL?.trim().replace(/^["']|["']$/g, "");
  const emailPass = process.env.EMAIL_PASS?.trim().replace(/^["']|["']$/g, "");

  console.log("EMAIL      :", email ? `"${email}" (Length: ${email.length})` : "❌ EMPTY / UNDEFINED");
  console.log("EMAIL_PASS :", emailPass ? `[Length: ${emailPass.length} chars]` : "❌ EMPTY / UNDEFINED");
  
  // Check other possible SMTP variables
  const smtpHost = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const smtpPort = process.env.SMTP_PORT || process.env.MAIL_PORT;
  const smtpUser = process.env.SMTP_USER || process.env.MAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.MAIL_PASS;

  console.log("SMTP_HOST  :", smtpHost ? `"${smtpHost}"` : "Not set (Defaulting to Gmail service)");
  console.log("SMTP_PORT  :", smtpPort ? `"${smtpPort}"` : "Not set");
  console.log("SMTP_USER  :", smtpUser ? `"${smtpUser}"` : "Not set");
  console.log("SMTP_PASS  :", smtpPass ? `[Length: ${smtpPass.length}]` : "Not set\n");

  if (!emailPass || emailPass.length === 0) {
    console.log("⚠️ CAUSE IDENTIFIED: `EMAIL_PASS` is empty or only quotes in your .env.local file!");
    console.log("👉 In Nodemailer, `Missing credentials for PLAIN` occurs when `pass` is empty or undefined.\n");
    return;
  }

  // Test with sanitized credentials
  const testTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: emailPass,
    },
  });

  try {
    console.log("Testing SMTP connection with sanitized credentials...");
    await testTransporter.verify();
    console.log("✅ SUCCESS: SMTP Credentials accepted by Gmail!\n");
  } catch (err: any) {
    console.error("❌ SMTP Verification Error:", err.message);
    if (err.message.includes("Username and Password not accepted") || err.message.includes("535")) {
      console.log("\n💡 SOLUTION FOR GMAIL:");
      console.log("1. Go to your Google Account (myaccount.google.com) -> Security.");
      console.log("2. Enable 2-Step Verification.");
      console.log("3. Go to 'App Passwords' (search 'App passwords' in Google Account).");
      console.log("4. Generate a 16-character App Password (e.g., 'abcd efgh ijkl mnop').");
      console.log("5. Put that in .env.local as: EMAIL_PASS=abcdefghijklmnop (without spaces or quotes).");
    }
  }
}

diagnoseMailer();
