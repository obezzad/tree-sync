export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: {
    id: string;
    email?: string;
    user_metadata?: {
      username: string;
      local_id: string;
    };
  };
}

export interface AuthProvider {
  getSession(userId: string): Promise<Session>;
  clearSession(): void;
}
