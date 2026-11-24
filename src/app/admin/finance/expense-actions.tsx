"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { newExpenseCategories } from "@/lib/admin/finance-filters";

export type Expense = {
  id: string; title: string; category: string; amount: string; effectiveAmount: string; paidDate: string;
  revision: string | null; lastCorrectionId: string | null; description: string | null; vendor: string | null; notes: string | null;
};

export function ExpenseFields({ expense, today, className }: { expense?: Expense; today: string; className: string }) {
  const categories = expense && !newExpenseCategories.some(category => category === expense.category) ? [...newExpenseCategories, expense.category] : newExpenseCategories;
  return <>
    <label className="grid gap-1 text-sm">Title<input className={className} name="title" required maxLength={100} defaultValue={expense?.title} /></label>
    <label className="grid gap-1 text-sm">Category<select className={className} name="category" defaultValue={expense?.category ?? "Rent"}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
    <label className="grid gap-1 text-sm">Amount (PHP)<input className={className} name="amount" required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" defaultValue={expense?.effectiveAmount} /></label>
    <label className="grid gap-1 text-sm">Paid date<input className={className} name="paidDate" required type="date" max={today} defaultValue={expense?.paidDate ?? today} /></label>
    <label className="grid gap-1 text-sm">Description (optional)<input className={className} name="description" maxLength={2000} defaultValue={expense?.description ?? ""} /></label>
    <label className="grid gap-1 text-sm">Vendor / payee (optional)<input className={className} name="vendor" maxLength={160} defaultValue={expense?.vendor ?? ""} /></label>
    <label className="grid gap-1 text-sm">Notes (optional)<textarea className={className} name="notes" maxLength={2000} defaultValue={expense?.notes ?? ""} /></label>
  </>;
}

export function ExpenseActions({ expense, today, inputClass, onSaved }: { expense: Expense; today: string; inputClass: string; onSaved: (deleted: boolean) => void }) {
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [invalid, setInvalid] = useState(false);
  async function save(method: "PATCH" | "DELETE", values = {}) {
    if (busy) return;
    const deleted = method === "DELETE";
    setConfirm(false); setBusy(true); setMessage(""); setInvalid(false);
    try {
      const response = await fetch(`/api/ethn/admin/expenses/${expense.id}`, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, revision: expense.revision, lastCorrectionId: expense.lastCorrectionId }),
      });
      if ([400, 401, 403, 404, 409].includes(response.status)) {
        const invalid = response.status === 400;
        setInvalid(invalid);
        setMessage(response.status === 409 || response.status === 404 ? "This expense changed. Reload this page before trying again." : invalid ? "Check the expense details and try again." : "Check your access before trying again.");
        if (!invalid) toast.error(deleted ? "Expense deletion was not accepted." : "Expense edit was not accepted.");
        return;
      }
      if (!response.ok || (await response.json())?.id !== expense.id) throw new Error();
    } catch {
      setMessage("Reload this page to check the expense before retrying.");
      toast.warning(deleted ? "Could not confirm expense deletion." : "Could not confirm expense edit.");
      return;
    } finally { setBusy(false); }
    toast.success(deleted ? "Expense deleted." : "Expense updated.");
    setEdit(false); onSaved(deleted);
  }
  return <>
    <div className="flex flex-wrap gap-2">
      <Dialog open={edit} onOpenChange={open => { if (!busy) { setEdit(open); setMessage(""); } }}>
        <DialogTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>Edit<span className="sr-only"> {expense.title}</span></DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogTitle>Edit expense</DialogTitle><DialogDescription>Save new details and amount. Prior corrections stay in history but no longer affect totals.</DialogDescription>
          <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save("PATCH", Object.fromEntries(new FormData(event.currentTarget))); }}>
            <fieldset disabled={busy} className="space-y-3"><ExpenseFields expense={expense} today={today} className={inputClass} /></fieldset>
            {message && <p role={invalid ? "alert" : undefined} className="text-sm text-destructive">{message}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEdit(false)}>Cancel</Button><Button disabled={busy} type="submit">Save expense</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Button variant="destructive" size="sm" disabled={busy} onClick={() => { setMessage(""); setConfirm(true); }}>Delete<span className="sr-only"> {expense.title}</span></Button>
    </div>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Permanently delete expense?" description={`Delete “${expense.title}” and its corrections? This cannot be undone. Audit history is retained.`} onConfirm={() => void save("DELETE")} />
    {!edit && message && <p role={invalid ? "alert" : undefined} className="text-sm text-destructive">{message}</p>}
  </>;
}
