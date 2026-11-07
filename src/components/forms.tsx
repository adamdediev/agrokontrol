"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useBundles, uniqueSorted } from "@/lib/derived";
import type { Client, Greenhouse, Payment, PayMethod, Visit, VisitStatus } from "@/lib/types";
import { addDays, fmtShort, fmtWeek, mondayOf, today, weekRange } from "@/lib/dates";
import { fmtPhone, METHOD_LABEL, num, rub, telHref, VISIT_LABEL } from "@/lib/format";
import { nextUnpaidWeek, weekStateOf } from "@/lib/billing";
import { Button, cx, Field, Input, Modal, Segmented, Select, Textarea, Toggle } from "./ui";
import { PhoneInput, phoneValue } from "./PhoneInput";

/* ------------------------------ Клиент ------------------------------ */

export function ClientForm({ open, onClose, client, onSaved }: { open: boolean; onClose: () => void; client?: Client; onSaved?: (id: string) => void }) {
  const { insert, update, data } = useStore();
  const [f, setF] = useState<Partial<Client>>({});
  const [gh, setGh] = useState({ area: "", tariff: "", address: "" });

  useEffect(() => {
    if (open) {
      setF(client ? { ...client } : { status: "active", discount_percent: 0, old_debt: 0, pay_on_visit: false });
      setGh({ area: "", tariff: "", address: "" });
    }
  }, [open, client]);

  const districts = useMemo(() => uniqueSorted(data.clients.map((c) => c.district)), [data.clients]);
  const settlements = useMemo(() => uniqueSorted(data.clients.map((c) => c.settlement)), [data.clients]);
  const set = (k: keyof Client) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!f.full_name?.trim()) return;
    const row = {
      full_name: f.full_name.trim(),
      phone: phoneValue(f.phone || ""),
      district: (f.district || "").trim(),
      settlement: (f.settlement || "").trim(),
      address: f.address || "",
      preferred_time: f.preferred_time || "",
      notes: f.notes || "",
      status: f.status || "active",
      discount_percent: Number(f.discount_percent || 0),
      manual_price: f.manual_price === null || f.manual_price === undefined || String(f.manual_price) === "" ? null : Number(f.manual_price),
      old_debt: Number(f.old_debt || 0),
      old_debt_note: f.old_debt_note || "",
      pay_on_visit: Boolean(f.pay_on_visit),
    };
    if (client) {
      update("clients", client.id, row, `Изменение клиента «${row.full_name}»`);
      onSaved?.(client.id);
    } else {
      const id = insert("clients", row, `Новый клиент «${row.full_name}»`);
      if (Number(gh.area) > 0) {
        insert("greenhouses", { client_id: id, name: "Теплица 1", area: Number(gh.area), tariff: Number(gh.tariff || 0), address: gh.address }, "Новая теплица");
      }
      onSaved?.(id);
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? "Редактировать клиента" : "Новый клиент"}
      wide
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={save} disabled={!f.full_name?.trim()}>Сохранить</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ФИО *" className="sm:col-span-2"><Input value={f.full_name || ""} onChange={set("full_name")} autoFocus /></Field>
        <Field label="Телефон"><PhoneInput value={f.phone || ""} onChange={(v) => setF((p) => ({ ...p, phone: v }))} /></Field>
        <Field label="Статус">
          <Select value={f.status || "active"} onChange={set("status")}>
            <option value="active">Активный</option>
            <option value="paused">Пауза</option>
            <option value="archived">Архив</option>
          </Select>
        </Field>
        <Field label="Район"><Input list="dl-districts" value={f.district || ""} onChange={set("district")} /></Field>
        <Field label="Населённый пункт"><Input list="dl-settlements" value={f.settlement || ""} onChange={set("settlement")} /></Field>
        <Field label="Адрес / ориентир" className="sm:col-span-2"><Input value={f.address || ""} onChange={set("address")} /></Field>
        <Field label="Удобное время"><Input value={f.preferred_time || ""} onChange={set("preferred_time")} placeholder="например, после 14:00" /></Field>
        <Field label="Скидка, %"><Input type="number" min={0} max={100} step="0.1" value={f.discount_percent ?? 0} onChange={set("discount_percent")} /></Field>
        <Field label="Ручная цена за 4 недели, ₽" hint="Если заполнено — заменяет расчёт по теплицам"><Input type="number" min={0} value={f.manual_price ?? ""} onChange={set("manual_price")} /></Field>
        <Field label="Долг прошлого сезона, ₽"><Input type="number" min={0} value={f.old_debt ?? 0} onChange={set("old_debt")} /></Field>
        <Field label="Комментарий к старому долгу" className="sm:col-span-2"><Input value={f.old_debt_note || ""} onChange={set("old_debt_note")} /></Field>
        <Field label="Примечания" className="sm:col-span-2"><Textarea value={f.notes || ""} onChange={set("notes")} /></Field>
        <div className="sm:col-span-2 rounded-xl bg-zinc-50 p-3">
          <Toggle checked={Boolean(f.pay_on_visit)} onChange={(v) => setF((p) => ({ ...p, pay_on_visit: v }))} label="Исключение «оплата при визите» — планировать без предоплаты" />
        </div>
        {!client && (
          <div className="sm:col-span-2 grid gap-3 rounded-xl bg-emerald-50/50 p-3 sm:grid-cols-3">
            <div className="text-sm font-medium sm:col-span-3">Первая теплица (можно добавить позже)</div>
            <Field label="Площадь, м²"><Input type="number" min={0} value={gh.area} onChange={(e) => setGh({ ...gh, area: e.target.value })} /></Field>
            <Field label="Тариф, ₽/м²"><Input type="number" min={0} step="0.01" value={gh.tariff} onChange={(e) => setGh({ ...gh, tariff: e.target.value })} /></Field>
            <Field label="Адрес теплицы"><Input value={gh.address} onChange={(e) => setGh({ ...gh, address: e.target.value })} /></Field>
          </div>
        )}
      </div>
      <datalist id="dl-districts">{districts.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="dl-settlements">{settlements.map((d) => <option key={d} value={d} />)}</datalist>
    </Modal>
  );
}

