'use client';

import { PowerSyncContext } from '@powersync/react';
import { observer } from 'mobx-react-lite';
import React, { Suspense, useContext, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initializeStore } from '@/stores/RootStore';

export const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

export const usePowerSync = () => {
  const context = useContext(PowerSyncContext);
  // Don't throw on login page or during initialization
  if (!context) {
    return null;
  }
  return context;
};

export const SystemProvider = observer(({ children }: { children: React.ReactNode }) => {
  const store = initializeStore();
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    // Ensure store is initialized on mount
    if (!isLoginPage && !store.isFullyInitialized) {
      store.restoreSession?.();
    }
  }, [isLoginPage, store]);

  // Don't show spinner on login page
  if (isLoginPage) {
    return children;
  }

  if (!store.db) {
    return <LoadingSpinner />;
  }

  // Show spinner while initializing or not ready
  if (!store.isFullyInitialized) {
    return (
      <PowerSyncContext.Provider value={store.db}>
        <LoadingSpinner />
      </PowerSyncContext.Provider>
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PowerSyncContext.Provider value={store.db}>
        {children}
      </PowerSyncContext.Provider>
    </Suspense>
  );
});

export default SystemProvider;
