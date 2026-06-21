import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { authUser as authUserService, getCurrentUser, type AuthUser, type AuthResult } from "@/services/user";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>(() => {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      const userRaw = sessionStorage.getItem(USER_KEY);
      if (token && userRaw) {
        return { token, user: JSON.parse(userRaw) as AuthUser };
      }
    } catch {
      // sessionStorage unavailable — fall through to null state
    }
    return { token: null, user: null };
  });

  async function login(email: string, password: string) {
    const { user, token }: AuthResult = await authUserService(email, password);
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // sessionStorage unavailable — continue with in-memory only
    }
    setState({ user, token });
    navigate("/");
  }

  function logout() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {
      // sessionStorage unavailable
    }
    setState({ user: null, token: null });
    navigate("/login");
  }

  async function refreshUser() {
    if (!state.token) {
      return;
    }
    const user = await getCurrentUser(state.token);
    try {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // sessionStorage unavailable — continue with in-memory only
    }
    setState((prev) => ({ ...prev, user }));
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
