import { makeAutoObservable } from 'mobx';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '@/library/auth/types';

export class AuthStore {
  supabase: SupabaseClient;
  session: Session | null = null;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
    makeAutoObservable(this);
  }

  async getSession(userId: string): Promise<Session> {
    try {
      // Try to get and refresh existing session
      const storedSession = this.session;
      if (storedSession) {
        const { data, error } = await this.supabase.auth.setSession({
          access_token: storedSession.access_token,
          refresh_token: storedSession.refresh_token
        });

        if (!error && data?.session) {
          const newSession: Session = {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
            user: {
              id: data.session.user.id,
              email: data.session.user.email ?? undefined,
              user_metadata: {
                username: data.session.user.user_metadata?.username as string,
                local_id: data.session.user.user_metadata?.local_id as string
              }
            }
          };

          // Only update if tokens have changed
          if (data.session.access_token !== storedSession.access_token) {
            this.setSession(newSession);
          }
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

      // Set the session with new tokens
      const { data: { session }, error } = await this.supabase.auth.setSession({
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
        user: {
          id: session.user.id,
          email: session.user.email ?? undefined,
          user_metadata: {
            username: session.user.user_metadata?.username as string,
            local_id: session.user.user_metadata?.local_id as string
          }
        }
      };

      this.setSession(newSession);
      return newSession;
    } catch (error) {
      console.error('Session error:', error);
      this.clearSession();
      throw error;
    }
  }

  setSession(session: Session | null) {
    this.session = session;
  }

  clearSession() {
    this.session = null;
    this.supabase.auth.signOut().catch(error => {
      console.error('Error during sign out:', error);
    });
  }

  getUsernameFromSession(session: Session): string {
    if (!session?.user?.user_metadata?.username) {
      throw new Error('Failed to extract username from session');
    }
    return session.user.user_metadata.username;
  }
}

let store: AuthStore;

export function initializeAuthStore() {
  // For SSR, return empty store
  if (typeof window === 'undefined') {
    return new AuthStore();
  }

  // Create the store once in the client
  if (!store) {
    store = new AuthStore();
  }

  return store;
}
