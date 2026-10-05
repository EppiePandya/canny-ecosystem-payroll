import nodemailer from "nodemailer";

export const SENDER_NAME = "Canny CMS";

export function getSenderEmail() {
  return process.env.GMAIL_USER || "cannycms@gmail.com";
}


export function createTransporter() {
  const rawPass = process.env.GMAIL_APP_PASSWORD;
  const pass = rawPass ? rawPass.replace(/\s+/g, "") : "";
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: getSenderEmail(),
      pass,
    },
  });

}
