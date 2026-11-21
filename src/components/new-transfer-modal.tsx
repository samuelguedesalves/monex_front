import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Controller, useForm, SubmitHandler } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CircleDashed,
  CircleCheck,
  Circle,
  CircleX,
  CheckCircle2,
  XCircle,
  Clock,
  Loader,
  Loader2,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client/react";
import {
  USER_BY_EMAIL_QUERY,
  CREATE_TRANSACTION_MUTATION,
  TRANSACTION_STATUS_QUERY,
  type TransactionStatus,
  type TransferRecipient,
} from "@/graphql/transaction";
import { formatMoney } from "@/lib/numberFormatter";
import { toast } from "sonner";

const DONE_STEP_ID = 4;
const steps = [
  { id: 1, name: "Set Account" },
  { id: 2, name: "Set Value" },
  { id: 3, name: "Confirm" },
  { id: DONE_STEP_ID, name: "Result" },
] as const;

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 15000;

type TransferOutcome = "processing" | "done" | "refused" | "unknown";

type NewTransferDialogProps = {
  onTransferComplete?: VoidFunction;
};

export function NewTransferDialog({
  onTransferComplete,
}: NewTransferDialogProps) {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(steps[0].id);
  const [recipient, setRecipient] = useState<TransferRecipient | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<TransferOutcome>("processing");

  function reset() {
    setCurrentStep(steps[0].id);
    setRecipient(null);
    setAmount("");
    setTransactionId(null);
    setOutcome("processing");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && currentStep === DONE_STEP_ID && outcome === "processing") {
      onTransferComplete?.();
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default">New Transfer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>
            Transfer credits to other account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4">
          {steps.map((step) => (
            <div className="flex flex-col items-center" key={step.id}>
              {step.id === currentStep && step.id !== DONE_STEP_ID && (
                <Circle />
              )}
              {step.id < currentStep && <CircleCheck />}
              {step.id === DONE_STEP_ID &&
                currentStep === DONE_STEP_ID &&
                (outcome === "processing" ? (
                  <Loader2 className="animate-spin" />
                ) : outcome === "done" ? (
                  <CircleCheck />
                ) : outcome === "refused" ? (
                  <CircleX className="text-destructive" />
                ) : (
                  <Circle />
                ))}
              {step.id > currentStep && <CircleDashed />}
              <p className={cn(step.id === currentStep && "font-bold")}>
                {step.name}
              </p>
            </div>
          ))}
        </div>
        <Separator />
        {currentStep === 1 && (
          <SearchAccount
            goNext={(user) => {
              setRecipient(user);
              setCurrentStep(2);
            }}
          />
        )}
        {currentStep === 2 && (
          <SetValue
            recipient={recipient!}
            goNext={(value) => {
              setAmount(value);
              setCurrentStep(3);
            }}
            goPrevious={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 3 && (
          <Confirm
            recipient={recipient!}
            amount={amount}
            goNext={(id) => {
              setTransactionId(id);
              setOutcome("processing");
              setCurrentStep(DONE_STEP_ID);
            }}
            goPrevious={() => setCurrentStep(2)}
          />
        )}
        {currentStep === DONE_STEP_ID && (
          <Result
            transactionId={transactionId!}
            recipient={recipient!}
            amount={amount}
            onOutcome={setOutcome}
            onTransferComplete={onTransferComplete}
            onRetry={() => {
              setTransactionId(null);
              setOutcome("processing");
              setCurrentStep(2);
            }}
            onDone={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Search Account

const findUserFormSchema = z.object({
  accountEmail: z.email({ error: "Invalid email" }),
});

type findUserFormData = z.infer<typeof findUserFormSchema>;

type SearchAccountProps = {
  goNext: (user: TransferRecipient) => void;
};

function SearchAccount({ goNext }: SearchAccountProps) {
  const [searchUser] = useLazyQuery<{
    userByEmail: TransferRecipient | null;
  }>(USER_BY_EMAIL_QUERY);
  const form = useForm<findUserFormData>({
    resolver: zodResolver(findUserFormSchema),
    defaultValues: {
      accountEmail: "",
    },
  });

  const onSubmit: SubmitHandler<findUserFormData> = async (data) => {
    try {
      const { data: result } = await searchUser({
        variables: { email: data.accountEmail },
      });
      const user = result?.userByEmail;
      if (!user) {
        throw new Error(
          "[NewTransferModal / SearchAccount] error to retrieve receiver user data",
        );
      }
      goNext(user);
    } catch (err) {
      console.error(err);
      form.setError("accountEmail", {
        message: "No account found with that email",
      });
    }
  };

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-2">
        <p className="text-base leading-none font-medium">
          Set transfer account
        </p>
        <p className="text-muted-foreground">
          Search receiver account by email
        </p>
      </div>
      <form
        id="new-transfer"
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-y-4"
      >
        <FieldGroup className="">
          <Controller
            name="accountEmail"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <Label htmlFor={field.name}>Account Email</Label>
                <Input {...field} />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
        <Button
          type="submit"
          className=""
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Loader className="animate-spin" />}
          {form.formState.isSubmitting ? "Loading..." : "Search"}
        </Button>
      </form>
    </div>
  );
}

// Set Value Form

const setValueFormSchema = z.object({
  value: z
    .string()
    .regex(/^\d+\.\d{2}$/, "Must be a number with decimals. Ex: 1000.00"),
});

type setValueFormData = z.infer<typeof setValueFormSchema>;

type SetValueProps = {
  recipient: TransferRecipient;
  goNext: (value: string) => void;
  goPrevious: VoidFunction;
};

function SetValue({ recipient, goNext, goPrevious }: SetValueProps) {
  const form = useForm<setValueFormData>({
    resolver: zodResolver(setValueFormSchema),
    defaultValues: {
      value: "",
    },
  });

  const onSubmit: SubmitHandler<setValueFormData> = (data) => {
    goNext(data.value);
  };

  return (
    <div className="grid grid-cols-1 gap-y-6">
      <div className="flex flex-col gap-y-2">
        <p className="text-base leading-none font-medium">Set transfer value</p>
        <p className="text-muted-foreground">
          Set a value to transfer to receiver account
        </p>
      </div>

      <div>
        <p className="font-medium text-xs mb-2">Receiver account:</p>
        <div className="bg-card ring-1 ring-foreground/10 p-2 rounded-sm">
          <p>
            {recipient.firstName} {recipient.lastName}
          </p>
          <p className="text-muted-foreground">{recipient.email}</p>
        </div>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-y-2"
      >
        <FieldGroup>
          <Controller
            name="value"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <Label htmlFor={field.name}>Transfer value</Label>
                <Input {...field} />
                <FieldDescription>
                  Transfer value should be number with decimals
                </FieldDescription>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
        <Button type="submit" disabled={!form.watch("value")}>
          Next
        </Button>
        <Button type="button" variant="secondary" onClick={goPrevious}>
          Edit Account
        </Button>
      </form>
    </div>
  );
}

// Confirm

function Confirm({
  recipient,
  amount,
  goNext,
  goPrevious,
}: {
  recipient: TransferRecipient;
  amount: string;
  goNext: (transactionId: number) => void;
  goPrevious: VoidFunction;
}) {
  const [createTransactionMutation] = useMutation<
    { createTransaction: { id: number } },
    { amount: number; userId: number }
  >(CREATE_TRANSACTION_MUTATION);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      const amountInCents = Math.round(Number(amount) * 100);
      const { data } = await createTransactionMutation({
        variables: { amount: amountInCents, userId: recipient.id },
      });
      if (!data) throw new Error("Transfer failed");
      goNext(data.createTransaction.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-y-2">
      <div className="flex flex-col gap-y-2">
        <p className="text-base leading-none font-medium">
          Confirm transfer details
        </p>
        <p className="text-muted-foreground">
          Verify transfer details, receiver account and value.
        </p>
      </div>

      <div className="flex flex-col gap-y-2">
        <div>
          <p className="font-medium text-xs mb-2">Receiver account:</p>
          <div className="bg-card ring-1 ring-foreground/10 p-2 rounded-sm">
            <p>
              {recipient.firstName} {recipient.lastName}
            </p>
            <p className="text-muted-foreground">{recipient.email}</p>
          </div>
        </div>

        <div>
          <p className="font-medium text-xs mb-2">Transfer value:</p>
          <p className="font-medium">
            {formatMoney(Math.round(Number(amount) * 100))}
          </p>
        </div>
      </div>

      <Button onClick={handleConfirm} disabled={isSubmitting}>
        Confirm
      </Button>
      <Button variant="secondary" onClick={goPrevious} disabled={isSubmitting}>
        Edit value
      </Button>
    </div>
  );
}

// Result

function Result({
  transactionId,
  recipient,
  amount,
  onOutcome,
  onTransferComplete,
  onRetry,
  onDone,
}: {
  transactionId: number;
  recipient: TransferRecipient;
  amount: string;
  onOutcome: (outcome: TransferOutcome) => void;
  onTransferComplete?: VoidFunction;
  onRetry: VoidFunction;
  onDone: VoidFunction;
}) {
  const { refreshUser } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const { data, error, stopPolling } = useQuery<
    { transaction: { id: number; status: TransactionStatus } | null },
    { id: number }
  >(TRANSACTION_STATUS_QUERY, {
    variables: { id: transactionId },
    fetchPolicy: "network-only",
    pollInterval: POLL_INTERVAL_MS,
    skip: timedOut,
  });

  const status = data?.transaction?.status;
  const outcome: TransferOutcome =
    status === "done"
      ? "done"
      : status === "refuse"
        ? "refused"
        : timedOut || error
          ? "unknown"
          : "processing";

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const notifiedRef = useRef(false);
  useEffect(() => {
    onOutcome(outcome);
    if (outcome !== "processing") stopPolling();
    if (outcome === "processing" || notifiedRef.current) return;
    notifiedRef.current = true;
    if (outcome === "done") {
      void refreshUser();
    }
    onTransferComplete?.();
  }, [outcome, onOutcome, onTransferComplete, refreshUser, stopPolling]);

  const formattedAmount = formatMoney(Math.round(Number(amount) * 100));
  const recipientName = `${recipient.firstName} ${recipient.lastName}`;

  if (outcome === "processing") {
    return (
      <div className="grid grid-cols-1 gap-y-4">
        <div className="flex flex-col items-center gap-y-2 text-center">
          <Loader2 className="size-10 animate-spin text-muted-foreground" />
          <p className="text-base leading-none font-medium">Processing…</p>
          <p className="text-muted-foreground">
            Waiting for the transfer of {formattedAmount} to {recipientName} to
            be settled.
          </p>
        </div>
        <Button onClick={onDone} variant="secondary">
          Close
        </Button>
      </div>
    );
  }

  if (outcome === "done") {
    return (
      <div className="grid grid-cols-1 gap-y-4">
        <div className="flex flex-col items-center gap-y-2 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <p className="text-base leading-none font-medium">
            Transfer complete
          </p>
          <p className="text-muted-foreground">
            {formattedAmount} sent to {recipientName}.
          </p>
        </div>
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  if (outcome === "refused") {
    return (
      <div className="grid grid-cols-1 gap-y-4">
        <div className="flex flex-col items-center gap-y-2 text-center">
          <XCircle className="size-10 text-destructive" />
          <p className="text-base leading-none font-medium">
            Transfer refused
          </p>
          <p className="text-muted-foreground">
            Insufficient balance to send {formattedAmount} to {recipientName}.
            No money was moved.
          </p>
        </div>
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="secondary" onClick={onDone}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-y-4">
      <div className="flex flex-col items-center gap-y-2 text-center">
        <Clock className="size-10 text-muted-foreground" />
        <p className="text-base leading-none font-medium">
          Still processing
        </p>
        <p className="text-muted-foreground">
          We couldn't confirm the result of this transfer yet. Check its status
          in your transactions list.
        </p>
      </div>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
