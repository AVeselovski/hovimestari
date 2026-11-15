import { Resend } from "resend";
import { env } from "./env.js";

/** One mail. */
export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Where mail goes. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Sends through Resend. The client is made on the first send, so a server that never mails never builds one. */
export function resendMailer(apiKey: string, from: string): Mailer {
  let client: Resend | undefined;
  return {
    async send({ to, subject, html, text }) {
      client ??= new Resend(apiKey);
      const { error } = await client.emails.send({ from, to, subject, html, text });
      // The Resend SDK resolves normally on API errors instead of throwing.
      if (error) throw new Error(`Resend error: ${error.message}`);
    },
  };
}

/**
 * Writes the mail to the console instead of sending it. Development and test
 * only: the env schema requires RESEND_API_KEY in production.
 */
export function consoleMailer(log: (line: string) => void = (line) => console.log(line)): Mailer {
  return {
    async send({ to, subject, text }) {
      log(`[mail] to ${to}: ${subject}\n${text}`);
    },
  };
}

let mailer: Mailer | undefined;

/** The mailer this process uses: Resend when RESEND_API_KEY is set, otherwise the console. */
export function currentMailer(): Mailer {
  mailer ??= env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY, env.EMAIL_FROM!) : consoleMailer();
  return mailer;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  via: Mailer = currentMailer(),
): Promise<void> {
  const link = escapeHtml(resetLink);
  await via.send({
    to,
    subject: "Reset your Hovimestari password",
    html: `<p>Someone asked to reset the password of your Hovimestari account. Open the link below to choose a new one. It works once, for one hour.</p>
<p><a href="${link}">${link}</a></p>
<p>If it was not you, ignore this email. Your password stays as it is.</p>`,
    text: `Someone asked to reset the password of your Hovimestari account. Open the link below to choose a new one. It works once, for one hour.

${resetLink}

If it was not you, ignore this email. Your password stays as it is.`,
  });
}
