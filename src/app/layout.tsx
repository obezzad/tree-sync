'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../components/providers/AuthProvider';
import { SystemProvider } from '../components/providers/SystemProvider';
import { Header } from '../components/Header';
import './globals.scss';
import 'lato-font';

function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return children;
  }

  return (
    <SystemProvider>
      <Header />
      {children}
    </SystemProvider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppContent>{children}</AppContent>
        </AuthProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
