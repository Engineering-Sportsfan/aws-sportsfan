import nodemailer from "nodemailer";

export function getTransporter() {
  const emailUser = (process.env.EMAIL || process.env.SMTP_USER || "").trim().replace(/^["']|["']$/g, "");
  const emailPass = (process.env.EMAIL_PASS || process.env.SMTP_PASS || "").trim().replace(/^["']|["']$/g, "");
  const smtpHost = (process.env.SMTP_HOST || process.env.MAIL_HOST || "").trim().replace(/^["']|["']$/g, "");
  const smtpPort = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || "465", 10);

  if (smtpHost) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
}

// Proxy transporter object to always dynamically fetch latest env vars at send-time
export const transporter = {
  sendMail: (options: nodemailer.SendMailOptions) => getTransporter().sendMail(options),
  verify: () => getTransporter().verify(),
};