/* ------------------------------ Теплица ------------------------------ */

export function GreenhouseForm({ open, onClose, clientId, gh }: { open: boolean; onClose: () => void; clientId: string; gh?: Greenhouse }) {
  const { insert, update, remove } = useStore();
  const [f, setF] = useState({ name: "", area: "", tariff: "", address: "", archived: false });
  useEffect(() => {
    if (open) setF(gh ? { name: gh.name, area: String(gh.area), tariff: String(gh.tariff), address: gh.address, archived: gh.archived } : { name: "", area: "", tariff: "", address: "", archived: false });
  }, [open, gh]);
  const total = Number(f.area || 0) * Number(f.tariff || 0);
  function save() {
    const row = { name: f.name, area: Number(f.area || 0), tariff: Number(f.tariff || 0), address: f.address, archived: f.archived };
    if (gh) update("greenhouses", gh.id, row, `Изменение теплицы «${f.name}»`);
    else insert("greenhouses", { ...row, client_id: clientId }, `Новая теплица «${f.name}»`);
    onClose();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={gh ? "Теплица" : "Новая теплица"}
      footer={
        <>
          {gh && (
            <Button variant="danger" className="mr-auto" onClick={() => { if (confirm("Удалить теплицу?")) { remove("greenhouses", gh.id, "Удаление теплицы"); onClose(); } }}>
              Удалить
            </Button>
          )}
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={save}>Сохранить</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Название" className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="Теплица 1" /></Field>
        <Field label="Площадь, м²"><Input type="number" min={0} value={f.area} onChange={(e) => setF((p) => ({ ...p, area: e.target.value }))} /></Field>
        <Field label="Тариф, ₽/м² за 4 недели"><Input type="number" min={0} step="0.01" value={f.tariff} onChange={(e) => setF((p) => ({ ...p, tariff: e.target.value }))} /></Field>
        <Field label="Адрес" className="sm:col-span-2"><Input value={f.address} onChange={(e) => setF((p) => ({ ...p, address: e.target.value }))} /></Field>
        <div className="sm:col-span-2 rounded-xl bg-zinc-50 p-3 text-sm">
          {num(Number(f.area || 0))} м² × {num(Number(f.tariff || 0))} ₽ = <b>{rub(total)}</b> за 4 недели · {rub(total / 4)} в неделю
        </div>
        <div className="sm:col-span-2"><Toggle checked={f.archived} onChange={(v) => setF((p) => ({ ...p, archived: v }))} label="В архиве (не учитывается в расчёте)" /></div>
      </div>
    </Modal>
  );
}

/* ------------------------------ Платёж ------------------------------ */

export function PaymentForm({ open, onClose, clientId, payment }: { open: boolean; onClose: () => void; clientId?: string; payment?: Payment }) {
  const { insert, update, remove, me } = useStore();
  const { list, byId } = useBundles();
  const [cid, setCid] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [receivedBy, setReceivedBy] = useState("");
  const [weeks, setWeeks] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");

  const bundle = cid ? byId.get(cid) : undefined;
  const wp = bundle?.fin.weekPrice || 0;

  useEffect(() => {
    if (!open) return;
    if (payment) {
      setCid(payment.client_id);
      setPaidAt(payment.paid_at);
      setAmount(String(payment.amount));
      setAmountTouched(true);
      setMethod(payment.method);
      setReceivedBy(payment.received_by);
      setWeeks([...payment.weeks]);
      setNote(payment.note);
    } else {
      setCid(clientId || "");
      setPaidAt(today());
      setAmount("");
      setAmountTouched(false);
      setMethod("cash");
      setReceivedBy(me?.full_name || "");
      setWeeks([]);
      setNote("");
      setSearch("");
    }
  }, [open, payment, clientId, me]);

  // при выборе клиента предлагаем 1 неделю — первую неоплаченную
  useEffect(() => {
    if (open && !payment && bundle && weeks.length === 0) setWeeks([nextUnpaidWeek(bundle.fin, paidAt)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, open]);

  useEffect(() => {
    if (!amountTouched) setAmount(weeks.length ? String(Math.round(wp * weeks.length * 100) / 100) : "");
  }, [weeks, wp, amountTouched]);

  const startWeek = mondayOf(addDays(paidAt, -28));
  const options = weekRange(startWeek, 16);

  function quick(n: number) {
    if (!bundle) return;
    const first = nextUnpaidWeek(bundle.fin, paidAt);
    setWeeks(weekRange(first, n));
    setAmountTouched(false);
  }

  function toggleWeek(w: string) {
    setWeeks((ws) => (ws.includes(w) ? ws.filter((x) => x !== w) : [...ws, w].sort()));
  }

  const total = Number(amount || 0);
  const due = wp * weeks.length;
  const kind = weeks.length === 0 ? "Аванс без привязки к неделям" : total < due - 0.5 ? `Частичная оплата: не хватает ${rub(due - total)}` : weeks[0] > mondayOf(today()) ? "Предоплата" : "Полная оплата";

  function save() {
    if (!cid || !(total > 0)) return;
    const row = { client_id: cid, paid_at: paidAt, amount: total, method, received_by: receivedBy, weeks, note };
    const name = byId.get(cid)?.client.full_name || "";
    if (payment) update("payments", payment.id, row, `Исправление платежа ${name}`);
    else insert("payments", row, `Платёж ${name} ${rub(total)}`);
    onClose();
  }

  const filtered = list.filter((b) => b.client.status !== "archived" && (!search || b.client.full_name.toLowerCase().includes(search.toLowerCase()) || b.client.phone.includes(search)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={payment ? "Исправить платёж" : "Внести оплату"}
      wide
      footer={
        <>
          {payment && (
            <Button variant="danger" className="mr-auto" onClick={() => { if (confirm("Удалить платёж? Действие попадёт в журнал.")) { remove("payments", payment.id, "Удаление платежа"); onClose(); } }}>
              Удалить
            </Button>
          )}
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={save} disabled={!cid || !(total > 0)}>Сохранить</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!clientId && !payment ? (
          <Field label="Клиент">
            {bundle ? (
              <div className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2.5">
                <span className="font-medium">{bundle.client.full_name}</span>
                <button className="text-sm text-emerald-700" onClick={() => { setCid(""); setWeeks([]); }}>Изменить</button>
              </div>
            ) : (
              <div>
                <Input placeholder="Поиск по имени или телефону" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl ring-1 ring-zinc-100">
                  {filtered.slice(0, 50).map((b) => (
                    <button key={b.client.id} onClick={() => setCid(b.client.id)} className="flex w-full justify-between border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-50">
                      <span>{b.client.full_name}</span>
                      <span className="text-zinc-400">{b.client.settlement}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>
        ) : (
          bundle && <div className="text-sm text-zinc-500">Клиент: <b className="text-zinc-900">{bundle.client.full_name}</b></div>
        )}

        {bundle && (
          <div className="rounded-xl bg-zinc-50 p-3 text-sm">
            За 4 недели: <b>{rub(bundle.fin.periodPrice)}</b> · за неделю: <b>{rub(wp)}</b>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Дата оплаты"><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
          <Field label="Сумма, ₽"><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }} /></Field>
          <Field label="Кто принял"><Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></Field>
        </div>

        <Field label="Способ">
          <Segmented value={method} onChange={setMethod} options={[{ value: "cash", label: METHOD_LABEL.cash }, { value: "card", label: METHOD_LABEL.card }]} />
        </Field>

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-zinc-600">За какие недели</span>
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => quick(1)} disabled={!bundle}>1 неделя</Button>
              <Button size="sm" onClick={() => quick(4)} disabled={!bundle}>4 недели</Button>
              <Button size="sm" onClick={() => { setWeeks([]); setAmountTouched(true); }}>Аванс</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {options.map((w) => {
              const alloc = bundle?.fin.weeks.find((x) => x.week === w);
              const st = alloc && !payment ? weekStateOf(alloc.allocated, alloc.due) : null;
              const sel = weeks.includes(w);
              return (
                <button
                  key={w}
                  onClick={() => toggleWeek(w)}
                  className={cx(
                    "rounded-lg px-2 py-1.5 text-left text-xs ring-1 transition",
                    sel ? "bg-emerald-700 text-white ring-emerald-700" : "bg-white ring-zinc-200 hover:ring-emerald-400",
                    w === mondayOf(today()) && !sel && "ring-2 ring-emerald-300",
                  )}
                >
                  {fmtWeek(w)}
                  {st === "paid" && <span className={cx("block", sel ? "text-emerald-100" : "text-emerald-600")}>оплачена</span>}
                  {st === "partial" && <span className={cx("block", sel ? "text-amber-100" : "text-amber-600")}>частично</span>}
                </button>
              );
            })}
          </div>
          <div className={cx("mt-2 text-sm", kind.startsWith("Частичная") ? "text-amber-700" : "text-zinc-500")}>
            {kind}
            {weeks.length > 0 && ` · недель: ${weeks.length} · к оплате ${rub(due)}`}
          </div>
        </div>

        <Field label="Примечание"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ Визит ------------------------------ */

export function VisitModal({ open, onClose, visit }: { open: boolean; onClose: () => void; visit?: Visit }) {
  const { update, remove } = useStore();
  const { byId } = useBundles();
  const [f, setF] = useState({ visit_date: "", start_time: "", duration_min: 60, status: "planned" as VisitStatus, note: "" });
  useEffect(() => {
    if (open && visit)
      setF({ visit_date: visit.visit_date || "", start_time: (visit.start_time || "").slice(0, 5), duration_min: visit.duration_min, status: visit.status, note: visit.note });
  }, [open, visit]);
  if (!visit) return null;
  const b = byId.get(visit.client_id);

  function save() {
    if (!visit) return;
    let status = f.status;
    const moved = (visit.visit_date && f.visit_date && f.visit_date !== visit.visit_date) || (visit.start_time && f.start_time && f.start_time !== visit.start_time.slice(0, 5));
    if (moved && status === "planned" && visit.visit_date) status = "rescheduled";
    update(
      "visits",
      visit.id,
      { visit_date: f.visit_date || null, start_time: f.start_time ? f.start_time + ":00" : null, duration_min: Number(f.duration_min), status, note: f.note },
      `Визит ${b?.client.full_name || ""}`,
    );
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={b?.client.full_name || "Визит"}
      footer={
        <>
          <Button variant="danger" className="mr-auto" onClick={() => { if (confirm("Удалить визит из графика?")) { remove("visits", visit.id, "Удаление визита"); onClose(); } }}>
            Удалить
          </Button>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={save}>Сохранить</Button>
        </>
      }
    >
      <div className="space-y-3">
        {b && (
          <div className="rounded-xl bg-zinc-50 p-3 text-sm">
            <div>{[b.client.district, b.client.settlement, b.client.address].filter(Boolean).join(", ") || "Адрес не указан"}</div>
            {b.client.phone && <a href={telHref(b.client.phone)} className="text-emerald-700">{fmtPhone(b.client.phone)}</a>}
            {b.client.preferred_time && <div className="text-zinc-500">Удобно: {b.client.preferred_time}</div>}
            <div className="mt-1 text-zinc-500">Неделя обслуживания: {fmtWeek(visit.week_start)} · {b.area} м²</div>
          </div>
        )}
        <Field label="Статус">
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(VISIT_LABEL) as VisitStatus[]).map((s) => (
              <button key={s} onClick={() => setF((p) => ({ ...p, status: s }))} className={cx("rounded-xl px-3 py-2 text-sm ring-1", f.status === s ? "bg-emerald-700 text-white ring-emerald-700" : "ring-zinc-200")}>
                {VISIT_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Дата"><Input type="date" value={f.visit_date} min={visit.week_start} onChange={(e) => setF((p) => ({ ...p, visit_date: e.target.value }))} /></Field>
          <Field label="Время"><Input type="time" value={f.start_time} onChange={(e) => setF((p) => ({ ...p, start_time: e.target.value }))} /></Field>
          <Field label="Минут"><Input type="number" min={5} step={5} value={f.duration_min} onChange={(e) => setF((p) => ({ ...p, duration_min: Number(e.target.value) }))} /></Field>
        </div>
        <Field label="Заметка по визиту"><Textarea rows={3} value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} placeholder="Что сделано, что заметили…" /></Field>
        {visit.visit_date && f.visit_date && f.visit_date !== visit.visit_date && <div className="text-xs text-zinc-500">Перенос с {fmtShort(visit.visit_date)} — статус станет «Перенесён».</div>}
      </div>
    </Modal>
  );
}
