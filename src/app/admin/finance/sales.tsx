"use client";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { FormSelect } from "@/components/ui/form-select";
import { useConfirm } from "@/components/ui/confirm";
import { useDashboardResource } from "@/components/admin/dashboard/dashboard-resource";
import { ResultsTable, resultsCell as cell } from "@/components/admin/results-table";
import { TablePager } from "@/components/admin/table-pager";
import { LedgerControls, useLedgerSearch } from "./ledger-controls";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FinanceInfo } from "./finance-info";
import { saleCategories, saleReceivedFields, uncategorizedSale } from "@/lib/admin/sale-details";

type Sale = { id: string; itemName: string; category: string | null; description: string | null; note: string | null; amount: string; method: string; receivedAt: string; revision: string | null };
type Pending = { url: string; body: Record<string, string | null> };
const salesUrl = "/api/ethn/admin/sales";
const storageKey = "ethn-sales-pending";
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const categories = saleCategories.map(value => ({ value, label: value }));
const categoryOptions = [{ value: "", label: "All categories" }, ...categories, { value: uncategorizedSale, label: "Uncategorized" }];
const paymentMethods = [{ value: "cash", label: "Cash" }, { value: "gcash", label: "GCash" }];

export default function Sales({ from, to, onSaved }: { from: string; to: string; onSaved?: () => void }) {
  const confirm = useConfirm();
  const saleSearch = useLedgerSearch();
  const [methodFilter, setMethodFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const filters = { from, to, category: categoryFilter, method: methodFilter, q: saleSearch.q };
  const filterKey = JSON.stringify(filters);
  const [pagination, setPagination] = useState({ key: filterKey, page: 1 });
  const page = pagination.key === filterKey ? pagination.page : 1;
  const setPage = (page: number) => setPagination({ key: filterKey, page });
  const { data, loading, error: readError, retry: retrySales } = useDashboardResource<{ rows: Sale[]; page: number; limit: number; total: number }>(`${salesUrl}?${new URLSearchParams({ ...filters, page: String(page), limit: "20" })}`);
  const previousResults = useRef<typeof data>(null);
  useEffect(() => { if (data) previousResults.current = data; }, [data]);
  const pager = data ?? (loading ? previousResults.current : null);
  useEffect(() => {
    if (loading || !data) return;
    const last = Math.min(1000, Math.max(1, Math.ceil(data.total / data.limit)));
    if (page > last) setPagination({ key: filterKey, page: last });
  }, [loading, data, page, filterKey]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ sale?: Sale; date: string; time: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const editTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const item = JSON.parse(saved) as Pending;
        if (item.url === salesUrl) setPending(item);
        else {
          sessionStorage.removeItem(storageKey);
          setMessage("Corrections are no longer available. Check the sale before making changes.");
        }
      }
      setReady(true);
    } catch { setMessage("Cannot restore sale retry details. Check the sales list before recording another."); }
  }, []);

  function openForm(sale?: Sale) {
    setMessage(""); setDirty(false);
    setForm({ sale, ...saleReceivedFields(sale ? new Date(sale.receivedAt) : undefined) });
  }

  async function save(method: "POST" | "PATCH" | "DELETE", item: Pending) {
    if (saving) return;
    const creating = method === "POST";
    if (creating) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(item)); }
      catch { setMessage("Cannot save retry details. Nothing was sent."); return; }
      setPending(item);
    }
    setSaving(true); setMessage("");
    try {
      const response = await fetch(item.url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
      if ([400, 401, 403, 404, 409].includes(response.status)) {
        if (creating && (response.status === 409 || (pending && response.status !== 400))) {
          setMessage("Check the sales list and use the same owner account before retrying this request.");
          return;
        }
        if (creating) { sessionStorage.removeItem(storageKey); setPending(null); }
        setMessage(response.status === 400 ? "Check the sale details and try again." : response.status === 404 || response.status === 409 ? "This sale changed. Close the form and reopen it before trying again." : "Check your owner access before trying again.");
        if (response.status === 404 || response.status === 409) retrySales();
        return;
      }
      if (!response.ok || typeof (await response.json())?.id !== "string") throw new Error();
    } catch {
      setMessage(creating ? "Close the form and retry the same request. Check the list before entering it again." : "Could not confirm the change. Check the sales list before trying again.");
      if (!creating) retrySales();
      return;
    } finally { setSaving(false); }
    if (creating) {
      setPending(null);
      try { sessionStorage.removeItem(storageKey); }
      catch { setMessage("Saved retry details could not be cleared. Do not enter this sale again."); }
    }
    setForm(null);
    toast.success(creating ? "Sale recorded." : method === "PATCH" ? "Sale updated." : "Sale deleted.");
    retrySales(); onSaved?.();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const fields = new FormData(event.currentTarget);
    const get = (name: string) => String(fields.get(name) ?? "");
    const received = form.sale && get("date") === form.date && get("time") === form.time ? new Date(form.sale.receivedAt) : new Date(`${get("date")}T${get("time")}:00+08:00`);
    if (!get("itemName").trim() || !get("category") || !Number.isFinite(received.getTime()) || received.getTime() > Date.now()) {
      setMessage("Enter an item name, category, and received date and time that are not in the future."); return;
    }
    const body = { itemName: get("itemName"), category: get("category"), description: get("description") || null, note: get("note") || null, amount: get("amount"), method: get("method"), receivedAt: received.toISOString() };
    if (form.sale) void save("PATCH", { url: `${salesUrl}/${form.sale.id}`, body: { ...body, revision: form.sale.revision } });
    else void save("POST", { url: salesUrl, body: { ...body, idempotencyKey: crypto.randomUUID() } });
  }

  async function remove(sale: Sale) {
    if (await confirm(`Delete “${sale.itemName}”? This removes it from finance reports and does not issue a refund.`, { title: "Delete sale?", confirmLabel: "Delete sale", destructive: true })) {
      await save("DELETE", { url: `${salesUrl}/${sale.id}`, body: { revision: sale.revision } });
    }
  }

  const busy = !ready || !!pending || saving;
  function closeForm() {
    if (saving) return;
    if (dirty && !pending) {
      void confirm("Discard unsaved sale details?", { confirmLabel: "Discard", destructive: true }).then(accepted => { if (accepted) { setForm(null); setMessage(""); } });
    } else setForm(null);
  }

  return <section id="sales" aria-label="Sales" className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
    {readError && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Sales unavailable. <Button type="button" variant="link" className="h-auto p-0" onClick={retrySales}>Retry sales list</Button></p>}
    {!form && message && <p role="status" className="text-sm text-destructive">{message}</p>}
    {pending && !form && <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>A sale may already have been saved. Retry with the same owner account.</p><Button type="button" disabled={saving} onClick={() => void save("POST", pending)}>Retry same request</Button></div>}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-2"><h2 className="font-semibold">Sales</h2><FinanceInfo label="About sales">Paid non-booking sales in the selected reporting period.</FinanceInfo></div>
      <Dialog open={!!form} onOpenChange={(open, details) => { if (open) { editTrigger.current = null; openForm(); } else { details.cancel(); closeForm(); } }}>
        <DialogTrigger render={<Button disabled={busy} />}>Add sale</DialogTrigger>
        <DialogContent finalFocus={() => editTrigger.current ?? true} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {form && <>
          <DialogTitle>{form.sale ? "Edit sale" : "Add sale"}</DialogTitle>
          <DialogDescription>{form.sale ? "Save the updated sale details." : "Record a fully paid non-booking sale."}</DialogDescription>
          <form onSubmit={submit} onChange={() => setDirty(true)} className="space-y-3">
            <fieldset disabled={busy} className="space-y-3">
              <label className="grid gap-1 text-sm">Item name<Input name="itemName" required maxLength={160} defaultValue={form.sale?.itemName} /></label>
              <label className="grid gap-1 text-sm">Category<FormSelect aria-label="Category" name="category" required disabled={busy} defaultValue={form.sale?.category ?? "Other"} onValueChange={() => setDirty(true)} options={categories} /></label>
              <label className="grid gap-1 text-sm">Amount (₱)<Input name="amount" required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" defaultValue={form.sale?.amount} /></label>
              <label className="grid gap-1 text-sm">Payment method<FormSelect aria-label="Payment method" name="method" disabled={busy} defaultValue={form.sale?.method ?? "cash"} onValueChange={() => setDirty(true)} options={paymentMethods} /></label>
              <label className="grid gap-1 text-sm">Received date (Manila)<DateField name="date" disabled={busy} required defaultValue={form.date} onValueChange={() => setDirty(true)} /></label>
              <label className="grid gap-1 text-sm">Received time (Manila)<Input name="time" type="time" required defaultValue={form.time} /></label>
              <label className="grid gap-1 text-sm">Description (optional)<Input name="description" maxLength={160} defaultValue={form.sale?.description ?? ""} /></label>
              <label className="grid gap-1 text-sm">Note (optional)<Textarea name="note" maxLength={500} defaultValue={form.sale?.note ?? ""} /></label>
              {!form.sale && <label className="flex items-start gap-2 text-sm"><input className="size-4 shrink-0 accent-primary" type="checkbox" required /> I confirm full payment was received.</label>}
            </fieldset>
            {message && <p role="status" className="text-sm text-destructive">{message}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={closeForm}>Cancel</Button><Button type="submit" disabled={busy}>Save sale</Button></div>
          </form>
          </>}
        </DialogContent>
      </Dialog>
    </div>
    <LedgerControls {...saleSearch} name="Sales" placeholder="Item name, description or note" filterLabel="Payment method" value={methodFilter} options={[{ value: "", label: "All methods" }, ...paymentMethods]} onApply={setMethodFilter} extraFilter={{ label: "Category", value: categoryFilter, options: categoryOptions, onApply: setCategoryFilter }} />
    <div className="space-y-4">
      {!readError && <ResultsTable label="Sales results table" loadingLabel="Loading sales" headers={["Sale", "Amount", "Actions"]} numeric={["Amount"]} minWidth="min-w-[32rem]" loading={loading}>
        {data?.rows.map(sale => <tr key={sale.id}>
          <th scope="row" className={`${cell} min-w-40 wrap-anywhere font-medium`}>{sale.itemName}<span className="block text-xs font-normal text-muted-foreground">{sale.category ?? "Uncategorized"} · {dateTime(sale.receivedAt)} · {sale.method === "cash" ? "Cash" : "GCash"}</span>{sale.description && <span className="block whitespace-pre-wrap font-normal">{sale.description}</span>}{sale.note && <span className="block whitespace-pre-wrap font-normal text-muted-foreground">{sale.note}</span>}</th>
          <td className={`${cell} whitespace-nowrap text-right font-medium tabular-nums`}>₱{sale.amount}</td>
          <td className={cell}><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={event => { editTrigger.current = event.currentTarget; openForm(sale); }}>Edit<span className="sr-only"> {sale.itemName}</span></Button><Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void remove(sale)}>Delete<span className="sr-only"> {sale.itemName}</span></Button></div></td>
        </tr>)}
      </ResultsTable>}
      {!loading && !readError && data?.rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{saleSearch.q || methodFilter || categoryFilter ? "No sales match your search or filters." : "No sales in this date range."}</p>}
      {!readError && pager && <div className="border-t px-3 [&_nav]:border-0"><TablePager page={pager.page} pageSize={pager.limit} total={pager.total} onPageChange={setPage} busy={loading} /></div>}
    </div>
  </section>;
}
