import { Resend } from "resend";
import { env } from "./env.js";

const resend = new Resend(env.RESEND_API_KEY);

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendVaultInvitationEmail(
  to: string,
  vaultName: string,
  inviterName: string,
  acceptLink: string,
): Promise<void> {
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `You have been invited to "${vaultName}" on Finanssiappis`,
    html: `<p><strong>${escapeHtml(inviterName)}</strong> has invited you to join the vault <strong>${escapeHtml(vaultName)}</strong> on Finanssiappis.</p>
<p><a href="${escapeHtml(acceptLink)}">Accept invitation</a></p>
<p>This invitation expires in 7 days. If you did not expect this, you can safely ignore this email.</p>`,
  });
  // The Resend SDK resolves normally on API errors instead of throwing — surface
  // it ourselves so callers that rely on "email sent before persisting" hold.
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "Reset your password",
    html: `<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${resetLink}">${resetLink}</a></p>
<p>If you did not request a password reset, you can safely ignore this email.</p>`,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
