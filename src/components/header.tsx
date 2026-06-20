import { User as UserIcon } from "lucide-react";
import { Container } from "@/components/container";
import { QuitConfirmDialog } from "@/components/quit-confirm-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useMemo } from "react";

type Props = {
  variant: "simple" | "logged";
};

export function Header({ variant = "simple" }: Props) {
  return variant === "simple" ? <SimpleHeader /> : <LoggedHeader />;
}

function SimpleHeader() {
  return (
    <div className="py-4">
      <Container className="flex justify-center items-center">
        <img src="./logo-white.svg" alt="Monex" />
      </Container>
    </div>
  );
}

function LoggedHeader() {
  const { user } = useAuth();

  const userFullName = useMemo(() => {
    if (!user) {
      console.error("[LoggedHeader] Error while retrieve user data");
      return "Unknown";
    }
    return `${user?.firstName} ${user?.lastName.charAt(0)}.`;
  }, [user]);

  return (
    <div className="py-4">
      <Container className="flex justify-between items-center">
        <img src="./logo-white.svg" alt="Monex" />

        <div className="flex items-center gap-x-12">
          <div className="flex items-center gap-x-4">
            <UserIcon />
            <p>{userFullName}</p>
          </div>
          <QuitConfirmDialog />
        </div>
      </Container>
    </div>
  );
}
