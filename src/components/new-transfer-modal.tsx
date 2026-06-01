import { Button } from "@/components/ui/button";
import {
  Dialog,
  // DialogClose,
  DialogContent,
  DialogDescription,
  // DialogFooter,
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
import { CircleDashed, CircleCheck, Circle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { cn } from "@/lib/utils";

const steps = [
  {
    id: 1,
    name: "Set Account",
  },
  {
    id: 2,
    name: "Set Value",
  },
  {
    id: 3,
    name: "Confirm",
  },
] as const;

export function NewTransferDialog() {
  const [currentStep, setCurrentStep] = useState<number>(steps[0].id);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default">New Transfer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>
            Transfer credits to other account.
          </DialogDescription>
          {/* {JSON.stringify(form.formState.errors)} */}
        </DialogHeader>
        <div className="grid grid-cols-3">
          {steps.map((step) => (
            <div className="flex flex-col items-center">
              {step.id === currentStep && <Circle />}
              {step.id < currentStep && <CircleCheck />}
              {step.id > currentStep && <CircleDashed />}
              <p className={cn(step.id === currentStep && "font-bold")}>
                {step.name}
              </p>
            </div>
          ))}
          {/* <div className="flex flex-col items-center">
            <Circle />
            <p>Set a value</p>
          </div>
          <div className="flex flex-col items-center">
            <CircleDashed />
            <p>Confirm</p>
          </div> */}
        </div>
        <Separator />
        {currentStep === 1 && (
          <SearchAccount goNext={() => setCurrentStep(2)} />
        )}
        {currentStep === 2 && (
          <SetValue
            goNext={() => setCurrentStep(3)}
            goPrevious={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 3 && (
          <Confirm goNext={() => {}} goPrevious={() => setCurrentStep(2)} />
        )}
        {/* <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit">Save changes</Button>
        </DialogFooter> */}
      </DialogContent>
    </Dialog>
  );
}

// Search Account

const findUserFormSchema = z.object({
  accountEmail: z.email({ error: "Invalid email" }),
});

type findUserFormData = z.infer<typeof findUserFormSchema>;

function SearchAccount({ goNext }: { goNext: () => void }) {
  const form = useForm<findUserFormData>({
    resolver: zodResolver(findUserFormSchema),
    defaultValues: {
      accountEmail: "",
    },
  });

  const onSubmit: SubmitHandler<findUserFormData> = () => {
    // console.log(data);
    // alert("heloooo!");
    goNext();
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
        className="grid grid-cols-4 gap-4"
      >
        <FieldGroup className="col-span-3">
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
        <Button type="submit" className="col-span-1 self-end">
          Search
        </Button>
      </form>
      <div className="grid grid-cols-1 gap-y-2">
        <dl>
          <dt>Samuel Guedes</dt>
          <dd className="text-muted-foreground">guedes.works7@gmail.com</dd>
        </dl>
        <Separator />
        <dl>
          <dt>Gabriel Guedes</dt>
          <dd className="text-muted-foreground">guedes.gabriel@gmail.com</dd>
        </dl>
        <Separator />
        <dl>
          <dt>Matheus Littig</dt>
          <dd className="text-muted-foreground">guedes.works7@gmail.com</dd>
        </dl>
      </div>
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

function SetValue({
  goNext,
  goPrevious,
}: {
  goNext: VoidFunction;
  goPrevious: VoidFunction;
}) {
  const form = useForm<setValueFormData>({
    resolver: zodResolver(setValueFormSchema),
    defaultValues: {
      value: "",
    },
  });

  const onSubmit: SubmitHandler<setValueFormData> = () => {
    // console.log(data);
    // alert("heloooo!");
    goNext();
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
          <p>Samuel Guedes</p>
          <p className="text-muted-foreground">guedes.works7@gmail.com</p>
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
        <Button type="submit">Next</Button>
        <Button type="button" variant="secondary" onClick={goPrevious}>
          Edit Account
        </Button>
      </form>
    </div>
  );
}

function Confirm({
  goNext,
  goPrevious,
}: {
  goNext: VoidFunction;
  goPrevious: VoidFunction;
}) {
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
            <p>Samuel Guedes</p>
            <p className="text-muted-foreground">guedes.works7@gmail.com</p>
          </div>
        </div>

        <div>
          <p className="font-medium text-xs mb-2">Transfer value:</p>
          <p className="font-medium">$ 200.00</p>
        </div>
      </div>

      <Button onClick={goNext}>Confirm</Button>
      <Button variant="secondary" onClick={goPrevious}>
        Edit value
      </Button>
    </div>
  );
}
