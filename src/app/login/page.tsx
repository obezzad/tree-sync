'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import store from '@/stores/RootStore';
import toast from 'react-hot-toast';

function LoginForm({ from }: { from: string }) {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    const storedSeed = store.seed;

    if (storedSeed) {
      setUsername(storedSeed);
    }
  }, [store.seed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      toast.error('Please enter a username');
      return;
    }

    setIsLoading(true);
    try {
      const success = await login(trimmedUsername);
      if (!success) {
        throw new Error('Login failed');
      }

      router.replace(from);
    } catch (error) {
      console.error('Login failed:', error);
      toast.error('Failed to login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateRandomUsername = () => {
    const adjectives = ['Curious', 'Mindful', 'Insightful', 'Wise', 'Thoughtful'];
    const nouns = ['Thinker', 'Scholar', 'Sage', 'Sensemaker', 'Notetaker'];
    const randomNumber = Math.floor(Math.random() * 10000);
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    setUsername(`${randomAdjective}${randomNoun}${randomNumber}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-4xl font-extrabold text-gray-900 tracking-tight">
            Welcome Back
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Use the same username across devices to sync the same thoughtspace.
          </p>
        </div>

        <div className="mt-8">
          <div className="bg-white p-8 rounded-xl shadow-xl space-y-6 transition-all duration-300">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 transition-colors duration-200 ease-in-out"
                    placeholder="Enter your username"
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  The username acts as a thoughtspace&apos;s seed to reproduce the same tree across devices for sync testing.
                </p>
              </div>

              <div className="flex flex-col space-y-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                >
                  {isLoading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </button>

                <button
                  type="button"
                  onClick={generateRandomUsername}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 ease-in-out"
                  disabled={isLoading}
                >
                  Generate Random Username
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SearchParamsWrapperProps {
  children: (props: { from: string }) => React.ReactElement;
}

function SearchParamsWrapper({ children }: SearchParamsWrapperProps) {
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';
  return children({ from });
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchParamsWrapper>
        {({ from }) => <LoginForm from={from} />}
      </SearchParamsWrapper>
    </Suspense>
  );
}
