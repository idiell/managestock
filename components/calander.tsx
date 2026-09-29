"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, isToday, startOfMonth, startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const CURRENCY = "RM"; // change to "$" if needed

type Trade = {
  id: string;
  trade_date: string;
  open_balance: number;
  close_balance: number;
  pnl: number;
  notes: string | null;
};

const money = (n: number) =>
  `${CURRENCY}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return a % 1 === 0 ? String(a) : a.toFixed(1);
};

export function TradeCalendar() {
  const [month, setMonth] = useState(new Date());
  const [trades, setTrades] = useState<Record<string, Trade>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState("");
  const [close, setClose] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [latestClose, setLatestClose] = useState<number | null>(null);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month]
  );

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .gte("trade_date", format(days[0], "yyyy-MM-dd"))
      .lte("trade_date", format(days[days.length - 1], "yyyy-MM-dd"));
    if (error) return setError(error.message);
    setTrades(Object.fromEntries((data as Trade[]).map((t) => [t.trade_date, t])));

    const { data: last, error: lastErr } = await supabase
      .from("trades")
      .select("close_balance")
      .order("trade_date", { ascending: false })
      .limit(1);
    if (lastErr) setError(lastErr.message);
    setLatestClose(last?.length ? Number(last[0].close_balance) : null);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  function openDay(date: string) {
    const t = trades[date];
    setSelected(date);
    setOpen(t ? String(t.open_balance) : "");
    setClose(t ? String(t.close_balance) : "");
    setNotes(t?.notes ?? "");
    setError("");
  }

  const preview = open !== "" && close !== "" ? Number(close) - Number(open) : null;

  async function save() {
    if (!selected || open === "" || close === "") return setError("Enter both open and close.");
    setSaving(true);
    const { error } = await supabase.from("trades").upsert(
      {
        trade_date: selected,
        open_balance: Number(open),
        close_balance: Number(close),
        notes: notes || null,
      },
      { onConflict: "trade_date" }
    );
    setSaving(false);
    if (error) return setError(error.message);
    setSelected(null);
    load();
  }

  async function remove() {
    const t = selected && trades[selected];
    if (!t) return;
    const { error } = await supabase.from("trades").delete().eq("id", t.id);
    if (error) return setError(error.message);
    setSelected(null);
    load();
  }

  const monthTrades = Object.values(trades).filter((t) =>
    isSameMonth(new Date(t.trade_date + "T00:00:00"), month)
  );
  const newest = Object.values(trades).sort((a, b) => b.trade_date.localeCompare(a.trade_date))[0];
  const closeMoney = latestClose ?? (newest ? Number(newest.close_balance) : null);
  const total = monthTrades.reduce((sum, t) => sum + Number(t.pnl), 0);
  const wins = monthTrades.filter((t) => t.pnl > 0).length;
  const losses = monthTrades.filter((t) => t.pnl < 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start sm:gap-2">
          <Button size="icon" variant="outline" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="flex-1 text-center text-lg font-semibold sm:min-w-40 sm:flex-none sm:text-xl">{format(month, "MMMM yyyy")}</h1>
          <Button size="icon" variant="outline" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={() => setMonth(new Date())}>Today</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Card><CardContent className="p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Close money (latest)</p>
          <p className="text-base font-bold sm:text-lg">
            {closeMoney === null ? "-" : `${closeMoney < 0 ? "-" : ""}${money(closeMoney)}`}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Month P/L</p>
          <p className={cn("text-base font-bold sm:text-lg", total > 0 && "text-green-600", total < 0 && "text-red-600")}>
            {total > 0 ? "+" : total < 0 ? "-" : ""}{money(total)}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Profit days</p>
          <p className="text-base font-bold sm:text-lg text-green-600">{wins}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Loss days</p>
          <p className="text-base font-bold sm:text-lg text-red-600">{losses}</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground sm:gap-1 sm:text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const t = trades[key];
          const profit = t && t.pnl > 0;
          const loss = t && t.pnl < 0;
          return (
            <button
              key={key}
              onClick={() => openDay(key)}
              className={cn(
                "flex h-16 flex-col items-start justify-between overflow-hidden rounded-md border p-1 text-left transition active:scale-95 hover:ring-2 hover:ring-ring sm:h-20 sm:p-1.5 md:h-24 md:p-2",
                !isSameMonth(day, month) && "opacity-40",
                isToday(day) && "border-primary",
                profit && "border-green-500/40 bg-green-500/15",
                loss && "border-red-500/40 bg-red-500/15"
              )}
            >
              <span className="text-xs font-medium">{format(day, "d")}</span>
              {t && (
                <span className={cn("w-full text-[11px] font-semibold leading-none sm:text-xs md:text-sm", profit && "text-green-600", loss && "text-red-600")}>
                  <span className="sm:hidden">{profit ? `+${compact(t.pnl)}` : loss ? `-${compact(t.pnl)}` : "0"}</span>
                  <span className="hidden sm:inline">{profit ? `+${money(t.pnl)}` : loss ? `-${money(t.pnl)}` : money(0)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selected && format(new Date(selected + "T00:00:00"), "EEEE, d MMMM yyyy")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="open">Open (before trade)</Label>
                <Input id="open" className="h-11 text-base" type="number" step="0.01" inputMode="decimal" value={open} onChange={(e) => setOpen(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="close">Close (after trade)</Label>
                <Input id="close" className="h-11 text-base" type="number" step="0.01" inputMode="decimal" value={close} onChange={(e) => setClose(e.target.value)} />
              </div>
            </div>
            {preview !== null && (
              <p className={cn("text-sm font-semibold", preview > 0 && "text-green-600", preview < 0 && "text-red-600")}>
                {preview > 0 ? `Profit: +${money(preview)}` : preview < 0 ? `Loss: -${money(preview)}` : "Break even"}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" className="text-base" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            {selected && trades[selected] && (
              <Button className="h-11 w-full sm:h-9 sm:w-auto" variant="destructive" onClick={remove}>Delete</Button>
            )}
            <Button className="h-11 w-full sm:h-9 sm:w-auto" onClick={save} disabled={saving}>{saving ? "Saving..." : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}