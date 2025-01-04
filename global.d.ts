import { AbstractPowerSyncDatabase } from '@powersync/core';

declare global {
  interface Window {
    db: AbstractPowerSyncDatabase;
  }
}

// Export empty object to make it a module
export { }
