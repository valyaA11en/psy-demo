"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ApiEnvelope,
  ApiErrorPayload,
  AuthSessionPayload,
  AuthUser,
} from "@/lib/types";

type RegisterInput = {
  email: string;
  password: string;
  accountType: "client" | "psychologist";
  displayName?: string;
  firstName?: string;
  lastName?: string;
  publicTitle?: string;
};

type RequestOptions = {
  auth?: boolean;
};

type AuthContextValue = {
  ready: boolean;
  accessToken: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthSessionPayload>;
  register: (input: RegisterInput) => Promise<AuthSessionPayload>;
  logout: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit, options?: RequestOptions) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function clientApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
}

async function parseEnvelope<T>(response: Response) {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorPayload | null;

  if (!response.ok) {
    const message =
      payload && "error" in payload && payload.error?.message
        ? payload.error.message
        : "Request failed";
    throw new Error(message);
  }

  if (!payload || !("data" in payload)) {
    throw new Error("API returned an unexpected response");
  }

  return payload.data;
}

function buildHeaders(initHeaders: HeadersInit | undefined, token?: string | null, body?: BodyInit | null) {
  const headers = new Headers(initHeaders);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const applySession = useEffectEvent((session: AuthSessionPayload) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
  });

  const clearSession = useEffectEvent(() => {
    setAccessToken(null);
    setUser(null);
  });

  async function refreshSession() {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const promise = (async () => {
      const response = await fetch(`${clientApiBaseUrl()}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        clearSession();
        return null;
      }

      const session = await parseEnvelope<AuthSessionPayload>(response);
      applySession(session);
      return session.accessToken;
    })()
      .catch(() => {
        clearSession();
        return null;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    refreshPromiseRef.current = promise;
    return promise;
  }

  useEffect(() => {
    let isMounted = true;

    void refreshSession().finally(() => {
      if (isMounted) {
        setReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const response = await fetch(`${clientApiBaseUrl()}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const session = await parseEnvelope<AuthSessionPayload>(response);
    applySession(session);
    return session;
  }

  async function register(input: RegisterInput) {
    const response = await fetch(`${clientApiBaseUrl()}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        acceptPrivacyPolicy: true,
        acceptPlatformTerms: true,
      }),
    });

    const session = await parseEnvelope<AuthSessionPayload>(response);
    applySession(session);
    return session;
  }

  async function logout() {
    await fetch(`${clientApiBaseUrl()}/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => null);

    clearSession();
  }

  async function request<T>(path: string, init?: RequestInit, options?: RequestOptions) {
    const authRequired = options?.auth ?? true;
    let token = accessToken;

    if (authRequired && !token) {
      token = await refreshSession();
    }

    async function doFetch(currentToken: string | null) {
      return fetch(`${clientApiBaseUrl()}${path}`, {
        ...init,
        credentials: "include",
        headers: buildHeaders(init?.headers, currentToken, init?.body ?? null),
      });
    }

    let response = await doFetch(authRequired ? token : null);

    if (response.status === 401 && authRequired) {
      token = await refreshSession();

      if (!token) {
        throw new Error("Your session has expired");
      }

      response = await doFetch(token);
    }

    return parseEnvelope<T>(response);
  }

  return (
    <AuthContext.Provider
      value={{
        ready,
        accessToken,
        user,
        login,
        register,
        logout,
        request,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
