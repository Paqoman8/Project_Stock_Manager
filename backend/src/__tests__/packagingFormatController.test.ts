/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockProductFindUnique = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    product: { findUnique: mockProductFindUnique },
  },
}));

const mockFindById = jest.fn() as jest.Mock<any>;
const mockFindBaseUnit = jest.fn() as jest.Mock<any>;
const mockCreate = jest.fn() as jest.Mock<any>;
const mockUpdate = jest.fn() as jest.Mock<any>;

jest.mock('../repositories/packaging_format.repository', () => ({
  findById: mockFindById,
  findBaseUnit: mockFindBaseUnit,
  create: mockCreate,
  update: mockUpdate,
  countByProduct: jest.fn(),
  remove: jest.fn(),
}));

import { createFormat, updateFormat } from '../controllers/packagingFormatController';

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(body: Record<string, unknown>, params: Record<string, string> = {}) {
  return {
    user: { orgId: '00000000-0000-0000-0000-000000000010' },
    params: { productId: 'prod-001', ...params },
    body,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProductFindUnique.mockResolvedValue({ id: 'prod-001' });
});

describe('createFormat — invariant unité de base / prix', () => {
  it('rejette un prix fourni pour un format marqué unité de base', async () => {
    const req = createRequest({ label: 'Unité', units_per_package: 1, is_base_unit: true, price: 1500 });
    const res = createResponse();

    await createFormat(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('force price à null pour une unité de base sans prix fourni', async () => {
    mockCreate.mockResolvedValue({ id: 'fmt-001' });
    const req = createRequest({ label: 'Unité', units_per_package: 1, is_base_unit: true });
    const res = createResponse();

    await createFormat(req, res);

    expect(mockCreate).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000010',
      expect.objectContaining({ price: null, is_base_unit: true }),
    );
  });

  it('accepte un prix pour un format qui n\'est pas l\'unité de base', async () => {
    mockCreate.mockResolvedValue({ id: 'fmt-002' });
    const req = createRequest({ label: 'Carton', units_per_package: 24, price: 45000 });
    const res = createResponse();

    await createFormat(req, res);

    expect(mockCreate).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000010',
      expect.objectContaining({ price: 45000 }),
    );
  });
});

describe('updateFormat — patch partiel du prix', () => {
  it('ne touche pas au prix existant quand il est omis de la requête', async () => {
    mockFindById.mockResolvedValue({
      id: 'fmt-002', product_id: 'prod-001', label: 'Carton',
      units_per_package: 24, price: '45000', is_base_unit: false,
    });
    mockUpdate.mockResolvedValue({ id: 'fmt-002' });

    const req = createRequest({ label: 'Carton renommé' }, {});
    (req as any).params.id = 'fmt-002';
    const res = createResponse();

    await updateFormat(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000010',
      'fmt-002',
      expect.objectContaining({ price: undefined }),
    );
  });

  it('rejette un prix fourni si le format devient (ou reste) unité de base', async () => {
    mockFindById.mockResolvedValue({
      id: 'fmt-001', product_id: 'prod-001', label: 'Unité',
      units_per_package: 1, price: null, is_base_unit: true,
    });

    const req = createRequest({ price: 999 }, {});
    (req as any).params.id = 'fmt-001';
    const res = createResponse();

    await updateFormat(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('force le prix à null si le format est basculé en unité de base', async () => {
    mockFindById.mockResolvedValue({
      id: 'fmt-002', product_id: 'prod-001', label: 'Carton',
      units_per_package: 1, price: '45000', is_base_unit: false,
    });
    mockFindBaseUnit.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ id: 'fmt-002' });

    const req = createRequest({ is_base_unit: true }, {});
    (req as any).params.id = 'fmt-002';
    const res = createResponse();

    await updateFormat(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000010',
      'fmt-002',
      expect.objectContaining({ price: null, is_base_unit: true }),
    );
  });
});
