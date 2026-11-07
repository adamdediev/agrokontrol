"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useBundles } from "@/lib/derived";
import { addDays, fmtShort, fmtTime, fmtWeek, isoDow, DOW_SHORT, mondayOf, periodStart, today } from "@/lib/dates";
import { rub } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Row, SectionTitle, Stat } from "@/components/ui";

export default function Dashboard() {
  const { data, me } = useStore();
  const { list, byId } = useBundles();
  const t = today();
  const week = mondayOf(t);
  const pStart = periodStart(t, data.settings.period_anchor);
  const pEnd = addDays(pStart, 27);

  const m = useMemo(() => {
    const active = list.filter((b) => b.client.status === "active");
    const pays = data.payments.filter((p) => !p.deleted);
    const inWeek = pays.filter((p) => p.paid_at >= week && p.paid_at <= addDays(week, 6));
    const inPeriod = pays.filter((p) => p.paid_at >= pStart && p.paid_at <= pEnd);
    const sum = (l: typeof pays) => l.reduce((s, p) => s + Number(p.amount), 0);
    const weekVisits = data.visits.filter((v) => v.visit_date && v.visit_date >= week && v.visit_date <= addDays(week, 6));
    const paid = active.filter((b) => b.fin.currentWeekPaid);
    return {
      active,
      weekSum: sum(inWeek),
      periodSum: sum(inPeriod),
      cash: sum(inPeriod.filter((p) => p.method === "cash")),
      card: sum(inPeriod.filter((p) => p.method === "card")),
      debt: list.reduce((s, b) => s + b.fin.debt, 0),
      oldDebt: list.reduce((s, b) => s + b.fin.oldDebt, 0),
      paid,
      unpaid: active.filter((b) => !b.fin.currentWeekPaid),
      planned: weekVisits.filter((v) => v.status === "planned" || v.status === "rescheduled").length,
      done: weekVisits.filter((v) => v.status === "done").length,
      toPlan: list.reduce((s, b) => s + b.plan.length, 0),
    };
  }, [list, data, week, pStart, pEnd]);

  const upcoming = useMemo(
    () =>
      data.visits
        .filter((v) => v.visit_date && v.visit_date >= t && v.visit_date <= addDays(t, 13) && (v.status === "planned" || v.status === "rescheduled"))
        .sort((a, b) => (a.visit_date! + (a.start_time || "")).localeCompare(b.visit_date! + (b.start_time || "")))
        .slice(0, 12),
    [data.visits, t],
  );

  const load = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(week, i);
      if (data.settings.work_days.includes(isoDow(d))) days.push(d);
    }
    return days.map((d) => ({ d, n: data.visits.filter((v) => v.visit_date === d).length }));
  }, [data.visits, data.settings, week]);

  const districts = useMemo(() => {
    const map = new Map<string, { clients: number; paid: number; debt: number; area: number; visits: number }>();
    for (const b of list) {
      if (b.client.status === "archived") continue;
      const k = b.client.district || "Без района";
      const r = map.get(k) || { clients: 0, paid: 0, debt: 0, area: 0, visits: 0 };
      r.clients++;
      if (b.fin.currentWeekPaid) r.paid++;
      r.debt += b.fin.debt + b.fin.oldDebt;
      r.area += b.area;
      r.visits += b.visits.filter((v) => v.visit_date && v.visit_date >= week && v.visit_date <= addDays(week, 6)).length;
      map.set(k, r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [list, week]);

  return (
    <>
      <PageHeader title={`Здравствуйте${me?.full_name ? ", " + me.full_name.split(" ")[0] : ""}`} subtitle={`Неделя ${fmtWeek(week)} · период ${fmtShort(pStart)} – ${fmtShort(pEnd)}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Всего клиентов" value={m.active.length} sub={`${list.length - m.active.length} в паузе/архиве`} />
        <Stat label="Получено за неделю" value={rub(m.weekSum)} tone="green" />
        <Stat label="Получено за 4 недели" value={rub(m.periodSum)} tone="green" />
        <Stat label="Наличные / переводы" value={<span className="text-lg">{rub(m.cash)} / {rub(m.card)}</span>} sub="за текущий период" />
        <Stat label="Задолженность" value={rub(m.debt)} tone={m.debt > 0 ? "red" : undefined} sub="неоплаченные недели" />
        <Stat label="Долги прошлого сезона" value={rub(m.oldDebt)} tone={m.oldDebt > 0 ? "red" : undefined} />
        <Stat label="Оплатили / не оплатили" value={`${m.paid.length} / ${m.unpaid.length}`} sub="за текущую неделю" />
        <Stat label="Визиты недели" value={`${m.done} / ${m.planned + m.done}`} sub="выполнено / всего" />
      </div>

      {m.toPlan > 0 && (
        <Link href="/calendar" className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-700 px-4 py-3 text-white">
          <span>Ожидают планирования: {m.toPlan} оплаченных визитов</span>
          <span>Расставить →</span>
        </Link>
      )}

      <div className="grid gap-x-6 lg:grid-cols-2">
        <div>
          <SectionTitle right={<Link href="/calendar" className="text-sm text-emerald-700">Календарь</Link>}>Ближайшие посещения</SectionTitle>
          <Card>
            {upcoming.length === 0 && <Empty>Нет запланированных визитов</Empty>}
            {upcoming.map((v) => {
              const b = byId.get(v.client_id);
              return (
                <Link key={v.id} href={`/client?id=${v.client_id}`}>
                  <Row>
                    <div className="w-16 shrink-0 text-center">
                      <div className="text-xs text-zinc-400">{DOW_SHORT[isoDow(v.visit_date!) - 1]}</div>
                      <div className="text-sm font-medium">{fmtShort(v.visit_date!)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{b?.client.full_name || "—"}</div>
                      <div className="truncate text-xs text-zinc-500">{[b?.client.settlement, b?.client.address].filter(Boolean).join(", ")}</div>
                    </div>
                    <div className="text-sm tabular text-zinc-600">{fmtTime(v.start_time) || "—"}</div>
                  </Row>
                </Link>
              );
            })}
          </Card>

          <SectionTitle>Загрузка рабочих дней</SectionTitle>
          <Card className="p-4">
            {load.length === 0 && <Empty>Рабочие дни не заданы в настройках</Empty>}
            <div className="space-y-2.5">
              {load.map(({ d, n }) => {
                const pct = Math.min(100, (n / Math.max(1, data.settings.visit_limit)) * 100);
                return (
                  <div key={d} className="flex items-center gap-3 text-sm">
                    <div className="w-20 shrink-0 text-zinc-600">{DOW_SHORT[isoDow(d) - 1]}, {fmtShort(d)}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-12 text-right tabular text-zinc-500">{n}/{data.settings.visit_limit}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div>
          <SectionTitle right={<Link href="/payments" className="text-sm text-emerald-700">Платежи</Link>}>Ожидают оплаты</SectionTitle>
          <Card>
            {m.unpaid.length === 0 && <Empty>Все активные клиенты оплатили текущую неделю</Empty>}
            {m.unpaid.slice(0, 12).map((b) => (
              <Link key={b.client.id} href={`/client?id=${b.client.id}`}>
                <Row>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.client.full_name}</div>
                    <div className="truncate text-xs text-zinc-500">{b.client.settlement || b.client.district || "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm tabular">{rub(b.fin.weekPrice)}/нед</div>
                    {b.fin.debt + b.fin.oldDebt > 0 && <Badge tone="red">долг {rub(b.fin.debt + b.fin.oldDebt)}</Badge>}
                    {b.client.pay_on_visit && <Badge tone="violet">оплата при визите</Badge>}
                  </div>
                </Row>
              </Link>
            ))}
            {m.unpaid.length > 12 && <div className="px-4 py-2 text-center text-xs text-zinc-400">и ещё {m.unpaid.length - 12}</div>}
          </Card>

          <SectionTitle>Сводка по районам</SectionTitle>
          <Card className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Район</th>
                  <th>Клиенты</th>
                  <th>Оплатили</th>
                  <th>Площадь</th>
                  <th>Визиты нед.</th>
                  <th className="text-right">Долги</th>
                </tr>
              </thead>
              <tbody>
                {districts.map(([k, r]) => (
                  <tr key={k}>
                    <td className="font-medium">{k}</td>
                    <td className="tabular">{r.clients}</td>
                    <td className="tabular">{r.paid}</td>
                    <td className="tabular">{r.area.toLocaleString("ru-RU")} м²</td>
                    <td className="tabular">{r.visits}</td>
                    <td className={`text-right tabular ${r.debt > 0 ? "text-red-600" : ""}`}>{rub(r.debt)}</td>
                  </tr>
                ))}
                {districts.length === 0 && (
                  <tr>
                    <td colSpan={6}><Empty>Нет данных</Empty></td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
