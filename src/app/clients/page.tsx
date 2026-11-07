"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useBundles, uniqueSorted } from "@/lib/derived";
import { addDays, mondayOf, today } from "@/lib/dates";
import { fmtPhone, num, rub, STATUS_LABEL } from "@/lib/format";
import { Badge, Button, Card, cx, Empty, Fab, Input, PageHeader, Select } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ClientForm } from "@/components/forms";

export default function ClientsPage() {
  const { isAdmin } = useStore();
  const { list } = useBundles();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [settlement, setSettlement] = useState("");
  const [pay, setPay] = useState("");
  const [sched, setSched] = useState("");
  const [status, setStatus] = useState("active");
  const [open, setOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = [district, settlement, pay, sched, status !== "active" ? "s" : ""].filter(Boolean).length;

  const week = mondayOf(today());
  const districts = useMemo(() => uniqueSorted(list.map((b) => b.client.district)), [list]);
  const settlements = useMemo(
    () => uniqueSorted(list.filter((b) => !district || b.client.district === district).map((b) => b.client.settlement)),
    [list, district],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((b) => {
      const c = b.client;
      if (status && c.status !== status) return false;
      if (district && c.district !== district) return false;
      if (settlement && c.settlement !== settlement) return false;
      if (s && ![c.full_name, c.phone, c.address, c.settlement, c.notes].some((x) => x.toLowerCase().includes(s))) return false;
      if (pay === "paid" && !b.fin.currentWeekPaid) return false;
      if (pay === "unpaid" && b.fin.currentWeekPaid) return false;
      if (pay === "debt" && b.fin.debt + b.fin.oldDebt <= 0) return false;
      if (pay === "oldDebt" && b.fin.oldDebt <= 0) return false;
      const weekVisits = b.visits.filter((v) => v.visit_date && v.visit_date >= week && v.visit_date <= addDays(week, 6));
      if (sched === "thisWeek" && weekVisits.length === 0) return false;
      if (sched === "toPlan" && b.plan.length === 0) return false;
      if (sched === "none" && b.visits.some((v) => v.visit_date && v.visit_date >= week)) return false;
      return true;
    });
  }, [list, q, district, settlement, pay, sched, status, week]);

  return (
    <>
      <PageHeader
        title="Клиенты"
        subtitle={`${filtered.length} из ${list.length}`}
        actions={isAdmin && <Button variant="primary" className="max-md:hidden" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" />Клиент</Button>}
      />
      <div className="mb-4 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input type="search" className="pl-9" placeholder="Поиск: имя, телефон, адрес" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button className="md:hidden" onClick={() => setShowFilters(!showFilters)}>
            Фильтры{activeFilters > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-700 px-1 text-[11px] text-white">{activeFilters}</span>}
          </Button>
        </div>
        <div className={cx("grid-cols-2 gap-2 md:grid md:grid-cols-5", showFilters ? "grid" : "hidden")}>
          <Select value={district} onChange={(e) => { setDistrict(e.target.value); setSettlement(""); }}>
            <option value="">Все районы</option>
            {districts.map((d) => <option key={d}>{d}</option>)}
          </Select>
          <Select value={settlement} onChange={(e) => setSettlement(e.target.value)}>
            <option value="">Все посёлки</option>
            {settlements.map((d) => <option key={d}>{d}</option>)}
          </Select>
          <Select value={pay} onChange={(e) => setPay(e.target.value)}>
            <option value="">Оплата: все</option>
            <option value="paid">Оплатили неделю</option>
            <option value="unpaid">Не оплатили неделю</option>
            <option value="debt">Есть долг</option>
            <option value="oldDebt">Долг прошлого сезона</option>
          </Select>
          <Select value={sched} onChange={(e) => setSched(e.target.value)}>
            <option value="">График: все</option>
            <option value="thisWeek">Визит на этой неделе</option>
            <option value="toPlan">Ждут планирования</option>
            <option value="none">Нет будущих визитов</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Любой статус</option>
            <option value="active">Активные</option>
            <option value="paused">Пауза</option>
            <option value="archived">Архив</option>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 && <Empty>Клиенты не найдены</Empty>}
        {/* мобильный список */}
        <div className="md:hidden">
          {filtered.map((b) => (
            <Link key={b.client.id} href={`/client?id=${b.client.id}`} className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3.5 last:border-0 active:bg-zinc-50">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.client.full_name}</div>
                <div className="truncate text-xs text-zinc-500">{[b.client.settlement, b.client.district].filter(Boolean).join(" · ") || "—"} · {num(b.area)} м²</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <PayBadge paid={b.fin.currentWeekPaid} />
                {b.fin.debt + b.fin.oldDebt > 0 && <span className="text-xs text-red-600">долг {rub(b.fin.debt + b.fin.oldDebt)}</span>}
              </div>
            </Link>
          ))}
        </div>
        {/* таблица на десктопе */}
        {filtered.length > 0 && (
          <table className="grid-table hidden md:table">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Район / посёлок</th>
                <th>Площадь</th>
                <th>За неделю</th>
                <th>Неделя</th>
                <th className="text-right">Долг</th>
                <th>График</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const next = b.visits.filter((v) => v.visit_date && v.visit_date >= today()).sort((x, y) => x.visit_date!.localeCompare(y.visit_date!))[0];
                return (
                  <tr key={b.client.id} className="cursor-pointer" onClick={() => router.push(`/client?id=${b.client.id}`)}>
                    <td>
                      <div className="font-medium">{b.client.full_name}</div>
                      <div className="text-xs text-zinc-400">{b.client.phone ? fmtPhone(b.client.phone) : ""} {b.client.status !== "active" && <Badge>{STATUS_LABEL[b.client.status]}</Badge>}</div>
                    </td>
                    <td className="text-zinc-600">{b.client.district}<div className="text-xs text-zinc-400">{b.client.settlement}</div></td>
                    <td className="tabular">{num(b.area)} м²</td>
                    <td className="tabular">{rub(b.fin.weekPrice)}</td>
                    <td><PayBadge paid={b.fin.currentWeekPaid} /> {b.client.pay_on_visit && <Badge tone="violet">при визите</Badge>}</td>
                    <td className={`text-right tabular ${b.fin.debt + b.fin.oldDebt > 0 ? "text-red-600" : "text-zinc-400"}`}>
                      {rub(b.fin.debt + b.fin.oldDebt)}
                    </td>
                    <td className="text-sm">
                      {b.plan.length > 0 ? <Badge tone="amber">ждёт плана: {b.plan.length}</Badge> : next ? <span className="text-zinc-600">{next.visit_date!.slice(8, 10)}.{next.visit_date!.slice(5, 7)}</span> : <span className="text-zinc-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {isAdmin && <Fab onClick={() => setOpen(true)} label="Новый клиент"><Icon name="plus" className="h-5 w-5" />Клиент</Fab>}
      <ClientForm open={open} onClose={() => setOpen(false)} onSaved={(id) => router.push(`/client?id=${id}`)} />
    </>
  );
}

function PayBadge({ paid }: { paid: boolean }) {
  return paid ? <Badge tone="green">оплачено</Badge> : <Badge tone="red">не оплачено</Badge>;
}
