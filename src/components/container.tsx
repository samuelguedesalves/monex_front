import { cn } from "@/lib/utils";

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("w-full max-w-4xl mx-auto px-4", className)} {...props} />
}