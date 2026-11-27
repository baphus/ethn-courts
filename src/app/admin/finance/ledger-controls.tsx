"use client";

import { useEffect, useId, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function useLedgerSearch(initial = "") {
  const [search, setSearch] = useState(initial);
  const [q, setQuery] = useState(initial);
  useEffect(() => {
    const next = search.trim();
    if (next === q) return;
    const timer = setTimeout(() => setQuery(next), 300);
    return () => clearTimeout(timer);
  }, [search, q]);
  return { search, setSearch, q, clearSearch: () => { setSearch(""); setQuery(""); } };
}

export function LedgerControls({ name, placeholder, search, setSearch, clearSearch, filterLabel, value, options, onApply, extraFilter }: {
  name: string; placeholder: string; search: string; setSearch: (value: string) => void; clearSearch: () => void;
  filterLabel: string; value: string; options: { value: string; label: string }[]; onApply: (value: string) => void;
  extraFilter?: { label: string; value: string; options: { value: string; label: string }[]; onApply: (value: string) => void };
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [extraDraft, setExtraDraft] = useState("");
  const active = Number(!!value) + Number(!!extraFilter?.value);
  const headingId = useId();
  return <div role="group" aria-label={`${name} controls`} className="flex min-w-0 flex-wrap items-end gap-2 [&_button]:h-9 [&_button]:rounded-sm">
    <label className="grid w-full min-w-0 gap-1.5 text-sm font-medium sm:w-72">Search
      <Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={placeholder} maxLength={100} autoComplete="off" />
    </label>
    {search && <Button type="button" variant="ghost" onClick={clearSearch}>Clear search</Button>}
    <Popover open={open} onOpenChange={next => { setOpen(next); if (next) { setDraft(value); setExtraDraft(extraFilter?.value ?? ""); } }}>
      <PopoverTrigger render={<Button variant="outline" />}><Filter aria-hidden="true" /> Filter{active > 0 && ` (${active})`}</PopoverTrigger>
      <PopoverContent aria-labelledby={headingId} className="w-[min(22rem,calc(100vw-2rem))] space-y-3 p-4">
        <div className="flex items-center justify-between"><h3 id={headingId} className="font-semibold">Filter {name.toLowerCase()}</h3><Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(""); setExtraDraft(""); }}><RotateCcw aria-hidden="true" /> Reset</Button></div>
        <label className="grid gap-1 text-sm font-medium">{filterLabel}<FormSelect aria-label={filterLabel} value={draft} onValueChange={next => setDraft(next ?? "")} options={options} /></label>
        {extraFilter && <label className="grid gap-1 text-sm font-medium">{extraFilter.label}<FormSelect aria-label={extraFilter.label} value={extraDraft} onValueChange={next => setExtraDraft(next ?? "")} options={extraFilter.options} /></label>}
        <div className="border-t pt-3"><Button type="button" className="w-full" onClick={() => { onApply(draft); extraFilter?.onApply(extraDraft); setOpen(false); }}>Apply</Button></div>
      </PopoverContent>
    </Popover>
    {active > 0 && <Button type="button" variant="ghost" onClick={() => { onApply(""); extraFilter?.onApply(""); setOpen(false); }}>Clear filters</Button>}
  </div>;
}
