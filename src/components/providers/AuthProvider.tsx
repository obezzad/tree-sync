'use client';

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { observer } from 'mobx-react-lite';
import { initializeStore } from '@/stores/RootStore';

type AuthContextType = {
  isAuthenticated: boolean;
  isFullyInitialized: boolean;
  logout: () => Promise<void>;
  login: (username: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isFullyInitialized: false,
  logout: async () => {},
  login: async () => false
});

export const AuthProvider = observer(({ children }: { children: React.ReactNode }) => {
  const store = initializeStore();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (!pathname || redirectingRef.current) return;

    const shouldRedirectToLogin = !store.isAuthenticated && !isLoginPage;
    const shouldRedirectToHome = store.isFullyInitialized && isLoginPage;

    if (shouldRedirectToLogin) {
      redirectingRef.current = true;
      router.replace('/login');
    } else if (shouldRedirectToHome) {
      redirectingRef.current = true;
      router.replace('/');
    }

    return () => {
      redirectingRef.current = false;
    };
  }, [store.isAuthenticated, store.isFullyInitialized, isLoginPage, pathname, router]);

  const contextValue: AuthContextType = {
    isAuthenticated: store.isAuthenticated,
    isFullyInitialized: store.isFullyInitialized,
    logout: store.logout.bind(store),
    login: store.login.bind(store)
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
