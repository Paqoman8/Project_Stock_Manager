/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockSupplierProductUpdate = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    supplierProduct: {
      update: mockSupplierProductUpdate,
    },
  },
}));

import { update } from '../repositories/supplier_product.repository';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('supplier_product.repository.update', () => {
  it('maps Prisma unique violations to SUPPLIER_PRODUCT_ALREADY_EXISTS', async () => {
    mockSupplierProductUpdate.mockRejectedValue({ code: 'P2002' });

    await expect(
      update('org-001', 'supplier-product-001', { packaging_format_id: 'fmt-002' }),
    ).rejects.toThrow('SUPPLIER_PRODUCT_ALREADY_EXISTS');
  });
});
