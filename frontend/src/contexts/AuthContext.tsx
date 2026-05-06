import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  id: number;
  email: string;
  username: string;
  role: "SUPER_ADMIN" | "CLIENT_ADMIN" | "EMPLOYEE";
  clientId?: number;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  login: (username: string, password: string, remember: boolean) => Promise<User>;
  logout: () => Promise<void>;
  isLoading: boolean;
  // Expose une fonction pour rafraîchir le token depuis d'autres composants
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Helpers localStorage
function saveAuth(data: { user: User; accessToken: string; refreshToken: string }) {
  localStorage.setItem("auth", JSON.stringify(data));
}

function clearAuth() {
  localStorage.removeItem("auth");
}

function getStoredAuth(): { user: User; accessToken: string; refreshToken: string } | null {
  try {
    const raw = localStorage.getItem("auth");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Au montage : tente de restaurer la session via le refresh token stocké
  useEffect(() => {
    const stored = getStoredAuth();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    // Tente de renouveler l'access token via le refresh token
    fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored.refreshToken }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        // Met à jour le token dans le state et le localStorage
        setUser(stored.user);
        setAccessToken(data.accessToken);
        saveAuth({ user: stored.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      })
      .catch(() => {
        // Refresh token invalide/expiré → déconnexion silencieuse
        clearAuth();
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Rafraîchissement automatique toutes les 12 min (access token expire à 15 min)
  useEffect(() => {
    const interval = setInterval(async () => {
      const stored = getStoredAuth();
      if (!stored) return;
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: stored.refreshToken }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setAccessToken(data.accessToken);
        saveAuth({ user: stored.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      } catch {}
    }, 12 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Rafraîchit manuellement la session (appelable depuis d'autres composants)
  async function refreshSession(): Promise<boolean> {
    const stored = getStoredAuth();
    if (!stored) return false;
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      });
      if (!res.ok) { clearAuth(); return false; }
      const data = await res.json();
      setAccessToken(data.accessToken);
      saveAuth({ user: stored.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }

  async function login(username: string, password: string, _remember: boolean): Promise<User> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Erreur de connexion");
    }
    const data = await res.json();
    setUser(data.user);
    setAccessToken(data.accessToken);
    // Toujours persister la session (refresh token valable 7 jours)
    saveAuth({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.user;
  }

  async function logout() {
    const stored = getStoredAuth();
    if (stored) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      }).catch(() => {});
    }
    setUser(null);
    setAccessToken(null);
    clearAuth();
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, isLoading, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
