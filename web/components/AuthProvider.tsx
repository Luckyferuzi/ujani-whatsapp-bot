// web/components/AuthProvider.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  AuthUser,
  AuthResponse,
  clearAuth,
  loadAuth,
  saveAuth,
  touchActivity,
} from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  setAuth: (auth: AuthResponse) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Load existing auth on first render
  useEffect(() => {
    const existing = loadAuth();
    if (existing) {
      setUser(existing.user);
      setToken(existing.token);
    }
    setReady(true);
  }, []);

  // Called after successful login / bootstrap-admin
  const setAuth = useCallback((auth: AuthResponse) => {
    setUser(auth.user);
    setToken(auth.token);
    saveAuth(auth);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    setToken(null);
    toast.info("Umetoka kwenye akaunti. Tafadhali ingia tena.");
    router.push("/login");
  }, [router]);

  // Track user activity & auto-logout after timeout
  useEffect(() => {
    if (!ready || !token) return;

    const handleActivity = () => {
      touchActivity();
    };

    window.addEventListener("click", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("scroll", handleActivity);

    const interval = window.setInterval(() => {
      const current = loadAuth();
      if (!current || !current.lastActivity) return;
      const idleMs = Date.now() - current.lastActivity;
      if (idleMs > SESSION_TIMEOUT_MS) {
        window.clearInterval(interval);
        toast.error("Muda wa kikao umeisha. Tafadhali ingia tena.");
        logout();
      }
    }, 60 * 1000);

    return () => {
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.clearInterval(interval);
    };
  }, [ready, token, logout, pathname]);

  const value: AuthContextValue = { user, token, ready, setAuth, logout };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
