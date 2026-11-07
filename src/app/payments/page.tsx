"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useBundles } from "@/lib/derived";
import type { Payment } from "@/lib/types";
import { addDays, fmtDate, fmtShort, monthEnd, mondayOf, periodStart, today } from "@/lib/dates";
import { METHOD_LABEL, rub } from "@/lib/format";
import { Badge, Button, Card, Empty, Fab, Input, PageHeader, Segmented, Select, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PaymentForm } from "@/components/forms";

type Range = "week" | "period" | "month" | "all";

export default function PaymentsPage() {
  const { data, isAdmin } = useStore();
  const { byId } = useBundles();
  const [range, setRange] = useState<Range>("period");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Payment | undefined>();
  const [open, setOpen] = useState(false);

  const t = today();
  const [from, to] = useMemo(() => {
    if (range === "week") return [mondayOf(t), addDays(mondayOf(t), 6)];
    if (range === "period") {
      const s = periodStart(t, data.settings.period_anchor);
      return [s, addDays(s, 27)];
    }
    if (range === "month") return [t.slice(0, 8) + "01", monthEnd(t)];
    return ["0000-01-01", "9999-12-31"];
  }, [range, t, data.settings.period_anchor]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.payments
      .filter((p) => !p.deleted && p.paid_at >= from && p.paid_at <= to)
      .filter((p) => !method || p.method === method)
      .filter((p) => !s || (byId.get(p.client_id)?.client.full_name || "").toLowerCase().includes(s))
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at));
  }, [data.payments, from, to, method, q, byId]);

  const sum = (l: Payment[]) => l.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <PageHeader
        title="Платежи"
        subtitle={range === "all" ? "За всё время" : `${fmtShort(from)} – ${fmtShort(to)}`}
        actions={isAdmin && <Button variant="primary" className="max-md:hidden" onClick={() => { setEdit(undefined); setOpen(true); }}><Icon name="plus" className="h-4 w-4" />Внести оплату</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 [&>*]:max-sm:w-full">
        <Segmented<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: "week", label: "Неделя" },
            { value: "period", label: "4 недели" },
            { value: "month", label: "Месяц" },
            { value: "all", label: "Всё" },
          ]}
        />
        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="sm:w-auto">
          <option value="">Все способы</option>
          <option value="cash">Наличные</option>
          <option value="card">Перевод на карту</option>
        </Select>
        <Input type="search" placeholder="Поиск по клиенту" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-48" />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
        <Stat label="Итого" value={rub(sum(list))} tone="green" sub={`${list.length} платежей`} />
        <Stat label="Наличные" value={rub(sum(list.filter((p) => p.method === "cash")))} />
        <Stat label="Переводы" value={rub(sum(list.filter((p) => p.method === "card")))} />
      </div>
      {/* список на телефоне */}
      <Card className="md:hidden">
        {list.length === 0 && <Empty>Платежей за период нет</Empty>}
        {list.map((p) => (
          <button
            key={p.id}
            disabled={!isAdmin}
            onClick={() => { setEdit(p); setOpen(true); }}
            className="flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 active:bg-zinc-50 disabled:active:bg-transparent"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{byId.get(p.client_id)?.client.full_name || "—"}</div>
              <div className="truncate text-xs text-zinc-500">
                {fmtDate(p.paid_at)} · {p.weeks.length ? `недель: ${p.weeks.length}` : "аванс"}{p.received_by ? ` · ${p.received_by}` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular">{rub(Number(p.amount))}</div>
              <Badge tone={p.method === "cash" ? "gray" : "blue"}>{p.method === "cash" ? "наличные" : "перевод"}</Badge>
            </div>
          </button>
        ))}
      </Card>

      <Card className="hidden overflow-x-auto md:block">
        {list.length === 0 ? (
          <Empty>Платежей за период нет</Empty>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Клиент</th>
                <th className="text-right">Сумма</th>
                <th>Способ</th>
                <th className="hidden sm:table-cell">Недели</th>
                <th className="hidden md:table-cell">Принял</th>
                <th className="hidden lg:table-cell">Примечание</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={isAdmin ? "cursor-pointer" : ""} onClick={isAdmin ? () => { setEdit(p); setOpen(true); } : undefined}>
                  <td className="whitespace-nowrap">{fmtDate(p.paid_at)}</td>
                  <td>
                    <Link href={`/client?id=${p.client_id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-emerald-700">
                      {byId.get(p.client_id)?.client.full_name || "—"}
                    </Link>
                  </td>
                  <td className="text-right font-medium tabular">{rub(Number(p.amount))}</td>
                  <td><Badge tone={p.method === "cash" ? "gray" : "blue"}>{METHOD_LABEL[p.method]}</Badge></td>
                  <td className="hidden text-xs text-zinc-500 sm:table-cell">{p.weeks.length ? p.weeks.map(fmtShort).join(", ") : "аванс"}</td>
                  <td className="hidden text-zinc-600 md:table-cell">{p.received_by}</td>
                  <td className="hidden max-w-[200px] truncate text-zinc-500 lg:table-cell">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {isAdmin && <Fab onClick={() => { setEdit(undefined); setOpen(true); }} label="Внести оплату"><Icon name="plus" className="h-5 w-5" />Оплата</Fab>}
      <PaymentForm open={open} onClose={() => setOpen(false)} payment={edit} />
    </>
  );
}
