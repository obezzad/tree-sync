import { AuthProvider, Session } from './types';
import { SupabaseAuthProvider } from './providers/supabase';

class AuthService {
  private static instance: AuthService;
  private provider: AuthProvider;
  private currentSession: Session | null = null;

  private constructor() {
    this.provider = new SupabaseAuthProvider();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async getSession(userId: string): Promise<Session> {
    // Always get a fresh session to ensure it's valid
    this.currentSession = await this.provider.getSession(userId);
    return this.currentSession;
  }

  async getToken(userId: string): Promise<string> {
    const session = await this.getSession(userId);
    return session.access_token;
  }

  clearSession(): void {
    this.currentSession = null;
    // Clear provider session synchronously to match method signature
    try {
      this.provider.clearSession();
    } catch (error) {
      console.error('Error clearing provider session:', error);
    }
  }

  // Expose provider-specific utilities
  static getUsernameFromSession(session: Session): string {
    return SupabaseAuthProvider.getUsernameFromSession(session);
  }
}

export const authService = AuthService.getInstance();
