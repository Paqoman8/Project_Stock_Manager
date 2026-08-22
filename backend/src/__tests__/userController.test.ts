/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockCreateUser = jest.fn() as jest.Mock<any>;
const mockUpdateUser = jest.fn() as jest.Mock<any>;

jest.mock('../services/user.service', () => ({
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
}));

import { createUser, updateUser } from '../controllers/userController';

const REQUESTER = { userId: 'requester-001', roleId: 'role-sa', storeId: 'store-001', orgId: 'org-001' };

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(body: Record<string, unknown>, params: Record<string, string> = {}) {
  return {
    user: REQUESTER,
    params,
    body,
    headers: {},
    ip: '127.0.0.1',
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/users — storeIds obligatoire et non vide', () => {
  it('rejette storeIds vide sans appeler le service', async () => {
    const req = createRequest({
      username: 'jean.dupont',
      email: 'jean@example.com',
      password: 'Aa1!aaaa',
      roleId: 'role-operateur',
      storeIds: [],
    });
    const res = createResponse();

    await createUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('accepte storeIds non vide et appelle le service', async () => {
    mockCreateUser.mockResolvedValue({ id: 'user-001' });
    const req = createRequest({
      username: 'jean.dupont',
      email: 'jean@example.com',
      password: 'Aa1!aaaa',
      roleId: 'role-operateur',
      storeIds: ['store-001'],
    });
    const res = createResponse();

    await createUser(req, res);

    expect(mockCreateUser).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('PUT /api/users/:id — storeIds ne peut pas être vidé', () => {
  it('rejette storeIds explicitement vide sans appeler le service', async () => {
    const req = createRequest({ storeIds: [] }, { id: 'user-target-001' });
    const res = createResponse();

    await updateUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('storeIds absent du body laisse les accès actuels inchangés (le service est appelé normalement)', async () => {
    mockUpdateUser.mockResolvedValue({ id: 'user-target-001' });
    const req = createRequest({ username: 'jean.dupont2' }, { id: 'user-target-001' });
    const res = createResponse();

    await updateUser(req, res);

    expect(mockUpdateUser).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('accepte storeIds non vide et appelle le service', async () => {
    mockUpdateUser.mockResolvedValue({ id: 'user-target-001' });
    const req = createRequest({ storeIds: ['store-001', 'store-002'] }, { id: 'user-target-001' });
    const res = createResponse();

    await updateUser(req, res);

    expect(mockUpdateUser).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
