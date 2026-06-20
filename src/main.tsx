import { createRoot } from "react-dom/client";
import "./index.css";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { Login } from "@/pages/login";
import { Header } from "@/components/header";
import { Dashboard } from "@/pages/dashboard";
import { AuthProvider } from "@/contexts/auth-context";
import { PrivateRoute } from "@/components/private-route";
import { Toaster } from "@/components/ui/sonner";

function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function PublicLayout() {
  return (
    <>
      <Header variant="simple" />
      <Outlet />
    </>
  );
}

function PrivateLayout() {
  return (
    <>
      <Header variant="logged" />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          {
            path: "/login",
            element: <Login />,
          },
        ],
      },
      {
        element: <PrivateRoute />,
        children: [
          {
            element: <PrivateLayout />,
            children: [
              {
                path: "/",
                element: <Dashboard />,
              },
            ],
          },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <div className="font-display">
    <RouterProvider router={router} />
    <Toaster />
  </div>,
);
