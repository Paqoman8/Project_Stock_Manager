'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { APP_NAME } from '@/lib/config/app';
import { Input } from '@/components/ui/Input';
import { getPasswordStrength } from '@/lib/password';
import { extractApiErrorMessage } from '@/lib/errors';
import {
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from '@/services/auth.service';
import {
  forgotPasswordEmailSchema,
  type ForgotPasswordEmailValues,
  verifyOtpSchema,
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from '@/validators/auth.validators';

type Step = 'email' | 'otp' | 'new-password' | 'success';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // -- Step 1: Email form --
  const emailForm = useForm<ForgotPasswordEmailValues>({
    resolver: zodResolver(forgotPasswordEmailSchema),
  });

  // -- Step 3: New password form --
  const pwdForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const newPassword = pwdForm.watch('newPassword') ?? '';
  const strength = getPasswordStrength(newPassword);

  useEffect(() => {
    if (step === 'otp') otpRefs.current[0]?.focus();
  }, [step]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const setMsg = useCallback((msg: string) => {
    setServerError(msg);
    setSuccessMessage(null);
  }, []);

  const setOk = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setServerError(null);
  }, []);

  // -- Step 1: submit email --
  async function submitEmail(data: ForgotPasswordEmailValues) {
    setServerError(null);
    try {
      await forgotPassword(data.email);
      setEmail(data.email);
      setOk(
        'Si cette adresse est associée à un compte, vous allez recevoir un code à 6 chiffres par email. Vérifiez votre boîte de réception (et les spams).'
      );
      setStep('otp');
    } catch {
      setMsg('Impossible de joindre le serveur. Veuillez réessayer.');
    }
  }

  // -- Step 2: OTP handlers --
  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...otp];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? '';
    setOtp(next);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const code = otp.join('');
    const result = verifyOtpSchema.safeParse({ otp: code });
    if (!result.success) {
      setErrorMessage(result.error.issues[0]?.message ?? 'Code invalide.');
      return;
    }

    try {
      const response = await verifyResetOtp(email, code);
      if (!response.resetToken) {
        setMsg('Session de réinitialisation expirée. Veuillez recommencer.');
        return;
      }
      sessionStorage.setItem('resetToken', response.resetToken);
      setStep('new-password');
    } catch (error: unknown) {
      setErrorMessage(extractApiErrorMessage(error, 'Code de vérification invalide.'));
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setServerError(null);
    setSuccessMessage(null);

    try {
      await forgotPassword(email);
      setOk('Un nouveau code a été envoyé. Vérifiez votre boîte de réception (et les spams).');
      setResendCooldown(30);
    } catch {
      setMsg('Impossible de renvoyer le code. Veuillez réessayer.');
    }
  }

  // -- Step 3: submit new password --
  async function submitNewPassword(data: ResetPasswordFormValues) {
    setServerError(null);

    const resetToken = sessionStorage.getItem('resetToken');
    if (!resetToken) {
      setMsg('Session de réinitialisation expirée. Veuillez recommencer.');
      return;
    }

    try {
      await resetPassword(data.newPassword, resetToken);
      sessionStorage.removeItem('resetToken');
      setStep('success');
    } catch (error: unknown) {
      setMsg(extractApiErrorMessage(error, 'Une erreur est survenue. Veuillez réessayer.'));
    }
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-textPrimary tracking-tight">
            {APP_NAME}
          </h1>
          <p className="text-sm text-textMuted mt-1">
            Gestion Commerciale Centralisée
          </p>
        </div>

        {/* SUCCESS SCREEN */}
        {step === 'success' && (
          <div className="bg-surface border border-borderLight rounded p-6 shadow-sm text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-textPrimary mb-2">
              Mot de passe réinitialisé
            </h2>
            <p className="text-sm text-textMuted mb-5">
              Votre mot de passe a été changé avec succès. Vous pouvez maintenant vous
              connecter avec votre nouveau mot de passe.
            </p>
            <Link
              href="/login"
              className="inline-block w-full py-2 px-4 bg-primary text-white text-sm font-medium rounded hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-opacity text-center"
            >
              Retour à la connexion
            </Link>
          </div>
        )}

        {/* STEP 1: EMAIL */}
        {step === 'email' && (
          <div className="bg-surface border border-borderLight rounded p-6 shadow-sm">
            <h2 className="text-base font-medium text-textPrimary mb-1">
              Mot de passe oublié
            </h2>
            <p className="text-sm text-textMuted mb-5">
              Saisissez l&apos;adresse email associée à votre compte. Vous recevrez un code
              de vérification par email.
            </p>

            <form onSubmit={emailForm.handleSubmit(submitEmail)} noValidate>
              <div className="mb-4">
                <label
                  htmlFor="fp-email"
                  className="block text-sm font-medium text-textSecondary mb-1"
                >
                  Adresse email
                </label>
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  className={`w-full px-3 py-2 text-sm bg-background border rounded text-textPrimary placeholder-textMuted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors ${emailForm.formState.errors.email ? 'border-danger' : 'border-borderLight'}`}
                  {...emailForm.register('email')}
                />
                {emailForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-danger" role="alert">
                    {emailForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              {serverError && (
                <div className="mb-4 px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm" role="alert">
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={emailForm.formState.isSubmitting}
                className="w-full py-2 px-4 bg-primary text-white text-sm font-medium rounded hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {emailForm.formState.isSubmitting ? 'Envoi en cours...' : 'Envoyer le code'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <Link
                href="/login"
                className="text-sm text-textMuted hover:text-textMain transition-colors"
              >
                Retour à la connexion
              </Link>
            </div>
          </div>
        )}

        {/* STEP 2: OTP */}
        {step === 'otp' && (
          <div className="bg-surface border border-borderLight rounded p-6 shadow-sm">
            <h2 className="text-base font-medium text-textPrimary mb-1">
              Vérification
            </h2>
            <p className="text-sm text-textMuted mb-5">
              Saisissez le code à 6 chiffres envoyé à{' '}
              <span className="font-medium text-textPrimary">{email}</span>.
            </p>

            <form onSubmit={submitOtp} noValidate>
              <div className="flex justify-center gap-2 mb-4" onPaste={handleOtpPaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { otpRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-12 h-14 text-center text-lg font-semibold bg-background border border-borderLight rounded text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                    aria-label={`Chiffre ${idx + 1}`}
                  />
                ))}
              </div>

              {successMessage && (
                <div className="mb-4 px-3 py-2 bg-success bg-opacity-10 border border-success border-opacity-30 rounded text-success text-sm" role="status">
                  {successMessage}
                </div>
              )}

              {errorMessage && (
                <div className="mb-4 px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm" role="alert">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 px-4 bg-primary text-white text-sm font-medium rounded hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                Vérifier
              </button>
            </form>

            <div className="mt-4 space-y-2 text-center">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0}
                className="text-sm text-primary hover:underline disabled:text-textMuted disabled:no-underline"
              >
                {resendCooldown > 0
                  ? `Renvoyer le code (${resendCooldown}s)`
                  : 'Renvoyer le code'}
              </button>

              <p className="text-xs text-textMuted">
                Vous n&apos;avez pas reçu le code&nbsp;? Vérifiez vos spams ou contactez
                votre administrateur pour qu&apos;il réinitialise votre mot de passe
                manuellement.
              </p>
            </div>

            <div className="mt-4 text-center border-t border-borderLight pt-4">
              <Link
                href="/login"
                className="text-sm text-textMuted hover:text-textMain transition-colors"
              >
                Retour à la connexion
              </Link>
            </div>
          </div>
        )}

        {/* STEP 3: NEW PASSWORD */}
        {step === 'new-password' && (
          <div className="bg-surface border border-borderLight rounded p-6 shadow-sm">
            <h2 className="text-base font-medium text-textPrimary mb-1">
              Nouveau mot de passe
            </h2>
            <p className="text-sm text-textMuted mb-5">
              Choisissez un mot de passe sécurisé pour votre compte.
            </p>

            <form onSubmit={pwdForm.handleSubmit(submitNewPassword)} noValidate className="space-y-4">
              <div>
                <Input
                  id="fp-new"
                  type="password"
                  label="Nouveau mot de passe"
                  autoComplete="new-password"
                  placeholder="8 caractères minimum"
                  error={pwdForm.formState.errors.newPassword?.message}
                  showPasswordToggle
                  {...pwdForm.register('newPassword')}
                />
                {newPassword.length > 0 && !pwdForm.formState.errors.newPassword && (
                  <div className="mt-1.5">
                    <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                        style={{ width: strength.width }}
                      />
                    </div>
                    <p className="text-xs text-textMuted mt-0.5">
                      Force : {strength.label}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Input
                  id="fp-confirm"
                  type="password"
                  label="Confirmer le mot de passe"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  error={pwdForm.formState.errors.confirmPassword?.message}
                  showPasswordToggle
                  {...pwdForm.register('confirmPassword')}
                />
              </div>

              {serverError && (
                <div className="px-3 py-2 bg-danger bg-opacity-10 border border-danger border-opacity-30 rounded text-danger text-sm" role="alert">
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={pwdForm.formState.isSubmitting}
                className="w-full py-2 px-4 bg-primary text-white text-sm font-medium rounded hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {pwdForm.formState.isSubmitting ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <Link
                href="/login"
                className="text-sm text-textMuted hover:text-textMain transition-colors"
              >
                Retour à la connexion
              </Link>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-textMuted mt-6">
          {APP_NAME} — Plateforme interne. Accès restreint.
        </p>
      </div>
    </main>
  );
}
