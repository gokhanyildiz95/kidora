import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, SessionUser } from '@kidora/shared';
import { api, ApiError } from './api';

interface AuthState {
  user: SessionUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: SessionUser }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.post<{ user: SessionUser }>('/auth/login', input),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(['me'], user);
    },
  });

  const value: AuthState = {
    user: me.data ?? null,
    isLoading: me.isLoading,
    login: async (input) => {
      await loginMutation.mutateAsync(input);
    },
    logout: async () => {
      try {
        await api.post('/auth/logout');
      } finally {
        // qc.clear() alone leaves the mounted `me` observer holding the old user, so the UI never
        // switched to the login screen. A full reload drops every cached query and lands on login.
        qc.clear();
        window.location.replace('/');
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
