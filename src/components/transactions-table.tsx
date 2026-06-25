import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { formatMoney } from "@/lib/numberFormatter";
import { useQuery } from "@apollo/client/react";
import {
  Transaction,
  TRANSACTIONS_FROM_USER_QUERY,
  TransactionUser,
  type TransactionsPage,
} from "@/graphql/transaction";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const PAGE_SIZE = 10;
const COLUMN_COUNT = 5;

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type TransactionsTableProps = {
  refreshKey?: number;
};

export function TransactionsTable({ refreshKey = 0 }: TransactionsTableProps) {
  const { token, user } = useAuth();
  const [page, setPage] = useState(1);
  const previousRefreshKey = useRef(refreshKey);

  const { data, loading, error, refetch } = useQuery<{
    transactionsFromUser: TransactionsPage;
  }>(TRANSACTIONS_FROM_USER_QUERY, {
    variables: { page },
    skip: !token,
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (refreshKey !== previousRefreshKey.current) {
      previousRefreshKey.current = refreshKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const transactions = data?.transactionsFromUser.transactions ?? [];
  const quantity = data?.transactionsFromUser.quantity ?? 0;
  const errorMessage = error
    ? error.message || "Failed to load transactions"
    : null;

  const hasPrevious = page > 1;
  const hasNext = quantity === PAGE_SIZE;

  function buildFullName({ firstName, lastName }: TransactionUser) {
    return [firstName, lastName].join(" ");
  }

  function transactionNature(transaction: Transaction): "outcome" | "income" {
    if (transaction.senderUser.id === user!.id) return "outcome";
    return "income";
  }

  function buildTransactionDetails(transaction: Transaction) {
    if (transactionNature(transaction) === "outcome") {
      return `Transaction sent to ${buildFullName(transaction.receiverUser)}`;
    }

    return `Transaction received from ${buildFullName(transaction.senderUser)}`;
  }

  return (
    <Table>
      <TableCaption>A list of your recent transactions.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]"></TableHead>
          <TableHead>Details</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="text-center">
              Loading transactions…
            </TableCell>
          </TableRow>
        )}
        {!loading && errorMessage && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="text-center">
              <div className="flex items-center justify-center gap-x-2">
                <span>{errorMessage}</span>
                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            </TableCell>
          </TableRow>
        )}
        {!loading && !errorMessage && transactions.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="text-center">
              No transactions yet.
            </TableCell>
          </TableRow>
        )}
        {!loading &&
          !errorMessage &&
          transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="font-medium">
                {transactionNature(transaction) === "outcome" ? (
                  <ChevronDown className="text-red-500" />
                ) : (
                  <ChevronUp className="text-green-500" />
                )}
              </TableCell>
              <TableCell>{buildTransactionDetails(transaction)}</TableCell>
              <TableCell className="text-right">
                {formatMoney(transaction.amount)}
              </TableCell>
              <TableCell>{capitalize(transaction.status)}</TableCell>
              <TableCell>
                {new Date(transaction.processedAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT}>
            <div className="flex items-center justify-center gap-x-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasPrevious || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasNext || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
