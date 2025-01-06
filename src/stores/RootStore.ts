import { autorun, makeAutoObservable, reaction, runInAction } from 'mobx';
import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from '@/library/powersync/AppSchema';
import backendConnector from '@/library/powersync/BackendConnector';
import { authService } from '@/library/auth/authService';
import { NAMESPACE, userService } from '@/library/powersync/userService';
import type { Session } from '@/library/auth/types';
import { v5 as uuidv5 } from 'uuid';
import { measureOnce, METRICS, registerStart, reset } from '@/utils/metrics';

const STORAGE_KEYS = {
  SEED: 'tree-sync-seed',
  SESSION: 'tree-sync-session',
  STATE: 'tree-sync-state',
  OFFLINE_MODE: 'tree-sync-offline-mode',
  PARTIAL_SYNC: 'tree-sync-partial-sync',
  SHOW_ARCHIVED: 'tree-sync-show-archived'
} as const;

interface PersistedState {
  isPowerSyncReady: boolean;
  isAuthReady: boolean;
  isInitializing: boolean;
  isOfflineMode: boolean;
  isPartialSync: boolean;
  showArchivedNodes: boolean;
  isFocusedView: boolean;
  _syncedNodes?: string[];
}

export class RootStore {
  private partialDb: PowerSyncDatabase | null = null;
  private fullDb: PowerSyncDatabase | null = null;
  seed: string | null = null;
  session: Session | null = null;
  isInitializing = false;
  isPowerSyncReady = false;
  isAuthReady = false;
  isOfflineMode = false;
  isPartialSync = true;
  showArchivedNodes = true;
  isFocusedView = true;
  selectedNodeId: string | null = null;
  _syncedNodes: string[] = [];

  constructor() {
    makeAutoObservable(this);

    if (typeof window !== 'undefined') {
      this.initialize();
    }

    reaction(
      () => this.seed,
      () => {
        this.selectedNodeId = uuidv5("ROOT_NODE", userService.getUserId());
      }
    )

    reaction(
      () => this.selectedNodeId,
      () => {
        if (!this.selectedNodeId) return;

        // if (this._syncedNodes.length > 0 && !this._syncedNodes.includes(uuidv5("ROOT_NODE", userService.getUserId()))) {
        //   this._syncedNodes = [this.selectedNodeId];
        //   return;
        // }

        this._syncedNodes = [...new Set([this.selectedNodeId, ...this._syncedNodes])];
      }
    );

    reaction(
      () => this._syncedNodes,
      () => {
        console.log("Synced nodes:", this._syncedNodes);
        this.connectDb();
      },
    );
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

    const storedPartialSync = localStorage.getItem(STORAGE_KEYS.PARTIAL_SYNC);
    if (storedPartialSync) {
      runInAction(() => {
        this.isPartialSync = storedPartialSync === 'true';
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
    this.fullDb = new PowerSyncDatabase({
      database: { dbFilename: 'full.db' },
      schema: AppSchema,
      flags: {
        disableSSRWarning: true
      }
    });

    this.partialDb = new PowerSyncDatabase({
      database: { dbFilename: 'partial.db' },
      schema: AppSchema,
      flags: {
        disableSSRWarning: true
      }
    });
  }

  private persistState() {
    const state: PersistedState = {
      isPowerSyncReady: this.isPowerSyncReady,
      isAuthReady: this.isAuthReady,
      isInitializing: this.isInitializing,
      isOfflineMode: this.isOfflineMode,
      isPartialSync: this.isPartialSync,
      showArchivedNodes: this.showArchivedNodes,
      isFocusedView: this.isFocusedView,
      _syncedNodes: this._syncedNodes
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
          this.isPartialSync = state.isPartialSync;
          this.showArchivedNodes = state.showArchivedNodes;
          this.isFocusedView = state.isFocusedView;
          this._syncedNodes = state._syncedNodes || [];
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

  setFocusedView(enabled: boolean) {
    runInAction(() => {
      this.isFocusedView = enabled;
      this.persistState();
    });
  }

  async connectDb() {
    if (!this.isAuthenticated || this.isOfflineMode) {
      return;
    }

    const selected_nodes = [...this._syncedNodes];

    registerStart("init_db_connect");

    this.partialDb?.connect(backendConnector, {
      params: {
        user: userService.getUserId(),
        selected_nodes
      }
    }).then(() => {
      registerStart("partial_db_connected");
    });


    this.partialDb?.waitForReady().then(() => {
      registerStart("partial_db_ready");
    });

    this.partialDb?.waitForFirstSync().then(() => {
      measureOnce(METRICS.TIME_TO_PARTIAL_REPLICATION);
    });

    this.fullDb?.connect(backendConnector, {
      params: {
        user: userService.getUserId()
      }
    }).then(() => {
      registerStart("full_db_connected");
    });

    this.fullDb?.waitForReady().then(() => {
      registerStart("full_db_ready");
    });

    this.fullDb?.waitForFirstSync().then(() => {
      measureOnce(METRICS.TIME_TO_FULL_REPLICATION);
    });
  }

  setOfflineMode(enabled: boolean) {
    runInAction(() => {
      this.isOfflineMode = enabled;
      localStorage.setItem(STORAGE_KEYS.OFFLINE_MODE, enabled.toString());
      this.persistState();
    });

    if (this.db) {
      if (enabled) {
        this.partialDb?.disconnect();
        this.fullDb?.disconnect();
      }
    }
  }

  setPartialSync(enabled: boolean) {
    runInAction(() => {
      this.isPartialSync = enabled;
      localStorage.setItem(STORAGE_KEYS.PARTIAL_SYNC, enabled.toString());
      this.persistState();
    });
  }

  private async initializeWithSeed(seed: string, session: Session) {
    runInAction(() => {
      this.isInitializing = true;
      this.seed = seed;
      console.log({ seed })
      this.session = session;
      localStorage.setItem(STORAGE_KEYS.SEED, seed);
      this._syncedNodes = [uuidv5("ROOT_NODE", uuidv5(seed, NAMESPACE))];
      this.persistState();
    });

    try {
      userService.setSeed(seed);

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
      await this.partialDb?.disconnectAndClear();
      await this.fullDb?.disconnectAndClear();
      reset();
      localStorage.removeItem(STORAGE_KEYS.STATE);
      authService.clearSession();

      runInAction(() => {
        this.setSession(null);
        this.isPowerSyncReady = false;
        this.isAuthReady = false;
        this.isInitializing = false;
        this._syncedNodes = [];
      });
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
    const _db = this.isPartialSync ? this.partialDb : this.fullDb;

    if (typeof window !== 'undefined') {
      window.db = _db;
    }

    return _db;
  }

  get isAuthenticated() {
    return !!this.session && !!this.seed;
  }

  get isFullyInitialized() {
    return this.isAuthenticated && this.isPowerSyncReady && this.isAuthReady && !this.isInitializing;
  }
}

const store = new RootStore();

export default store;
