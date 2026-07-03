import type { AppError, Result } from '@core/domain/index.js';

/**
 * Client-side auth port. Web (and future mobile/Electron) programs against
 * this interface; the Better Auth client adapter implements it.
 * Session state itself is read through the API (`/api/me`), not through here.
 */
export interface AuthClientPort {
  signUp(input: { name: string; email: string; password: string }): Promise<Result<void, AppError>>;
  signIn(input: { email: string; password: string }): Promise<Result<void, AppError>>;
  signOut(): Promise<Result<void, AppError>>;
}
