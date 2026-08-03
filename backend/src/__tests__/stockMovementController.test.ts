/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockCreateConversion = jest.fn() as jest.Mock<any>;
const mockResolveActorName = jest.fn() as jest.Mock<any>;
const mockResolveStoreName = jest.fn() as jest.Mock<any>;

jest.mock('../services/stock_movement.service', () => ({
  createConversion: mockCreateConversion,
}));

jest.mock('../services/audit.service', () => ({
  resolveActorName: mockResolveActorName,
  resolveStoreName: mockResolveStoreName,
}));

import { createConversion } from '../controllers/stockMovementController';

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(body: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    user: { userId: 'user-001', orgId: '00000000-0000-0000-0000-000000000010', storeId: 'store-001', roleName: 'Super Administrateur' },
    body,
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  } as any;
}

const SID = '550e8400-e29b-41d4-a716-446655440001';
const PID = '550e8400-e29b-41d4-a716-446655440002';
const FID = '550e8400-e29b-41d4-a716-446655440003';
const TID = '550e8400-e29b-41d4-a716-446655440004';

const VALID_BODY = {
  store_id: SID,
  product_id: PID,
  from_packaging_format_id: FID,
  from_packages_count: 1,
  to_packaging_format_id: TID,
  reason: 'Test conversion',
};

describe('createConversion controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveActorName.mockResolvedValue('Actor');
    mockResolveStoreName.mockResolvedValue('Store');
    mockCreateConversion.mockResolvedValue({ id: 'conv-001' });
  });

  describe('validation errors', () => {
    it('rejects missing store_id', async () => {
      const req = createRequest({ ...VALID_BODY, store_id: undefined });
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Données invalides.' }),
      );
      expect(mockCreateConversion).not.toHaveBeenCalled();
    });

    it('rejects invalid uuid fields', async () => {
      const req = createRequest({ ...VALID_BODY, store_id: 'not-a-uuid' });
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreateConversion).not.toHaveBeenCalled();
    });

    it('rejects missing reason', async () => {
      const req = createRequest({ ...VALID_BODY, reason: '' });
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreateConversion).not.toHaveBeenCalled();
    });

    it('rejects non-positive from_packages_count', async () => {
      const req = createRequest({ ...VALID_BODY, from_packages_count: 0 });
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreateConversion).not.toHaveBeenCalled();
    });
  });

  describe('error handling from service', () => {
    it('returns 400 for SAME_FORMAT_CONVERSION', async () => {
      mockCreateConversion.mockRejectedValue(new Error('SAME_FORMAT_CONVERSION'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('différents') }),
      );
    });

    it('returns 500 for BASE_FORMAT_NOT_FOUND', async () => {
      mockCreateConversion.mockRejectedValue(new Error('BASE_FORMAT_NOT_FOUND'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('Aucun format de base') }),
      );
    });

    it('returns 422 for ZERO_CONVERSION', async () => {
      mockCreateConversion.mockRejectedValue(new Error('ZERO_CONVERSION'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('aucun colis') }),
      );
    });

    it('returns 400 for CONVERSION_MISMATCH', async () => {
      mockCreateConversion.mockRejectedValue(new Error('CONVERSION_MISMATCH'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 for STORE_NOT_FOUND', async () => {
      mockCreateConversion.mockRejectedValue(new Error('STORE_NOT_FOUND'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 404 for PRODUCT_NOT_FOUND', async () => {
      mockCreateConversion.mockRejectedValue(new Error('PRODUCT_NOT_FOUND'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 404 for FORMAT_NOT_FOUND', async () => {
      mockCreateConversion.mockRejectedValue(new Error('FORMAT_NOT_FOUND'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 409 for INSUFFICIENT_FORMAT_STOCK', async () => {
      mockCreateConversion.mockRejectedValue(new Error('INSUFFICIENT_FORMAT_STOCK'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('returns 500 for unknown errors', async () => {
      mockCreateConversion.mockRejectedValue(new Error('UNKNOWN_ERROR'));
      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('role-based store access', () => {
    it('allows SA to convert in any store', async () => {
      mockCreateConversion.mockResolvedValue({ id: 'conv-001' });
      const req = createRequest(VALID_BODY, {
        user: { userId: 'user-001', storeId: 'store-999', roleName: 'Super Administrateur' },
      });
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('blocks non-admin converting to another store', async () => {
      const req = createRequest(VALID_BODY, {
        user: { userId: 'user-001', storeId: 'store-999', roleName: 'Manager' },
      });
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockCreateConversion).not.toHaveBeenCalled();
    });

    it('allows manager to convert in own store', async () => {
      mockCreateConversion.mockResolvedValue({ id: 'conv-001' });
      const req = createRequest(VALID_BODY, {
        user: { userId: 'user-001', storeId: VALID_BODY.store_id, roleName: 'Manager' },
      });
      const res = createResponse();
      await createConversion(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('success path', () => {
    it('returns 201 with the created movement', async () => {
      const mockMovement = { id: 'conv-001', type: 'FORMAT_CONVERSION' };
      mockCreateConversion.mockResolvedValue(mockMovement);

      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('Conversion'),
          movement: mockMovement,
        }),
      );
    });

    it('calls service with performed_by_id', async () => {
      mockCreateConversion.mockResolvedValue({ id: 'conv-001' });

      const req = createRequest(VALID_BODY);
      const res = createResponse();
      await createConversion(req, res);

      expect(mockCreateConversion).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000010',
        expect.objectContaining({ performed_by_id: 'user-001' }),
        'user-001',
        'Actor',
        VALID_BODY.store_id,
        'Store',
        '127.0.0.1',
      );
    });
  });
});
