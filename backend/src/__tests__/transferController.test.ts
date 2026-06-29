/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRoleFindUnique = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    role: { findUnique: mockRoleFindUnique },
  },
}));

const mockListTransfers = jest.fn() as jest.Mock<any>;

jest.mock('../services/transfer.service', () => ({
  listTransfers: mockListTransfers,
}));

import { listTransfers } from '../controllers/transferController';

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(query: Record<string, unknown> = {}) {
  return {
    user: { storeId: 'store-001', roleId: 'role-001' },
    query,
  } as any;
}

describe('listTransfers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleFindUnique.mockResolvedValue({ name: 'Super Administrateur' });
  });

  it('returns 400 when page is not a positive integer', async () => {
    const req = createRequest({ page: '0' });
    const res = createResponse();

    await listTransfers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListTransfers).not.toHaveBeenCalled();
  });

  it('returns 400 when limit exceeds 100', async () => {
    const req = createRequest({ limit: '101' });
    const res = createResponse();

    await listTransfers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListTransfers).not.toHaveBeenCalled();
  });

  it('uses defaults and returns the paginated response shape', async () => {
    mockListTransfers.mockResolvedValue({
      transfers: [{ id: 'transfer-001' }],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    const req = createRequest();
    const res = createResponse();

    await listTransfers(req, res);

    expect(mockListTransfers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        transfers: expect.any(Array),
        total: expect.any(Number),
        page: expect.any(Number),
        totalPages: expect.any(Number),
      }),
    );
  });

  it('passes search and status filters to the service', async () => {
    mockListTransfers.mockResolvedValue({
      transfers: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });

    const req = createRequest({ search: 'magasin', status: 'PENDING', page: '2', limit: '5' });
    const res = createResponse();

    await listTransfers(req, res);

    expect(mockListTransfers).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'magasin',
        status: 'PENDING',
        page: 2,
        limit: 5,
      }),
    );
  });

  it('rejects invalid status values', async () => {
    const req = createRequest({ status: 'UNKNOWN' });
    const res = createResponse();

    await listTransfers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListTransfers).not.toHaveBeenCalled();
  });
});
