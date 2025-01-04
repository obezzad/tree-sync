import { makeAutoObservable, runInAction } from 'mobx';
import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from '@/library/powersync/AppSchema';
import { BackendConnector } from '@/library/powersync/BackendConnector';
import { authService } from '@/library/auth/authService';
import { userService } from '@/library/powersync/userService';
import type { Session } from '@/library/auth/types';

const STORAGE_KEYS = {
  SEED: 'tree-sync-seed',
  SESSION: 'tree-sync-session',
  STATE: 'tree-sync-state',
  OFFLINE_MODE: 'tree-sync-offline-mode',
  SHOW_ARCHIVED: 'tree-sync-show-archived'
} as const;

interface PersistedState {
  isPowerSyncReady: boolean;
  isAuthReady: boolean;
  isInitializing: boolean;
  isOfflineMode: boolean;
  showArchivedNodes: boolean;
}

export class RootStore {
  private powerSync: PowerSyncDatabase | null = null;
  seed: string | null = null;
  session: Session | null = null;
  isInitializing = false;
  isPowerSyncReady = false;
  isAuthReady = false;
  isOfflineMode = false;
  showArchivedNodes = true;

  constructor() {
    makeAutoObservable(this);
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  private initialize() {
    this.initializePowerSync();
    this.hydrateState();

    const storedSeed = localStorage.getItem(STORAGE_KEYS.SEED);
    if (storedSeed) {
      runInAction(() => {
        this.seed = storedSeed;
        userService.setSeed(storedSeed);
      });
    }

    const storedOfflineMode = localStorage.getItem(STORAGE_KEYS.OFFLINE_MODE);
    if (storedOfflineMode) {
      runInAction(() => {
        this.isOfflineMode = storedOfflineMode === 'true';
      });
    }

    const storedShowArchived = localStorage.getItem(STORAGE_KEYS.SHOW_ARCHIVED);
    if (storedShowArchived) {
      runInAction(() => {
        this.showArchivedNodes = storedShowArchived === 'true';
      });
    }

    this.restoreSession();
  }

  private initializePowerSync() {
    this.powerSync = new PowerSyncDatabase({
      database: { dbFilename: 'powersync2.db' },
      schema: AppSchema,
      flags: {
        disableSSRWarning: true
      }
    });

    window.db = this.powerSync;
  }

  private persistState() {
    const state: PersistedState = {
      isPowerSyncReady: this.isPowerSyncReady,
      isAuthReady: this.isAuthReady,
      isInitializing: this.isInitializing,
      isOfflineMode: this.isOfflineMode,
      showArchivedNodes: this.showArchivedNodes
    };

    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state));
  }

  private hydrateState() {
    try {
      const storedState = localStorage.getItem(STORAGE_KEYS.STATE);
      if (storedState) {
        const state: PersistedState = JSON.parse(storedState);
        runInAction(() => {
          this.isPowerSyncReady = state.isPowerSyncReady;
          this.isAuthReady = state.isAuthReady;
          this.isInitializing = state.isInitializing;
          this.isOfflineMode = state.isOfflineMode;
          this.showArchivedNodes = state.showArchivedNodes;
        });
      }
    } catch (error) {
      console.error('Failed to hydrate state:', error);
    }
  }

  setSeed(newSeed: string | null) {
    if (!newSeed) {
      this.clearAll();
      return;
    }

    try {
      userService.setSeed(newSeed);
      localStorage.setItem(STORAGE_KEYS.SEED, newSeed);
      runInAction(() => {
        this.seed = newSeed;
      });
      this.persistState();
    } catch (error) {
      console.error('Failed to update seed:', error);
      const previousSeed = localStorage.getItem(STORAGE_KEYS.SEED);
      runInAction(() => {
        this.seed = previousSeed;
        if (previousSeed) {
          userService.setSeed(previousSeed);
        }
      });
    }
  }

  setSession(session: Session | null) {
    runInAction(() => {
      this.session = session;
      if (session) {
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
      }
      this.persistState();
    });
  }

  getStoredSession(): Session | null {
    try {
      const storedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
      if (storedSession) {
        return JSON.parse(storedSession);
      }
    } catch (error) {
      console.error('Failed to parse stored session:', error);
    }
    return null;
  }

  async restoreSession() {
    if (this.isInitializing || this.isFullyInitialized) return;

    const storedSession = this.getStoredSession();
    if (storedSession) {
      try {
        const seed = storedSession?.user?.user_metadata?.username;
        if (seed) {
          await this.initializeWithSeed(seed, storedSession);
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
        await this.logout();
      }
    }
  }

  setShowArchivedNodes(show: boolean) {
    runInAction(() => {
      this.showArchivedNodes = show;
      localStorage.setItem(STORAGE_KEYS.SHOW_ARCHIVED, show.toString());
      this.persistState();
    });
  }

  setOfflineMode(enabled: boolean) {
    runInAction(() => {
      this.isOfflineMode = enabled;
      localStorage.setItem(STORAGE_KEYS.OFFLINE_MODE, enabled.toString());
      this.persistState();
    });

    if (this.powerSync) {
      if (enabled) {
        this.powerSync.disconnect();
      } else if (this.isAuthenticated) {
        const connector = new BackendConnector();
        this.powerSync.connect(connector);
        // HACK: Reconnect to force a sync without refresh for now
        this.powerSync.disconnect();
        this.powerSync.connect(connector);
      }
    }
  }

  private async initializeWithSeed(seed: string, session: Session) {
    runInAction(() => {
      this.isInitializing = true;
      this.seed = seed;
      this.session = session;
      localStorage.setItem(STORAGE_KEYS.SEED, seed);
      this.persistState();
    });

    try {
      userService.setSeed(seed);

      if (this.powerSync && !this.powerSync.connected && !this.isOfflineMode) {
        const connector = new BackendConnector();
        this.powerSync.connect(connector);
        await this.powerSync.waitForReady();
      }

      runInAction(() => {
        this.isPowerSyncReady = true;
        this.isAuthReady = true;
        this.isInitializing = false;
        this.persistState();
      });

      return true;
    } catch (error) {
      console.error('Initialization failed:', error);
      await this.logout();
      return false;
    }
  }

  async login(username: string) {
    try {
      await this.logout();
      const session = await authService.getSession(username);
      this.setSession(session);
      return await this.initializeWithSeed(username, session);
    } catch (error) {
      console.error('Login failed:', error);
      await this.logout();
      return false;
    }
  }

  async refreshSession() {
    try {
      if (!this.seed) {
        throw new Error('Missing seed');
      }

      const session = await authService.getSession(this.seed);
      this.setSession(session);
      return session;
    } catch (error) {
      console.error('Session refresh failed:', error);
      await this.logout();
      return null;
    }
  }

  async logout() {
    try {
      if (this.powerSync?.connected) {
        this.powerSync.disconnectAndClear();
      }

      authService.clearSession();

      runInAction(() => {
        this.setSession(null);
        this.isPowerSyncReady = false;
        this.isAuthReady = false;
        this.isInitializing = false;
        this.persistState();
      });

      localStorage.removeItem(STORAGE_KEYS.STATE);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async clearAll() {
    try {
      await this.logout();
      userService.setSeed(null);
      localStorage.removeItem(STORAGE_KEYS.SEED);
      runInAction(() => {
        this.seed = null;
      });
    } catch (error) {
      console.error('Clear all failed:', error);
    }
  }

  get db() {
    return this.powerSync;
  }

  get isAuthenticated() {
    return !!this.session && !!this.seed;
  }

  get isFullyInitialized() {
    return this.isAuthenticated && this.isPowerSyncReady && this.isAuthReady && !this.isInitializing;
  }
}

let store: RootStore;

export function initializeStore() {
  if (typeof window === 'undefined') {
    return new RootStore();
  }

  if (!store) {
    store = new RootStore();
  }

  return store;
}
