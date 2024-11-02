const getEnvVar = (key: string): string => {
  const value = process.env[`NEXT_PUBLIC_${key}`];

  if (!value) {
    throw new Error(`Environment variable NEXT_PUBLIC_${key} is not defined`);
  }

  return value;
};

export const CONFIG = {
  SUPABASE: {
    URL: getEnvVar('SUPABASE_URL'),
    ANON_KEY: getEnvVar('SUPABASE_ANON_KEY'),
  },
  POWERSYNC: {
    URL: getEnvVar('POWERSYNC_URL'),
  },
} as const;

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
} as const;

export const AUTH_ERRORS = {
  NOT_AUTHENTICATED: 'User is not authenticated',
  INVALID_CREDENTIALS: 'Invalid credentials',
  SESSION_EXPIRED: 'Session has expired',
} as const;

export const SYNC_ERRORS = {
  CONNECTION_FAILED: 'Failed to connect to sync server',
  SYNC_FAILED: 'Failed to sync changes',
  OFFLINE_CHANGES: 'Changes made while offline',
} as const;

export const TOAST_MESSAGES = {
  NODE: {
    CREATED: 'Node created successfully',
    UPDATED: 'Node updated successfully',
    DELETED: 'Node deleted successfully',
    MOVED: 'Node moved successfully',
    ERROR: 'Failed to perform node operation',
  },
  AUTH: {
    LOGIN_SUCCESS: 'Logged in successfully',
    LOGOUT_SUCCESS: 'Logged out successfully',
    ERROR: 'Authentication failed',
  },
  SYNC: {
    CONNECTED: 'Connected to sync server',
    DISCONNECTED: 'Disconnected from sync server',
    ERROR: 'Sync error occurred',
  },
} as const;

export const UI = {
  ANIMATION: {
    DURATION: 200,
  },
  LOADING: {
    DELAY: 300,
  },
} as const;
