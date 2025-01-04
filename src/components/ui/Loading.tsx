'use client';

import React from 'react';

interface LoadingProps {
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
}

const sizeClasses = {
  small: 'w-4 h-4 border-2',
  medium: 'w-8 h-8 border-3',
  large: 'w-12 h-12 border-4'
};

export const Loading = ({ size = 'medium', fullScreen = false }: LoadingProps) => {
  const spinnerClasses = `
    ${sizeClasses[size]}
    border-gray-200
    border-t-blue-500
    rounded-full
    animate-spin
  `;

  const wrapperClasses = fullScreen
    ? 'fixed inset-0 flex items-center justify-center bg-white bg-opacity-80 z-50'
    : 'flex items-center justify-center p-4';

  return (
    <div className={wrapperClasses}>
      <div className={spinnerClasses} role="status" aria-label="Loading">
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  );
};

export const LoadingOverlay = () => (
  <Loading size="large" fullScreen />
);

export const LoadingButton = ({ children, loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
  <button
    {...props}
    className={`
      inline-flex items-center justify-center gap-2
      px-4 py-2 rounded
      bg-blue-500 text-white
      disabled:opacity-50 disabled:cursor-not-allowed
      ${props.className || ''}
    `}
    disabled={loading || props.disabled}
  >
    {loading && <Loading size="small" />}
    {children}
  </button>
);
