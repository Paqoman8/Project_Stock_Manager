/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockClientFindMany = jest.fn() as jest.Mock<any>;
const mockClientFindUnique = jest.fn() as jest.Mock<any>;
const mockClientCreate = jest.fn() as jest.Mock<any>;
const mockClientUpdate = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    client: {
      findMany: mockClientFindMany,
      findUnique: mockClientFindUnique,
      create: mockClientCreate,
      update: mockClientUpdate,
    },
  },
}));

import { resolveClient, searchClients } from '../services/client.service';

const STORE_ID = 'store-uuid-001';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveClient', () => {
  it('creates a new client instead of reusing a client from another store', async () => {
    mockClientFindMany.mockResolvedValue([]);
    mockClientCreate.mockResolvedValue({
      id: 'client-local',
      store_id: STORE_ID,
      name: 'Alice',
      phone: '+22997000000',
      email: 'alice@example.com',
    });

    const result = await resolveClient(
      { name: 'Alice', phone: '97 00 00 00', email: 'alice@example.com' },
      undefined,
      STORE_ID,
    );

    expect(result).toMatchObject({
      id: 'client-local',
      store_id: STORE_ID,
    });
    expect(mockClientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ store_id: STORE_ID }),
      }),
    );
    expect(mockClientCreate).toHaveBeenCalledTimes(1);
    expect(mockClientUpdate).not.toHaveBeenCalled();
  });

  it('throws CLIENT_DUPLICATE_CONFLICT when two clients match on email and phone separately', async () => {
    mockClientFindMany.mockResolvedValue([
      { id: 'c1', store_id: STORE_ID, name: 'Alice', phone: '+22997000000', email: 'alice@example.com', normalized_email: 'alice@example.com', normalized_phone: '22997000000' },
      { id: 'c2', store_id: STORE_ID, name: 'Alice Dupont', phone: '+22997111111', email: 'alice@example.com', normalized_email: 'alice@example.com', normalized_phone: '22997111111' },
    ]);

    await expect(resolveClient(
      { name: 'Alice', email: 'alice@example.com' },
      undefined,
      STORE_ID,
    )).rejects.toThrow('CLIENT_DUPLICATE_CONFLICT');
  });

  it('throws CLIENT_NAME_REQUIRED when name is empty and no id provided', async () => {
    await expect(resolveClient(
      { phone: '97000000', email: 'test@test.com' },
      undefined,
      STORE_ID,
    )).rejects.toThrow('CLIENT_NAME_REQUIRED');
  });

  it('throws CLIENT_CONTACT_REQUIRED when name provided but no phone or email', async () => {
    await expect(resolveClient(
      { name: 'Alice' },
      undefined,
      STORE_ID,
    )).rejects.toThrow('CLIENT_CONTACT_REQUIRED');
  });

  it('does not update client silently — returns existing client as-is when found', async () => {
    mockClientFindMany.mockResolvedValue([
      { id: 'c1', store_id: STORE_ID, name: 'Alice', phone: '+22997000000', email: 'alice@example.com', normalized_email: 'alice@example.com', normalized_phone: '22997000000' },
    ]);

    const result = await resolveClient(
      { name: 'ALICE', phone: '97 00 00 00', email: 'ALICE@EXAMPLE.COM' },
      undefined,
      STORE_ID,
    );

    expect(result).toMatchObject({ id: 'c1', name: 'Alice' });
    expect(mockClientUpdate).not.toHaveBeenCalled();
  });

  it('throws CLIENT_NOT_FOUND when looked up by id with store mismatch', async () => {
    mockClientFindUnique.mockResolvedValue({
      id: 'c1',
      store_id: 'other-store',
      name: 'Alice',
      phone: '+22997000000',
      email: 'alice@example.com',
    });

    await expect(resolveClient(
      { id: 'c1' },
      undefined,
      STORE_ID,
    )).rejects.toThrow('CLIENT_NOT_FOUND');
  });

  it('returns null when input is undefined', async () => {
    expect(await resolveClient(undefined, undefined, STORE_ID)).toBeNull();
  });

  it('returns null when input has only empty fields', async () => {
    expect(await resolveClient({ name: '', phone: '', email: '' }, undefined, STORE_ID)).toBeNull();
  });
});

describe('searchClients', () => {
  it('scopes client search to the requesting store', async () => {
    mockClientFindMany.mockResolvedValue([]);

    await searchClients('alice', STORE_ID);

    expect(mockClientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          store_id: STORE_ID,
        }),
      }),
    );
  });

  it('returns empty array for queries shorter than 2 characters', async () => {
    const result = await searchClients('a', STORE_ID);
    expect(result).toEqual([]);
    expect(mockClientFindMany).not.toHaveBeenCalled();
  });
});
