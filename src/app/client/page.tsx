"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useBundles } from "@/lib/derived";
import type { Greenhouse, Payment, Visit } from "@/lib/types";
import { addDays, fmtDate, fmtShort, fmtTime, fmtWeek, mondayOf, today, weekRange } from "@/lib/dates";
import { fmtPhone, METHOD_LABEL, num, rub, STATUS_LABEL, VISIT_LABEL } from "@/lib/format";
import { weekStateOf } from "@/lib/billing";
import { Badge, Button, Card, cx, Empty, PageHeader, Row, SectionTitle, Textarea, Toggle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ClientForm, GreenhouseForm, PaymentForm, VisitModal } from "@/components/forms";

export default function ClientPage() {
  return (
    <Suspense fallback={null}>
      <ClientView />
    </Suspense>
  );
}

const VISIT_TONE = { planned: "blue", done: "green", missed: "red", rescheduled: "amber" } as const;

function ClientView() {
  const id = useSearchParams().get("id") || "";
  const { isAdmin, update, insert, loaded } = useStore();
  const { byId } = useBundles();
  const b = byId.get(id);
  const [edit, setEdit] = useState(false);
  const [gh, setGh] = useState<Greenhouse | undefined>();
  const [ghOpen, setGhOpen] = useState(false);
  const [pay, setPay] = useState<Payment | undefined>();
  const [payOpen, setPayOpen] = useState(false);
  const [visit, setVisit] = useState<Visit | undefined>();
  const [notes, setNotes] = useState("");

  useEffect(() => setNotes(b?.client.notes || ""), [b?.client.notes]);

  if (!b) {
    return (
      <div className="py-20 text-center text-zinc-400">
        {loaded ? "Клиент не найден" : "Загрузка…"}
        <div className="mt-3"><Link href="/clients" className="text-emerald-700">← К списку клиентов</Link></div>
      </div>
    );
  }
  const { client: c, fin } = b;
  const cw = mondayOf(today());
  const grid = weekRange(addDays(cw, -4 * 7), 12);
  const visitsSorted = [...b.visits].sort((x, y) => (y.visit_date || y.week_start).localeCompare(x.visit_date || x.week_start));

  function planWeek(w: string) {
    insert("visits", { client_id: c.id, week_start: w, visit_date: null, start_time: null, duration_min: 60, status: "planned", note: "" }, `Визит ${c.full_name}`);
  }

  return (
    <>
      <Link href="/clients" className="mb-2 inline-flex items-center text-sm text-emerald-700"><Icon name="chevronL" className="h-4 w-4" />Клиенты</Link>
      <PageHeader
        title={c.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={c.status === "active" ? "green" : "gray"}>{STATUS_LABEL[c.status]}</Badge>
            {c.pay_on_visit && <Badge tone="violet">оплата при визите</Badge>}
            {c.phone && <a href={`tel:${c.phone}`} className="text-emerald-700">{fmtPhone(c.phone)}</a>}
          </span>
        }
        actions={
          isAdmin && (
            <>
              <Button onClick={() => setEdit(true)}>Изменить</Button>
              <Button variant="primary" onClick={() => { setPay(undefined); setPayOpen(true); }}><Icon name="plus" className="h-4 w-4" />Оплата</Button>
            </>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-[13px] text-zinc-500">Плата за 4 недели</div>
          <div className="mt-1 text-[22px] font-semibold">{rub(fin.periodPrice)}</div>
          <div className="text-xs text-zinc-400">
            {c.manual_price !== null ? "ручная цена" : `${num(b.area)} м²${Number(c.discount_percent) ? ` · скидка ${c.discount_percent}%` : ""}`}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[13px] text-zinc-500">За неделю</div>
          <div className="mt-1 text-[22px] font-semibold">{rub(fin.weekPrice)}</div>
          <div className="text-xs text-zinc-400">оплачено недель: {fin.paidWeeks.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[13px] text-zinc-500">Внесено всего</div>
          <div className="mt-1 text-[22px] font-semibold text-emerald-700">{rub(fin.totalPaid)}</div>
          <div className="text-xs text-zinc-400">{fin.credit > 0 ? `аванс без недель: ${rub(fin.credit)}` : `платежей: ${b.payments.length}`}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[13px] text-zinc-500">Неоплаченная часть</div>
          <div className={cx("mt-1 text-[22px] font-semibold", fin.debt > 0 && "text-red-600")}>{rub(fin.debt)}</div>
          <div className={cx("text-xs", fin.oldDebt > 0 ? "text-red-500" : "text-zinc-400")}>
            долг прошлого сезона: {rub(fin.oldDebt)}{c.old_debt_note ? ` (${c.old_debt_note})` : ""}
          </div>
        </Card>
      </div>

      <SectionTitle>Недели обслуживания</SectionTitle>
      <Card className="p-3">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
          {grid.map((w) => {
            const info = fin.weeks.find((x) => x.week === w);
            const st = info ? weekStateOf(info.allocated, info.due) : "unpaid";
            const v = b.visits.find((x) => x.week_start === w);
            const canPlan = !v && w >= cw && (st === "paid" || c.pay_on_visit);
            return (
              <div
                key={w}
                className={cx(
                  "rounded-xl p-2 text-xs ring-1",
                  st === "paid" ? "bg-emerald-50 ring-emerald-200" : st === "partial" ? "bg-amber-50 ring-amber-200" : "bg-white ring-zinc-200",
                  w === cw && "ring-2 ring-emerald-600",
                )}
              >
                <div className="font-medium">{fmtShort(w)}</div>
                <div className={st === "paid" ? "text-emerald-700" : st === "partial" ? "text-amber-700" : "text-zinc-400"}>
                  {st === "paid" ? "оплачена" : st === "partial" ? `${rub(info!.allocated)}` : "не оплачена"}
                </div>
                {v ? (
                  <button onClick={() => setVisit(v)} className="mt-1 text-left">
                    <Badge tone={VISIT_TONE[v.status]}>{VISIT_LABEL[v.status]}</Badge>
                  </button>
                ) : canPlan ? (
                  <button onClick={() => planWeek(w)} className="mt-1 text-emerald-700 underline">в план</button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-2 px-1 text-xs text-zinc-400">Клиент попадает в планирование только после оплаты недели{c.pay_on_visit ? " (включено исключение «оплата при визите»)" : ""}.</div>
      </Card>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Данные клиента</SectionTitle>
          <Card>
            <InfoRow label="Район" value={c.district} />
            <InfoRow label="Населённый пункт" value={c.settlement} />
            <InfoRow label="Адрес / ориентир" value={c.address} />
            <InfoRow label="Удобное время" value={c.preferred_time} />
            {isAdmin && (
              <div className="px-4 py-3">
                <Toggle
                  checked={c.pay_on_visit}
                  onChange={(v) => update("clients", c.id, { pay_on_visit: v }, `Исключение «оплата при визите» ${c.full_name}`)}
                  label="Оплата при визите (планировать без предоплаты)"
                />
              </div>
            )}
          </Card>

          <SectionTitle>Заметки</SectionTitle>
          <Card className="p-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Краткая заметка по клиенту" />
            {notes !== c.notes && (
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" onClick={() => setNotes(c.notes)}>Отмена</Button>
                <Button size="sm" variant="primary" onClick={() => update("clients", c.id, { notes }, `Заметка ${c.full_name}`)}>Сохранить</Button>
              </div>
            )}
          </Card>

          <SectionTitle right={isAdmin && <Button size="sm" variant="ghost" onClick={() => { setGh(undefined); setGhOpen(true); }}>+ Теплица</Button>}>Теплицы</SectionTitle>
          <Card>
            {b.greenhouses.length === 0 && <Empty>Теплиц нет</Empty>}
            {b.greenhouses.map((g) => (
              <Row key={g.id} onClick={isAdmin ? () => { setGh(g); setGhOpen(true); } : undefined}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{g.name || "Теплица"} {g.archived && <Badge>архив</Badge>}</div>
                  <div className="truncate text-xs text-zinc-500">{g.address || "адрес клиента"}</div>
                </div>
                <div className="text-right text-sm tabular">
                  <div>{num(Number(g.area))} м² × {num(Number(g.tariff))} ₽</div>
                  <div className="text-xs text-zinc-400">{rub(Number(g.area) * Number(g.tariff))} / 4 нед.</div>
                </div>
              </Row>
            ))}
          </Card>
        </div>

        <div>
          <SectionTitle>Платежи</SectionTitle>
          <Card>
            {b.payments.length === 0 && <Empty>Платежей пока нет</Empty>}
            {b.payments.map((p) => (
              <Row key={p.id} onClick={isAdmin ? () => { setPay(p); setPayOpen(true); } : undefined}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium tabular">{rub(Number(p.amount))}</div>
                  <div className="text-xs text-zinc-500">
                    {fmtDate(p.paid_at)} · {METHOD_LABEL[p.method]}{p.received_by ? ` · принял ${p.received_by}` : ""}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {p.weeks.length ? `Недели: ${p.weeks.map(fmtShort).join(", ")}` : "Аванс без привязки к неделям"}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
              </Row>
            ))}
          </Card>

          <SectionTitle>Визиты</SectionTitle>
          <Card>
            {visitsSorted.length === 0 && <Empty>Визитов нет</Empty>}
            {visitsSorted.map((v) => (
              <Row key={v.id} onClick={() => setVisit(v)}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{v.visit_date ? `${fmtDate(v.visit_date)} ${fmtTime(v.start_time)}` : `Не расставлен (${fmtWeek(v.week_start)})`}</div>
                  {v.note && <div className="truncate text-xs text-zinc-500">{v.note}</div>}
                </div>
                <Badge tone={VISIT_TONE[v.status]}>{VISIT_LABEL[v.status]}</Badge>
              </Row>
            ))}
          </Card>
        </div>
      </div>

      <ClientForm open={edit} onClose={() => setEdit(false)} client={c} />
      <GreenhouseForm open={ghOpen} onClose={() => setGhOpen(false)} clientId={c.id} gh={gh} />
      <PaymentForm open={payOpen} onClose={() => setPayOpen(false)} clientId={c.id} payment={pay} />
      <VisitModal open={!!visit} onClose={() => setVisit(undefined)} visit={visit} />
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 px-4 py-3 text-sm last:border-0">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}
