/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockListTransactionsForStore = jest.fn() as jest.Mock<any>;

jest.mock('../services/transaction.service', () => ({
  listTransactionsForStore: mockListTransactionsForStore,
}));

import { listTransactions } from '../controllers/transactionController';

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(query: Record<string, unknown> = {}) {
  return {
    user: { orgId: '00000000-0000-0000-0000-000000000010', storeId: 'store-001', roleId: 'role-001' },
    query,
  } as any;
}

describe('listTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when page is not a positive integer', async () => {
    const req = createRequest({ page: '-1' });
    const res = createResponse();

    await listTransactions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListTransactionsForStore).not.toHaveBeenCalled();
  });

  it('returns 400 when limit exceeds 100', async () => {
    const req = createRequest({ limit: '200' });
    const res = createResponse();

    await listTransactions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListTransactionsForStore).not.toHaveBeenCalled();
  });

  it('uses defaults and returns the paginated response shape', async () => {
    mockListTransactionsForStore.mockResolvedValue({
      transactions: [{ id: 'tx-001' }],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    const req = createRequest();
    const res = createResponse();

    await listTransactions(req, res);

    expect(mockListTransactionsForStore).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000010',
      expect.objectContaining({ storeId: 'store-001', page: 1, limit: 10 }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        transactions: expect.any(Array),
        total: expect.any(Number),
        page: expect.any(Number),
        totalPages: expect.any(Number),
      }),
    );
  });

  it('passes search, type and payment_method filters to the service', async () => {
    mockListTransactionsForStore.mockResolvedValue({
      transactions: [],
      total: 0,
      page: 2,
      totalPages: 0,
    });

    const req = createRequest({
      search: 'client',
      type: 'SALE',
      payment_method: 'CASH',
      page: '2',
      limit: '5',
    });
    const res = createResponse();

    await listTransactions(req, res);

    expect(mockListTransactionsForStore).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000010',
      expect.objectContaining({
        storeId: 'store-001',
        search: 'client',
        type: 'SALE',
        paymentMethod: 'CASH',
        page: 2,
        limit: 5,
      }),
    );
  });

  it('rejects invalid type values', async () => {
    const req = createRequest({ type: 'UNKNOWN' });
    const res = createResponse();

    await listTransactions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListTransactionsForStore).not.toHaveBeenCalled();
  });

  it('rejects invalid payment_method values', async () => {
    const req = createRequest({ payment_method: 'BITCOIN' });
    const res = createResponse();

    await listTransactions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListTransactionsForStore).not.toHaveBeenCalled();
  });
});
