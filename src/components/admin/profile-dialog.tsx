"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  email: string;
  name: string | null;
}

export default function ProfileDialog({ email, name }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setValue(name ?? "");
      setFormError(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);

    if (!value.trim()) { setFormError("Enter a display name."); setBusy(false); return; }
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        if (response.status !== 400) toast.error("Display name was not updated.");
        setFormError(response.status === 400 ? "Check your display name and try again." : "Check your session and access before trying again.");
        return;
      }

      setOpen(false);
      toast.success("Display name updated.");
    } catch {
      toast.warning("Display name update could not be confirmed.");
      setFormError("Reload your profile to check your display name before retrying.");
      return;
    } finally {
      setBusy(false);
    }
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit profile" title="Edit profile">
            <Pencil />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Change the name shown in your staff portal. Your sign-in email stays the same.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              name="name"
              autoComplete="nickname"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setFormError(null);
              }}
              disabled={busy}
              required
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-email">Email address</Label>
            <Input id="profile-email" type="email" value={email} readOnly />
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
