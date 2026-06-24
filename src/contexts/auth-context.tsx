import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { useMutation, useLazyQuery } from "@apollo/client/react";
import {
  AUTH_USER_MUTATION,
  CURRENT_USER_QUERY,
  type AuthUser,
} from "@/graphql/user";

type AuthUserMutationData = { authUser: { user: AuthUser; token: string } };
type AuthUserMutationVars = { email: string; password: string };
type CurrentUserQueryData = { user: AuthUser };

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

  const [authUserMutation] = useMutation<
    AuthUserMutationData,
    AuthUserMutationVars
  >(AUTH_USER_MUTATION);
  const [fetchCurrentUser] = useLazyQuery<CurrentUserQueryData>(
    CURRENT_USER_QUERY,
    {
      fetchPolicy: "network-only",
    }
  );

  async function login(email: string, password: string) {
    const { data } = await authUserMutation({ variables: { email, password } });
    if (!data?.authUser) {
      throw new Error("Authentication failed");
    }
    const { user, token } = data.authUser;
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
    const { data } = await fetchCurrentUser();
    if (!data?.user) {
      throw new Error("Failed to load current user");
    }
    const user = data.user;
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
