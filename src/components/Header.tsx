'use client';

import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useSeed } from '@/hooks/useSeed';
import { useAuth } from '@/components/providers/AuthProvider';
import store from '@/stores/RootStore';

export const Header = observer(() => {
  const { seed } = useSeed();
  const { logout } = useAuth();

  const toggleOfflineMode = () => {
    store.setOfflineMode(!store.isOfflineMode);
  };

  const togglePartialSync = () => {
    store.setPartialSync(!store.isPartialSync);
  };

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        if (event.key === 'o') {
          event.preventDefault();
          toggleOfflineMode();
        } else if (event.key === 'p') {
          event.preventDefault();
          togglePartialSync();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [store]);

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">Current Seed:</span>
            <code>{seed}</code>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Offline Mode</span>
                <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-2 font-mono text-xs text-gray-600" title="Keyboard shortcut for toggling offline mode">
                  <span className="text-xs">⌘</span>
                  <span className="mx-0.5">O</span>
                </kbd>
                <button
                  onClick={toggleOfflineMode}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${store.isOfflineMode ? 'bg-red-600' : 'bg-gray-200'
                    }`}
                  role="switch"
                  aria-checked={!store.isOfflineMode}
                  title="Toggle Offline Mode"
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${store.isOfflineMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Partial Sync</span>
                <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-2 font-mono text-xs text-gray-600" title="Keyboard shortcut for toggling partial sync">
                  <span className="text-xs">⌘</span>
                  <span className="mx-0.5">P</span>
                </kbd>
                <button
                  onClick={togglePartialSync}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    ${store.isPartialSync ? 'bg-blue-600' : 'bg-gray-200'}`}
                  role="switch"
                  aria-checked={store.isPartialSync}
                  title="Toggle Partial Sync"
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                      ${store.isPartialSync ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
});

export default Header;
