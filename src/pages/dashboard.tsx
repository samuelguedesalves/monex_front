import { Container } from "@/components/container";
import { NewTransferDialog } from "@/components/new-transfer-modal";
import { TransactionsTable } from "@/components/transactions-table";
// import { Button } from "@/components/ui/button";

export function Dashboard() {
  return (
    <div>
      <Container className="grid grid-cols-1 gap-y-4">
        <Heading />
        <TransactionsTable />
      </Container>
    </div>
  );
}

function Heading() {
  return (
    <div className="flex justify-between items-center border-2 border-solid ring-1 ring-foreground/10 bg-card text-card-foreground px-8 py-4 rounded-lg">
      <div className="flex justify-between items-center gap-x-4">
        <div>
          <span>Balance</span>
          <p className="text-xl">$ 3.800,00</p>
        </div>
        <div>
          <span>Income</span>
          <p className="text-xl">$ 3.800,00</p>
        </div>
        <div>
          <span>Outcome</span>
          <p className="text-xl">$ 3.800,00</p>
        </div>
      </div>
      <NewTransferDialog />
      {/* <Button>New Transfer</Button> */}
    </div>
  );
}
