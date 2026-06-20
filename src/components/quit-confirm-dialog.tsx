import { useAuth } from "@/contexts/auth-context";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function QuitConfirmDialog() {
  const { logout } = useAuth();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="flex items-center gap-x-2">
          Quit
          <img src="./icons/exit.svg" alt="" />
        </button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Are you sure you want to quit?</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={logout}>Yes, quit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
