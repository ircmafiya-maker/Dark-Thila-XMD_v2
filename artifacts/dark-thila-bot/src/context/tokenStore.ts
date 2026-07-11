/**
 * Stable singleton — lives in its own module so Vite HMR never invalidates it
 * when AuthContext.tsx changes. The api-client getter is registered exactly once
 * at import time, and tokenRef.current is pre-seeded from localStorage so the
 * getter returns the right token before AuthProvider even mounts.
 */
import { setAuthTokenGetter } from "@workspace/api-client-react";

export const tokenRef = { current: null as string | null };

// Pre-seed from localStorage so the getter is useful immediately on page load.
if (typeof window !== "undefined") {
  tokenRef.current = localStorage.getItem("auth_token");
}

// Register once — persists across AuthContext.tsx HMR reloads.
setAuthTokenGetter(() => tokenRef.current);
