export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(mail: MailMessage): Promise<void> {
  if (!mail.to.trim() || !mail.subject.trim() || !mail.text.trim()) {
    throw new Error("sendMail is not configured");
  }
  throw new Error("sendMail is not configured");
}
