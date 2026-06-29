/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockStoreFindUnique = jest.fn() as jest.Mock<any>;
const mockProductFindMany = jest.fn() as jest.Mock<any>;
const mockPackagingFindUnique = jest.fn() as jest.Mock<any>;
const mockInventoryFindMany = jest.fn() as jest.Mock<any>;
const mockPrismaTransaction = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    store: { findUnique: mockStoreFindUnique },
    product: { findMany: mockProductFindMany },
    packagingFormat: { findUnique: mockPackagingFindUnique },
    inventory: { findMany: mockInventoryFindMany },
    $transaction: mockPrismaTransaction,
  },
}));

const mockCreateTransfer = jest.fn() as jest.Mock<any>;
const mockListTransfers = jest.fn() as jest.Mock<any>;
const mockListTransfersPaginated = jest.fn() as jest.Mock<any>;
const mockGetTransferById = jest.fn() as jest.Mock<any>;
const mockUpdateTransferStatus = jest.fn() as jest.Mock<any>;
const mockListDestinationStores = jest.fn() as jest.Mock<any>;

jest.mock('../repositories/transfer.repository', () => ({
  createTransfer: mockCreateTransfer,
  listTransfers: mockListTransfers,
  listTransfersPaginated: mockListTransfersPaginated,
  getTransferById: mockGetTransferById,
  updateTransferStatus: mockUpdateTransferStatus,
  listDestinationStoresForUserStore: mockListDestinationStores,
}));

jest.mock('../services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(void 0),
}));

import * as transferService from '../services/transfer.service';

const ACTOR_ID = 'actor-uuid-001';
const ACTOR_NAME = 'Manager Test';
const ACTOR_STORE_ID = 'store-uuid-001';
const OTHER_STORE_ID = 'store-uuid-999';

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreFindUnique.mockResolvedValue({ id: ACTOR_STORE_ID });
});

describe('createTransfer', () => {
  it('throws INSUFFICIENT_STOCK when duplicate lines exceed source stock in aggregate', async () => {
    mockStoreFindUnique.mockResolvedValue({ id: ACTOR_STORE_ID });
    mockProductFindMany.mockResolvedValue([{ id: 'prod-001' }]);
    mockInventoryFindMany.mockResolvedValue([{ product_id: 'prod-001', stock_physical: 5 }]);

    await expect(
      transferService.createTransfer(
        {
          from_store_id: ACTOR_STORE_ID,
          to_store_id: OTHER_STORE_ID,
          items: [
            { product_id: 'prod-001', qty: 3 },
            { product_id: 'prod-001', qty: 3 },
          ],
        },
        ACTOR_ID,
        ACTOR_NAME,
        ACTOR_STORE_ID,
      ),
    ).rejects.toThrow('INSUFFICIENT_STOCK');

    expect(mockCreateTransfer).not.toHaveBeenCalled();
  });
});

describe('transfer store scoping', () => {
  it('throws FORBIDDEN_TRANSFER_ACCESS when a manager reads a transfer outside their store scope', async () => {
    mockGetTransferById.mockResolvedValue({
      id: 'transfer-001',
      from_store_id: 'store-a',
      to_store_id: 'store-b',
      status: 'PENDING',
      items: [],
    });

    await expect(
      transferService.getTransferById('transfer-001', ACTOR_STORE_ID, true),
    ).rejects.toThrow('FORBIDDEN_TRANSFER_ACCESS');
  });

  it('throws FORBIDDEN_TRANSFER_ACCESS when a manager confirms a transfer outside their store scope', async () => {
    const transferRow = {
      id: 'transfer-001',
      from_store_id: 'store-a',
      to_store_id: 'store-b',
      status: 'PENDING',
      items: [],
    };

    mockPrismaTransaction.mockImplementation(async (callback: any) => callback({
      transfer: {
        findUnique: jest.fn().mockResolvedValue(transferRow),
        update: jest.fn().mockResolvedValue({}),
      },
      inventory: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
    }));

    await expect(
      transferService.confirmTransfer('transfer-001', ACTOR_ID, ACTOR_NAME, ACTOR_STORE_ID, undefined, undefined, ACTOR_STORE_ID, true),
    ).rejects.toThrow('FORBIDDEN_TRANSFER_ACCESS');
  });
});

describe('listTransfers', () => {
  it('returns paginated transfers with default page and limit', async () => {
    mockListTransfersPaginated.mockResolvedValue({
      transfers: [{ id: 'transfer-001' }],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    const result = await transferService.listTransfers({
      page: 1,
      limit: 10,
    });

    expect(result.transfers).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(mockListTransfersPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('forwards search and status filters to the repository', async () => {
    mockListTransfersPaginated.mockResolvedValue({
      transfers: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });

    await transferService.listTransfers({
      search: 'produit a',
      status: 'PENDING',
      page: 2,
      limit: 5,
    });

    expect(mockListTransfersPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'produit a',
        status: 'PENDING',
        page: 2,
        limit: 5,
      }),
    );
  });

  it('scopes results to the requester store for Manager Magasin', async () => {
    mockListTransfersPaginated.mockResolvedValue({
      transfers: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });

    await transferService.listTransfers({
      requesterStoreId: ACTOR_STORE_ID,
      forceRequesterScope: true,
      page: 1,
      limit: 10,
    });

    expect(mockListTransfersPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ store_id: ACTOR_STORE_ID }),
    );
  });

  it('does not scope results for roles other than Manager Magasin', async () => {
    mockListTransfersPaginated.mockResolvedValue({
      transfers: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });

    await transferService.listTransfers({
      requesterStoreId: ACTOR_STORE_ID,
      forceRequesterScope: false,
      page: 1,
      limit: 10,
    });

    expect(mockListTransfersPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ store_id: undefined }),
    );
  });

  it('computes totalPages from repository result', async () => {
    mockListTransfersPaginated.mockResolvedValue({
      transfers: [],
      total: 25,
      page: 1,
      totalPages: 3,
    });

    const result = await transferService.listTransfers({
      page: 1,
      limit: 10,
    });

    expect(result.totalPages).toBe(3);
  });
});
