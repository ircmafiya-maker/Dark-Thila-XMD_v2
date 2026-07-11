import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { tokenRef } from "./tokenStore";

interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Canonical setter: updates the stable module-level ref synchronously so the
  // api-client getter sees the fresh token immediately, then schedules a React
  // state update for re-render.
  const applyToken = (t: string | null) => {
    tokenRef.current = t;
    setToken(t);
  };

  // On mount, restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("auth_token");
    if (saved) {
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${saved}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.user) {
            applyToken(saved);
            setUser(data.user);
          } else {
            localStorage.removeItem("auth_token");
            applyToken(null);
          }
        })
        .catch(() => {
          localStorage.removeItem("auth_token");
          applyToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    localStorage.setItem("auth_token", data.token);
    applyToken(data.token);
    setUser(data.user);
  };

  const register = async (username: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");
    localStorage.setItem("auth_token", data.token);
    applyToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    applyToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
