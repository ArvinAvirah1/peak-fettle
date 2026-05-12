/**
 * useAuth — convenience hook for consuming AuthContext.
 *
 * Throws a descriptive error if called outside an <AuthProvider> tree,
 * which surfaces misconfiguration at development time rather than silently
 * returning null.
 *
 * Usage:
 *   const { user, login, logout, isAuthenticated } = useAuth();
 */

import { useContext } from 'react';
import { AuthContext, AuthContextValue } from '../context/AuthContext';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth() must be called inside an <AuthProvider>. ' +
        'Ensure your app/_layout.tsx wraps the tree with <AuthProvider>.'
    );
  }

  return context;
}
