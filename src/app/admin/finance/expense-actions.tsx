"use client";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { FormSelect } from "@/components/ui/form-select";
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

export function ExpenseFields({ expense, today, disabled }: { expense?: Expense; today: string; disabled: boolean }) {
  const categories = expense && !newExpenseCategories.some(category => category === expense.category) ? [...newExpenseCategories, expense.category] : newExpenseCategories;
  return <>
    <label className="grid gap-1 text-sm">Title<Input placeholder="Court cleaning" name="title" required maxLength={100} defaultValue={expense?.title} /></label>
    <label className="grid gap-1 text-sm">Category<FormSelect disabled={disabled} aria-label="Category" name="category" defaultValue={expense?.category ?? "Rent"} options={categories.map(value => ({ value, label: value }))} /></label>
    <label className="grid gap-1 text-sm">Amount (PHP)<Input placeholder="500.00" name="amount" required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" defaultValue={expense?.effectiveAmount} /></label>
    <label className="grid gap-1 text-sm">Paid date<DateField name="paidDate" required max={today} disabled={disabled} defaultValue={expense?.paidDate ?? today} /></label>
    <label className="grid gap-1 text-sm">Description (optional)<Input placeholder="What the expense covered" name="description" maxLength={2000} defaultValue={expense?.description ?? ""} /></label>
    <label className="grid gap-1 text-sm">Vendor / payee (optional)<Input placeholder="Who received the payment" name="vendor" maxLength={160} defaultValue={expense?.vendor ?? ""} /></label>
    <label className="grid gap-1 text-sm">Notes (optional)<Textarea placeholder="Receipt details or internal notes" name="notes" maxLength={2000} defaultValue={expense?.notes ?? ""} /></label>
  </>;
}

export function ExpenseActions({ expense, today, onSaved }: { expense: Expense; today: string; onSaved: (deleted: boolean) => void }) {
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
        const code = response.status === 409 ? (await response.json()).error : null;
        setMessage(code === "EXPENSE_HAS_CORRECTIONS" ? "Expenses with corrections cannot be deleted." : response.status === 409 || response.status === 404 ? "This expense changed. Reload this page before trying again." : invalid ? "Check the expense details and try again." : "Check your access before trying again.");
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
            <fieldset disabled={busy} className="space-y-3"><ExpenseFields expense={expense} today={today} disabled={busy} /></fieldset>
            {message && <p role={invalid ? "alert" : undefined} className="text-sm text-destructive">{message}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEdit(false)}>Cancel</Button><Button disabled={busy} type="submit">Save expense</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      {expense.lastCorrectionId ? <span className="self-center text-xs text-muted-foreground">Correction history retained. Edit the amount instead.</span> : <Button variant="destructive" size="sm" disabled={busy} onClick={() => { setMessage(""); setConfirm(true); }}>Delete<span className="sr-only"> {expense.title}</span></Button>}
    </div>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Permanently delete expense?" description={`Delete “${expense.title}”? This cannot be undone. The deletion stays in the audit log.`} onConfirm={() => void save("DELETE")} />
    {!edit && message && <p role={invalid ? "alert" : undefined} className="text-sm text-destructive">{message}</p>}
  </>;
}
