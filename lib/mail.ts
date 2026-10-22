import { Resend } from "resend";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export class MailError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("sendMail failed");
    this.name = "MailError";
    this.code = code;
  }
}

export async function sendMail(mail: MailMessage): Promise<void> {
  if (!mail.to.trim() || !mail.subject.trim() || !mail.text.trim()) {
    throw new Error("sendMail is not configured");
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.MAIL_FROM?.trim();
  if (!apiKey || !fromAddress) {
    throw new Error("sendMail is not configured");
  }

  // Appointment mail will name the clinic. Account mail, including a new password, uses DentAssist.
  const from = fromAddress.includes("<") ? fromAddress : `DentAssist <${fromAddress}>`;
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
  if (error) {
    throw new MailError(error.name);
  }
}
