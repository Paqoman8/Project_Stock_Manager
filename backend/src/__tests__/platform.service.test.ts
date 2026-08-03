/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockOrgFindUnique = jest.fn() as jest.Mock<any>;
const mockOrgDelete = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    organization: {
      findUnique: mockOrgFindUnique,
      delete: mockOrgDelete,
    },
  },
}));

jest.mock('../services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(void 0),
}));

import * as platformService from '../services/platform.service';

const ORG_ID = 'org-uuid-001';
const ACTOR_ID = 'pm-uuid-001';
const ACTOR_NAME = 'Platform Manager';
const IP = '127.0.0.1';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deleteOrganization', () => {
  it('throws when the organization does not exist', async () => {
    mockOrgFindUnique.mockResolvedValue(null);

    await expect(
      platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, 'my-org'),
    ).rejects.toThrow('Organisation introuvable.');

    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it('throws CONFIRMATION_REQUIRED when the slug is missing', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: false });

    await expect(
      platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');

    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it('throws CONFIRMATION_REQUIRED when the slug is incorrect', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: false });

    await expect(
      platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, 'wrong-slug'),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');

    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it('throws PROTECTED_ORGANIZATION when the organization itself is protected, even with the correct slug', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: true });

    await expect(
      platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, 'my-org'),
    ).rejects.toThrow('PROTECTED_ORGANIZATION');

    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it('deletes a non-protected organization when the slug matches', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: false });
    mockOrgDelete.mockResolvedValue({ id: ORG_ID });

    await platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, 'my-org');

    expect(mockOrgDelete).toHaveBeenCalledWith({ where: { id: ORG_ID } });
  });

  it('accepts a slug with different casing (case-insensitive)', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: false });
    mockOrgDelete.mockResolvedValue({ id: ORG_ID });

    await platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, '  MY-ORG  ');

    expect(mockOrgDelete).toHaveBeenCalledWith({ where: { id: ORG_ID } });
  });
});
