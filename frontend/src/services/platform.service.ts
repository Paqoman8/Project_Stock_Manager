// src/services/platform.service.ts
// Appels API liés à la gestion des organisations par le Platform Manager.
// Centralise les appels apiClient pour que les composants TSX ne
// contiennent que la logique de présentation.

import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  is_protected: boolean;
  logo_url: string | null;
  created_at: string;
  _count: {
    stores: number;
    user_store_accesses: number;
  };
}

export interface ListOrganizationsResponse {
  success: boolean;
  organizations: OrganizationRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  adminEmail: string;
}

export interface CreateOrganizationResponse {
  success: boolean;
  message?: string;
  organization: OrganizationRow;
  adminUsername: string;
  adminPassword: string;
}

export interface OrganizationActionResponse {
  success: boolean;
  message?: string;
  organization: OrganizationRow;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function listOrganizations(
  page: number,
  limit: number,
  status?: OrganizationStatus | '',
): Promise<ListOrganizationsResponse> {
  const params: { page: number; limit: number; status?: string } = { page, limit };
  if (status) params.status = status;

  const response = await apiClient.get<ListOrganizationsResponse>(
    '/api/platform/organizations',
    { params },
  );
  return response.data;
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<CreateOrganizationResponse> {
  const response = await apiClient.post<CreateOrganizationResponse>(
    '/api/platform/organizations',
    input,
  );
  return response.data;
}

export async function suspendOrganization(id: string): Promise<OrganizationActionResponse> {
  const response = await apiClient.patch<OrganizationActionResponse>(
    `/api/platform/organizations/${id}/suspend`,
  );
  return response.data;
}

export async function reactivateOrganization(id: string): Promise<OrganizationActionResponse> {
  const response = await apiClient.patch<OrganizationActionResponse>(
    `/api/platform/organizations/${id}/reactivate`,
  );
  return response.data;
}
