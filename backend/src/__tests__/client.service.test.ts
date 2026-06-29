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
});
