import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { PowerSyncDatabase, WASQLiteOpenFactory, WASQLiteVFS } from '@powersync/web';
import { AppSchema } from '@/library/powersync/AppSchema';
import backendConnector from '@/library/powersync/BackendConnector';
import { authService } from '@/library/auth/authService';
import { NAMESPACE, userService } from '@/library/powersync/userService';
import type { Session } from '@/library/auth/types';
import { v5 as uuidv5 } from 'uuid';
import { measureOnce, METRICS, reset } from '@/utils/metrics';

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
  _syncedNodes?: string[];
}

export class RootStore {
  db: PowerSyncDatabase | null = null;
  seed: string | null = null;
  session: Session | null = null;
  isInitializing = false;
  isPowerSyncReady = false;
  isAuthReady = false;
  isOfflineMode = false;
  showArchivedNodes = true;
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
        this.setSelectedNodeId(uuidv5("ROOT_NODE", userService.getUserId()));
      }
    )

    reaction(
      () => this.selectedNodeId,
      () => {
        if (!this.selectedNodeId) return;

        const rootNodeId = uuidv5("ROOT_NODE", userService.getUserId());

        if (!this.db?.currentStatus.hasSynced) {
          this._syncedNodes = [...new Set([rootNodeId, this.selectedNodeId, ...this._syncedNodes])];
        } else {
          this._syncedNodes = [rootNodeId];
        }
      }
    );

    reaction(
      () => [this.isAuthenticated, this.isOfflineMode],
      () => {
        console.log(
          "%cReconnect DB",
          "color: lime"
        )
        this.connectDb();
      },
    );

    reaction(
      () => [this._syncedNodes],
      (newValue, previousValue) => {
        if (!this.db?.currentStatus.hasSynced) {
          const currentNodes = newValue[0] as string[];
          const previousNodes = previousValue?.[0] as string[] || [];

          const hasNewNodes = currentNodes.some(node => !previousNodes.includes(node));
          const hasRemovedNodes = previousNodes.some(node => !currentNodes.includes(node));

          if (hasNewNodes || hasRemovedNodes) {
            console.log(
              "%cReconnect DB with updated nodes",
              "color: lime"
            )
            this.connectDb();
          } else {
            console.log(
              "%cSkipping reconnect - nodes already selected",
              "color: orange"
            )
          }
        }
      }
    )
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

    this.connectDb();
  }

  private initializePowerSync() {
    this.db = new PowerSyncDatabase({
      database: new WASQLiteOpenFactory({
        dbFilename: 'powersync.db',
        vfs: WASQLiteVFS.OPFSCoopSyncVFS,
        flags: {
          enableMultiTabs: typeof SharedWorker !== 'undefined',
          disableSSRWarning: true,
        }
      }),
      schema: AppSchema,
      flags: {
        enableMultiTabs: typeof SharedWorker !== 'undefined',
        disableSSRWarning: true,
      }
    });

    if (typeof window !== 'undefined' && this.db) {
      // Expose the PowerSyncDatabase for console debugging
      (window as any).__psDB = this.db;
      console.log('[RootStore] db exposed on window.__psDB');
    }
  }

  private persistState() {
    const state: PersistedState = {
      isPowerSyncReady: this.isPowerSyncReady,
      isAuthReady: this.isAuthReady,
      isInitializing: this.isInitializing,
      isOfflineMode: this.isOfflineMode,
      showArchivedNodes: this.showArchivedNodes,
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
          this.showArchivedNodes = state.showArchivedNodes;
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

  setSelectedNodeId(nodeId: string | null) {
    runInAction(() => {
      this.selectedNodeId = nodeId;
    });
  }

  async connectDb() {
    if (!this.isAuthenticated || this.isOfflineMode) {
      return;
    }

    const params: Record<string, any> = {
      user: userService.getUserId()
    };

    if (!this.db?.currentStatus.hasSynced) {
      params.selected_nodes = [...this._syncedNodes];
    }

    this.db?.connect(backendConnector, { params });

    this.db?.waitForFirstSync().then(() => {
      measureOnce(METRICS.TIME_TO_PARTIAL_REPLICATION);
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
        this.db?.disconnect();
      }
    }
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
      runInAction(() => {
        this.isInitializing = true;
      });

      await this.db?.disconnectAndClear();
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

  get isAuthenticated() {
    return !!this.session && !!this.seed;
  }

  get isFullyInitialized() {
    return this.isAuthenticated && this.isPowerSyncReady && this.isAuthReady && !this.isInitializing;
  }
}

const store = new RootStore();

export default store;
