// src/services/auth.service.ts
// Toutes les fonctions d'appel API liées à l'authentification.
// Centralise les appels apiClient pour que les composants TSX
// ne contiennent que la logique de présentation.

import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreOption {
  id: string;
  name: string;
  location: string | null;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  user?: Record<string, unknown>;
  requiresStoreSelection?: boolean;
  stores?: StoreOption[];
  requiresPasswordChange?: boolean;
  temporaryToken?: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  message?: string;
  resetToken?: string;
}

export interface AdminResetResponse {
  success: boolean;
  message?: string;
  temporaryPassword?: string;
}

export interface GenericResponse {
  success: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function login(
  username: string,
  password: string,
  storeId?: string,
): Promise<LoginResponse> {
  const payload: { username: string; password: string; storeId?: string } = {
    username,
    password,
  };
  if (storeId) payload.storeId = storeId;

  const response = await apiClient.post<LoginResponse>('/api/auth/login', payload);
  return response.data;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  temporaryToken?: string,
): Promise<GenericResponse> {
  const config = temporaryToken
    ? { headers: { Authorization: `Bearer ${temporaryToken}` } }
    : undefined;

  const response = await apiClient.post<GenericResponse>(
    '/api/auth/change-password',
    { currentPassword, newPassword },
    config,
  );
  return response.data;
}

export async function forgotPassword(email: string): Promise<GenericResponse> {
  const response = await apiClient.post<GenericResponse>(
    '/api/auth/forgot-password',
    { email },
  );
  return response.data;
}

export async function verifyResetOtp(
  email: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  const response = await apiClient.post<VerifyOtpResponse>(
    '/api/auth/verify-reset-otp',
    { email, otp },
  );
  return response.data;
}

export async function resetPassword(
  newPassword: string,
  resetToken: string,
): Promise<GenericResponse> {
  const response = await apiClient.post<GenericResponse>(
    '/api/auth/reset-password',
    { newPassword },
    { headers: { Authorization: `Bearer ${resetToken}` } },
  );
  return response.data;
}

export async function adminResetPassword(
  userId: string,
): Promise<AdminResetResponse> {
  const response = await apiClient.post<AdminResetResponse>(
    '/api/auth/admin-reset-password',
    { userId },
  );
  return response.data;
}
