import { AuthProvider, Session } from '@/library/auth/types';
import { createClient, User } from '@supabase/supabase-js';
import store from '@/stores/RootStore';

function mapUserToSessionUser(user: User | null): Session['user'] | undefined {
  if (!user) return undefined;

  return {
    id: user.id,
    email: user.email ?? undefined,
    user_metadata: {
      ...user.user_metadata,
      username: user.user_metadata?.username as string,
      local_id: user.user_metadata?.local_id as string
    }
  };
}

export class SupabaseAuthProvider implements AuthProvider {
  private supabaseClient: ReturnType<typeof createClient>;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  async getSession(userId: string): Promise<Session> {
    try {
      // Try to get and refresh existing session
      const storedSession = store.getStoredSession();
      if (storedSession) {
        const { data: { session }, error } = await this.supabaseClient.auth.getSession();

        if (!error && session) {
          const newSession: Session = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user: mapUserToSessionUser(session.user)
          };

          store.setSession(newSession);

          return newSession;
        }
      }

      // Get new session if refresh failed or no session exists
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: userId })
      });

      if (!response.ok) {
        throw new Error(`Failed to authenticate: ${response.statusText}`);
      }

      const { access_token, refresh_token } = await response.json();

      // Exchange tokens for a session
      const { data: { session }, error } = await this.supabaseClient.auth.setSession({
        access_token,
        refresh_token
      });

      if (error || !session) {
        throw new Error('Failed to set session');
      }

      const newSession: Session = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: mapUserToSessionUser(session.user)
      };

      store.setSession(newSession);
      return newSession;
    } catch (error) {
      console.error('Session error:', error);
      // Clear any invalid session data
      this.clearSession();
      throw error;
    }
  }

  async clearSession(): Promise<void> {
    store.setSession(null);

    try {
      await this.supabaseClient.auth.signOut();
    } catch (error) {
      console.error('Error during sign out:', error);
    }
  }

  static getUsernameFromSession(session: Session): string {
    if (!session?.user?.user_metadata?.username) {
      throw new Error('Failed to extract username from session');
    }
    return session.user.user_metadata.username;
  }
}
