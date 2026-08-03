/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockStoreFindUnique = jest.fn() as jest.Mock<any>;
const mockStoreUpdate = jest.fn() as jest.Mock<any>;
const mockStoreDelete = jest.fn() as jest.Mock<any>;
const mockTransactionCount = jest.fn() as jest.Mock<any>;
const mockTransferCount = jest.fn() as jest.Mock<any>;
const mockInventoryCount = jest.fn() as jest.Mock<any>;
const mockInventoryDeleteMany = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    store: {
      findUnique: mockStoreFindUnique,
      update: mockStoreUpdate,
      delete: mockStoreDelete,
    },
    transaction: { count: mockTransactionCount },
    transfer: { count: mockTransferCount },
    inventory: { count: mockInventoryCount, deleteMany: mockInventoryDeleteMany },
  },
}));

jest.mock('../services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(void 0),
}));

import * as storeService from '../services/store.service';

const ORG_ID = '00000000-0000-0000-0000-000000000010';
const STORE_ID = 'store-uuid-001';
const ACTOR_ID = 'actor-uuid-001';
const ACTOR_NAME = 'Super Admin Test';
const IP = '127.0.0.1';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('closeStore', () => {
  it('throws STORE_PROTECTED when the store is protected', async () => {
    mockStoreFindUnique.mockResolvedValue({ id: STORE_ID, is_protected: true, name: 'Hub Central' });

    await expect(
      storeService.closeStore(ORG_ID, STORE_ID, ACTOR_ID, ACTOR_NAME, IP),
    ).rejects.toThrow('STORE_PROTECTED');

    expect(mockStoreUpdate).not.toHaveBeenCalled();
  });

  it('closes a non-protected store', async () => {
    mockStoreFindUnique.mockResolvedValue({ id: STORE_ID, is_protected: false, name: 'Boutique' });
    mockStoreUpdate.mockResolvedValue({ id: STORE_ID, status: 'CLOSED' });

    await storeService.closeStore(ORG_ID, STORE_ID, ACTOR_ID, ACTOR_NAME, IP);

    expect(mockStoreUpdate).toHaveBeenCalledWith({
      where: { id: STORE_ID, organization_id: ORG_ID },
      data: { status: 'CLOSED', closed_at: expect.any(Date) },
      select: expect.anything(),
    });
  });
});

describe('deleteStore', () => {
  it('throws STORE_PROTECTED for a protected store and does not delete', async () => {
    mockStoreFindUnique.mockResolvedValue({
      id: STORE_ID,
      name: 'Hub Central',
      is_protected: true,
    });

    await expect(
      storeService.deleteStore(ORG_ID, STORE_ID, ACTOR_ID, ACTOR_NAME, IP),
    ).rejects.toThrow('STORE_PROTECTED');

    expect(mockStoreDelete).not.toHaveBeenCalled();
    expect(mockTransactionCount).not.toHaveBeenCalled();
  });

  it('throws STORE_HAS_DEPENDENCIES when transactions exist', async () => {
    mockStoreFindUnique.mockResolvedValue({
      id: STORE_ID,
      name: 'Boutique',
      is_protected: false,
    });
    mockTransactionCount.mockResolvedValue(1);
    mockTransferCount.mockResolvedValue(0);
    mockInventoryCount.mockResolvedValue(0);

    await expect(
      storeService.deleteStore(ORG_ID, STORE_ID, ACTOR_ID, ACTOR_NAME, IP),
    ).rejects.toThrow('STORE_HAS_DEPENDENCIES');

    expect(mockStoreDelete).not.toHaveBeenCalled();
  });

  it('deletes a non-protected, dependency-free store', async () => {
    mockStoreFindUnique.mockResolvedValue({
      id: STORE_ID,
      name: 'Boutique',
      is_protected: false,
    });
    mockTransactionCount.mockResolvedValue(0);
    mockTransferCount.mockResolvedValue(0);
    mockInventoryCount.mockResolvedValue(0);
    mockStoreDelete.mockResolvedValue({ id: STORE_ID });

    await storeService.deleteStore(ORG_ID, STORE_ID, ACTOR_ID, ACTOR_NAME, IP);

    expect(mockInventoryDeleteMany).toHaveBeenCalledWith({
      where: { store_id: STORE_ID, organization_id: ORG_ID },
    });
    expect(mockStoreDelete).toHaveBeenCalledWith({
      where: { id: STORE_ID, organization_id: ORG_ID },
    });
  });
});
