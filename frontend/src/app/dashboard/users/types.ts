export interface Role {
  id: string;
  name: string;
}

export interface Store {
  id: string;
  name: string;
  location: string | null;
  is_protected?: boolean;
}

export interface StoreAccess {
  store: Store;
}

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  is_active: boolean;
  role: Role;
  store_access: StoreAccess[];
}
