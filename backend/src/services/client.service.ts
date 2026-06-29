import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export type ClientInput = {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
};

export type ClientRow = {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

function normalizeEmail(email?: string): string | null {
  const trimmed = email?.trim().toLowerCase() ?? '';
  return trimmed === '' ? null : trimmed;
}

function normalizePhone(phone?: string): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  return digits === '' ? null : digits;
}

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function hasClientPayload(input?: Partial<ClientInput> | null): boolean {
  if (!input) return false;
  return [input.id, input.name, input.phone, input.email].some((value) => {
    if (typeof value !== 'string') return false;
    return value.trim() !== '';
  });
}

export async function resolveClient(
  input: ClientInput | undefined,
  tx?: Prisma.TransactionClient,
  storeId?: string,
): Promise<ClientRow | null> {
  if (!input || !hasClientPayload(input)) return null;
  if (!storeId) throw new Error('CLIENT_STORE_REQUIRED');

  const client = tx ?? prisma;
  if (input.id) {
    const existing = await client.client.findUnique({
      where: { id: input.id },
      select: { id: true, store_id: true, name: true, phone: true, email: true },
    });
    if (!existing || existing.store_id !== storeId) throw new Error('CLIENT_NOT_FOUND');
    return existing;
  }

  const name = sanitizeName(input.name ?? '');
  if (name === '') throw new Error('CLIENT_NAME_REQUIRED');

  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhone = normalizePhone(input.phone);

  if (!normalizedEmail && !normalizedPhone) throw new Error('CLIENT_CONTACT_REQUIRED');

  const matches = await client.client.findMany({
    where: {
      store_id: storeId,
      OR: [
        ...(normalizedEmail ? [{ normalized_email: normalizedEmail }] : []),
        ...(normalizedPhone ? [{ normalized_phone: normalizedPhone }] : []),
      ],
    },
    select: { id: true, store_id: true, name: true, phone: true, email: true, normalized_email: true, normalized_phone: true },
    take: 2,
  });

  if (matches.length > 1) throw new Error('CLIENT_DUPLICATE_CONFLICT');

  if (matches.length === 1) {
    const match = matches[0];
    const shouldUpdate =
      match.name !== name ||
      (normalizedEmail && match.normalized_email !== normalizedEmail) ||
      (normalizedPhone && match.normalized_phone !== normalizedPhone);

    if (shouldUpdate) {
      return client.client.update({
        where: { id: match.id },
        data: {
          store_id: storeId,
          name,
          email: normalizedEmail ?? match.email,
          phone: normalizedPhone ?? match.phone,
          normalized_email: normalizedEmail ?? match.normalized_email,
          normalized_phone: normalizedPhone ?? match.normalized_phone,
        },
        select: { id: true, store_id: true, name: true, phone: true, email: true },
      });
    }

    return {
      id: match.id,
      store_id: match.store_id,
      name: match.name,
      phone: match.phone,
      email: match.email,
    };
  }

  return client.client.create({
    data: {
      store_id: storeId,
      name,
      email: normalizedEmail,
      phone: normalizedPhone,
      normalized_email: normalizedEmail,
      normalized_phone: normalizedPhone,
    },
    select: { id: true, store_id: true, name: true, phone: true, email: true },
  });
}

export async function searchClients(query: string, storeId: string): Promise<ClientRow[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const normalizedDigits = normalizePhone(trimmed);

  return prisma.client.findMany({
    where: {
      store_id: storeId,
      OR: [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { email: { contains: trimmed, mode: 'insensitive' } },
        ...(normalizedDigits ? [{ normalized_phone: { contains: normalizedDigits } }] : []),
      ],
    },
    orderBy: { updated_at: 'desc' },
    take: 8,
    select: { id: true, store_id: true, name: true, phone: true, email: true },
  });
}
