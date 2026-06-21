import { Container } from "@/components/container";
import { NewTransferDialog } from "@/components/new-transfer-modal";
import { TransactionsTable } from "@/components/transactions-table";
import { useAuth } from "@/contexts/auth-context";
import { formatMoney } from "@/lib/numberFormatter";
import { useMemo } from "react";

export function Dashboard() {
  return (
    <div>
      <Container className="grid grid-cols-1 gap-y-4">
        <Summary />
        <TransactionsTable />
      </Container>
    </div>
  );
}

function Summary() {
  const { user } = useAuth();

  const balance = useMemo(() => {
    if (!user) {
      console.error("[Dashboard / Summary] Error while retrieve user data");
      return "N/A";
    }

    return formatMoney(user.balance);
  }, [user]);

  return (
    <div className="flex justify-between items-center border-2 border-solid ring-1 ring-foreground/10 bg-card text-card-foreground px-8 py-4 rounded-lg">
      <div className="flex justify-between items-center gap-x-4">
        <div>
          <span>Balance</span>
          <p className="text-xl">{balance}</p>
        </div>
      </div>
      <NewTransferDialog />
    </div>
  );
}
