import nodemailer from "nodemailer";

const emailUser = (process.env.EMAIL || process.env.SMTP_USER || "").trim().replace(/^["']|["']$/g, "");
const emailPass = (process.env.EMAIL_PASS || process.env.SMTP_PASS || "").trim().replace(/^["']|["']$/g, "");
const smtpHost = (process.env.SMTP_HOST || process.env.MAIL_HOST || "").trim().replace(/^["']|["']$/g, "");
const smtpPort = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || "465", 10);

export const transporter = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    })
  : nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });