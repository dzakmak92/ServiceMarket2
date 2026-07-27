import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { formatError } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // null = loading, false = unauthenticated
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      // validateStatus prevents Axios from throwing on 401 so we don't
      // pollute the browser console with expected "not logged in" errors.
      const { data, status } = await api.get('/api/auth/me', { validateStatus: (s) => s < 500 });
      setUser(status === 200 ? data : false);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password });
    setUser(data);
    return data;
  };

  const register = async (email, password, name, extra = {}) => {
    const { data } = await api.post('/api/auth/register', { email, password, name, ...extra });
    setUser(data);
    return data;
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(false);
  };

  const completeOnboarding = async (payload) => {
    // Accept either the new full payload (preferred) or legacy (role, country) positional args.
    const body = typeof payload === 'string'
      ? { role: payload, country: arguments[1] || 'AT' }
      : (payload || {});
    const { data } = await api.post('/api/auth/onboarding', body);
    setUser(data);
    return data;
  };

  const refreshUser = async () => {
    try {
      const { data } = await api.get('/api/auth/me');
      setUser(data);
      return data;
    } catch { return null; }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, completeOnboarding, refreshUser, formatError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
