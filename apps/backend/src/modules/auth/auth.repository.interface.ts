import type {
  Actor,
  SessionRecord,
  StoredUser,
  UserCreate,
  UserUpdate,
  UserQuery,
} from './auth.types.js';
export interface AuthRepository {
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findSession(id: string): Promise<{ session: SessionRecord; user: StoredUser | null } | null>;
  createAnonymousSession(session: SessionRecord): Promise<void>;
  rotateSession(oldId: string, user: StoredUser, session: SessionRecord): Promise<StoredUser>;
  touchSession(id: string, now: Date): Promise<boolean>;
  deleteSession(id: string): Promise<void>;
  consumeLimit(key: string, now: Date, windowMs: number): Promise<{ count: number; resetAt: Date }>;
  listUsers(query: UserQuery): Promise<{ items: StoredUser[]; total: number }>;
  createUser(actor: Actor, input: UserCreate): Promise<StoredUser>;
  updateUser(actor: Actor, id: string, input: UserUpdate): Promise<StoredUser>;
  bootstrapAdmin(input: UserCreate): Promise<StoredUser>;
}
