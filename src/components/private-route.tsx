import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/contexts/auth-context";

export function PrivateRoute() {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
