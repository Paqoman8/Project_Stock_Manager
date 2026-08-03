import nodemailer from 'nodemailer';
import { Resend } from 'resend';

const FROM_NAME  = 'Stock Manager';
const FROM_EMAIL = 'noreply@gstock.local';
const SUBJECT    = 'Stock Manager — Code de réinitialisation';

// ---------------------------------------------------------------------------
// Template — défini une seule fois
// ---------------------------------------------------------------------------

function buildText(otp: string): string {
  return [
    'Bonjour,',
    '',
    'Vous avez demandé la réinitialisation de votre mot de passe.',
    '',
    `Votre code de vérification : ${otp}`,
    '',
    'Ce code expire dans 10 minutes.',
    '',
    'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet email.',
    '',
    '— L\'équipe Stock Manager',
  ].join('\n');
}

function buildHtml(otp: string): string {
  return [
    '<p>Bonjour,</p>',
    '<p>Vous avez demandé la <strong>réinitialisation de votre mot de passe</strong>.</p>',
    `<p>Votre code de vérification : <strong style="font-size: 1.5em;">${otp}</strong></p>`,
    '<p>Ce code expire dans <strong>10 minutes</strong>.</p>',
    '<p><em>Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet email.</em></p>',
    '<p>— L\'équipe Stock Manager</p>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Transport — choisi selon EMAIL_PROVIDER
// ---------------------------------------------------------------------------

type SendFn = (to: string, otp: string) => Promise<void>;

let sendFn: SendFn | null = null;

function resolveTransport(): SendFn {
  const provider = (process.env.EMAIL_PROVIDER ?? 'mailpit').toLowerCase();

  switch (provider) {
    case 'resend': {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw new Error('RESEND_API_KEY non définie.');
      }
      const resend = new Resend(apiKey);
      return async (to, otp) => {
        await resend.emails.send({
          from:    `${FROM_NAME} <${FROM_EMAIL}>`,
          to,
          subject: SUBJECT,
          text:    buildText(otp),
          html:    buildHtml(otp),
        });
      };
    }

    case 'brevo': {
      const apiKey = process.env.BREVO_API_KEY;
      if (!apiKey) {
        throw new Error('BREVO_API_KEY non définie.');
      }
      return async (to, otp) => {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key':     apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender:      { name: FROM_NAME, email: FROM_EMAIL },
            to:          [{ email: to }],
            subject:     SUBJECT,
            textContent: buildText(otp),
            htmlContent: buildHtml(otp),
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(
            `Brevo API error ${response.status}: ${body.slice(0, 200)}`,
          );
        }
      };
    }

    default: {
      // mailpit — SMTP localhost:1025, pas d'auth en dev
      const transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST   ?? 'localhost',
        port:   Number(process.env.SMTP_PORT ?? 1025),
        secure: false,
        auth:   process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      return async (to, otp) => {
        await transporter.sendMail({
          from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
          to,
          subject: SUBJECT,
          text:    buildText(otp),
          html:    buildHtml(otp),
        });
      };
    }
  }
}

function getSendFn(): SendFn {
  if (!sendFn) {
    sendFn = resolveTransport();
  }
  return sendFn;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Envoie un email contenant un code OTP à usage unique.
 * Le transport est configuré via EMAIL_PROVIDER (resend | brevo | mailpit).
 */
export async function sendPasswordResetOtp(to: string, otp: string): Promise<void> {
  await getSendFn()(to, otp);
}
