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
  CheckCircle2,
  Loader,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import {
  getUserByEmail,
  createTransaction,
  type TransferRecipient,
} from "@/services/transaction";
import { formatMoney } from "@/lib/numberFormatter";
import { toast } from "sonner";

const DONE_STEP_ID = 4;
const steps = [
  { id: 1, name: "Set Account" },
  { id: 2, name: "Set Value" },
  { id: 3, name: "Confirm" },
  { id: DONE_STEP_ID, name: "Done" },
] as const;

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

  function reset() {
    setCurrentStep(steps[0].id);
    setRecipient(null);
    setAmount("");
  }

  function handleOpenChange(nextOpen: boolean) {
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
              {step.id === currentStep && currentStep != DONE_STEP_ID && (
                <Circle />
              )}
              {(step.id < currentStep || currentStep == DONE_STEP_ID) && (
                <CircleCheck />
              )}
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
            goNext={() => setCurrentStep(4)}
            goPrevious={() => setCurrentStep(2)}
            onTransferComplete={onTransferComplete}
          />
        )}
        {currentStep === 4 && (
          <Success
            recipient={recipient!}
            amount={amount}
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
  const { token } = useAuth();
  const form = useForm<findUserFormData>({
    resolver: zodResolver(findUserFormSchema),
    defaultValues: {
      accountEmail: "",
    },
  });

  const onSubmit: SubmitHandler<findUserFormData> = async (data) => {
    try {
      const user = await getUserByEmail(data.accountEmail, token!);
      if (!user) {
        throw new Error(
          "[NewTransferModal / SearchAccount] error to retrieve receiver user data",
        );
        return;
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
  onTransferComplete,
}: {
  recipient: TransferRecipient;
  amount: string;
  goNext: VoidFunction;
  goPrevious: VoidFunction;
  onTransferComplete?: VoidFunction;
}) {
  const { token, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      const amountInCents = Math.round(Number(amount) * 100);
      await createTransaction(
        { amount: amountInCents, userId: recipient.id },
        token!,
      );
      // Transaction settlement happens async on the backend (Oban worker), so
      // this may briefly show the pre-transfer balance under load.
      await refreshUser();
      onTransferComplete?.();
      goNext();
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

// Success

function Success({
  recipient,
  amount,
  onDone,
}: {
  recipient: TransferRecipient;
  amount: string;
  onDone: VoidFunction;
}) {
  return (
    <div className="grid grid-cols-1 gap-y-4">
      <div className="flex flex-col items-center gap-y-2 text-center">
        <CheckCircle2 className="size-10 text-primary" />
        <p className="text-base leading-none font-medium">Transfer complete</p>
        <p className="text-muted-foreground">
          {formatMoney(Math.round(Number(amount) * 100))} sent to{" "}
          {recipient.firstName} {recipient.lastName}.
        </p>
      </div>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
