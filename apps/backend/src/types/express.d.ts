declare global {
  namespace Express {
    interface Request {
      requestId: string;
      authContext?: SessionContext | null;
    }
  }
}
export {};
import type { SessionContext } from '../modules/auth/auth.types.js';
