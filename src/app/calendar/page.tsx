"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useBundles, type ClientBundle } from "@/lib/derived";
import type { Visit } from "@/lib/types";
import { autoPlan, type PlanEntry } from "@/lib/billing";
import {
  addDays, DOW_FULL, DOW_SHORT, fmtShort, fmtTime, fmtWeek, isoDow, minToTime, mondayOf, monthTitle, parseISO, timeToMin, today, toISO,
} from "@/lib/dates";
import { VISIT_LABEL } from "@/lib/format";
import { Badge, Button, Card, cx, Empty, Field, Input, Modal, PageHeader, Segmented, Select } from "@/components/ui";
import { Icon } from "@/components/icons";
import { VisitModal } from "@/components/forms";

type View = "day" | "week" | "month";
const TONE = { planned: "blue", done: "green", missed: "red", rescheduled: "amber" } as const;
const BORDER = { planned: "border-l-sky-500", done: "border-l-emerald-500", missed: "border-l-red-500", rescheduled: "border-l-amber-500" } as const;

export default function CalendarPage() {
  const { data, insert, update } = useStore();
  const { list, byId } = useBundles();
  const s = data.settings;
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(today());
  const [visit, setVisit] = useState<Visit | undefined>();
  const [placing, setPlacing] = useState<{ entry?: PlanEntry; visit?: Visit } | null>(null);
  const [showPlan, setShowPlan] = useState(true);
  const [msg, setMsg] = useState("");

  const visitsByDay = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const v of data.visits) {
      if (!v.visit_date) continue;
      const a = m.get(v.visit_date) || [];
      a.push(v);
      m.set(v.visit_date, a);
    }
    for (const a of m.values()) a.sort((x, y) => (x.start_time || "99").localeCompare(y.start_time || "99"));
    return m;
  }, [data.visits]);

  const planEntries = useMemo(() => list.flatMap((b) => b.plan), [list]);
  const unscheduled = useMemo(() => data.visits.filter((v) => !v.visit_date && v.status !== "done"), [data.visits]);
  const planWeeks = useMemo(() => [...new Set([...planEntries.map((e) => e.week), ...unscheduled.map((v) => v.week_start)])].sort(), [planEntries, unscheduled]);

  function nextFreeTime(day: string): string {
    const dv = (visitsByDay.get(day) || []).filter((v) => v.start_time);
    if (!dv.length) return s.day_start;
    const last = dv[dv.length - 1];
    return minToTime(timeToMin(last.start_time!) + last.duration_min + s.travel_min);
  }

  function dropOn(day: string, payload: string) {
    const [kind, id, week] = payload.split("|");
    if (kind === "v") {
      const v = data.visits.find((x) => x.id === id);
      if (!v || v.visit_date === day) return;
      const status = v.visit_date && v.status === "planned" ? "rescheduled" : v.status;
      update("visits", v.id, { visit_date: day, start_time: v.start_time || nextFreeTime(day), status }, `Перенос визита ${byId.get(v.client_id)?.client.full_name || ""}`);
    } else if (kind === "e") {
      createVisit(id, week, day, nextFreeTime(day));
    }
  }

  function createVisit(clientId: string, week: string, day: string, time: string) {
    const count = (visitsByDay.get(day) || []).length;
    if (count >= s.visit_limit && !confirm(`На ${fmtShort(day)} уже ${count} визитов (лимит ${s.visit_limit}). Всё равно добавить?`)) return;
    insert(
      "visits",
      { client_id: clientId, week_start: week, visit_date: day, start_time: time.length === 5 ? time + ":00" : time, duration_min: s.visit_duration, status: "planned", note: "" },
      `Визит ${byId.get(clientId)?.client.full_name || ""}`,
    );
  }

  function runAutoPlan(week: string) {
    const entries = planEntries.filter((e) => e.week === week);
    const res = autoPlan(entries, week, s, data.visits, today());
    for (const p of res.placed) insert("visits", { ...p, status: "planned", note: "" }, `Автоплан ${byId.get(p.client_id)?.client.full_name || ""}`);
    setMsg(
      `Неделя ${fmtWeek(week)}: расставлено ${res.placed.length}` +
        (res.notPlaced.length ? `, не поместилось ${res.notPlaced.length} — рабочие дни прошли или заполнены; расставьте вручную` : ""),
    );
    setTimeout(() => setMsg(""), 6000);
  }

  function shift(n: number) {
    if (view === "day") setCursor(addDays(cursor, n));
    else if (view === "week") setCursor(addDays(cursor, 7 * n));
    else {
      const d = parseISO(cursor);
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
      setCursor(toISO(d));
    }
  }

  const title = view === "day" ? `${DOW_FULL[isoDow(cursor) - 1]}, ${fmtShort(cursor)}` : view === "week" ? fmtWeek(mondayOf(cursor)) : monthTitle(cursor);

  return (
    <>
      <PageHeader
        title="Календарь"
        subtitle={title}
        actions={
          <>
            <Segmented<View> value={view} onChange={setView} options={[{ value: "day", label: "День" }, { value: "week", label: "Неделя" }, { value: "month", label: "Месяц" }]} />
            <div className="flex gap-1">
              <Button size="sm" onClick={() => shift(-1)} aria-label="Назад"><Icon name="chevronL" className="h-4 w-4" /></Button>
              <Button size="sm" onClick={() => setCursor(today())}>Сегодня</Button>
              <Button size="sm" onClick={() => shift(1)} aria-label="Вперёд"><Icon name="chevronR" className="h-4 w-4" /></Button>
            </div>
            <Button size="sm" onClick={() => exportIcs(data.visits, byId)} title="Файл календаря для TickTick / Google / Apple"><Icon name="download" className="h-4 w-4" />.ics</Button>
          </>
        }
      />

      {msg && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{msg}</div>}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1">
          {view === "week" && <WeekView monday={mondayOf(cursor)} visitsByDay={visitsByDay} byId={byId} onOpen={setVisit} onDrop={dropOn} onDay={(d) => { setCursor(d); setView("day"); }} />}
          {view === "day" && <DayView day={cursor} visits={visitsByDay.get(cursor) || []} byId={byId} onOpen={setVisit} onDrop={dropOn} />}
          {view === "month" && <MonthView month={cursor} visitsByDay={visitsByDay} byId={byId} onDay={(d) => { setCursor(d); setView("day"); }} />}
        </div>

        <aside className="xl:w-80 xl:shrink-0">
          <Card className="overflow-hidden">
            <button onClick={() => setShowPlan(!showPlan)} className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="font-semibold">Ожидают планирования</span>
              <Badge tone={planEntries.length + unscheduled.length ? "amber" : "green"}>{planEntries.length + unscheduled.length}</Badge>
            </button>
            {showPlan && (
              <div className="max-h-[70vh] overflow-y-auto border-t border-zinc-100">
                {planWeeks.length === 0 && <Empty>Все оплаченные визиты расставлены</Empty>}
                {planWeeks.map((w) => {
                  const entries = planEntries.filter((e) => e.week === w);
                  const uns = unscheduled.filter((v) => v.week_start === w);
                  const groups = groupBySettlement(entries);
                  return (
                    <div key={w} className="border-b border-zinc-100 px-3 py-3 last:border-0">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{fmtWeek(w)}</span>
                        {entries.length > 0 && <Button size="sm" variant="ghost" onClick={() => runAutoPlan(w)}>Автоплан</Button>}
                      </div>
                      {groups.map(([g, es]) => (
                        <div key={g} className="mb-2">
                          <div className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-zinc-400"><Icon name="pin" className="h-3 w-3" />{g}</div>
                          {es.map((e) => (
                            <div
                              key={e.client.id + e.week}
                              draggable
                              onDragStart={(ev) => ev.dataTransfer.setData("text/plain", `e|${e.client.id}|${e.week}`)}
                              onClick={() => setPlacing({ entry: e })}
                              className="mb-1 flex cursor-grab items-center justify-between rounded-lg bg-zinc-50 px-2.5 py-1.5 text-sm hover:bg-emerald-50"
                            >
                              <span className="truncate">{e.client.full_name}</span>
                              {e.reason === "pay_on_visit" && <Badge tone="violet">при визите</Badge>}
                            </div>
                          ))}
                        </div>
                      ))}
                      {uns.map((v) => (
                        <div
                          key={v.id}
                          draggable
                          onDragStart={(ev) => ev.dataTransfer.setData("text/plain", `v|${v.id}`)}
                          onClick={() => setPlacing({ visit: v })}
                          className="mb-1 flex cursor-grab items-center justify-between rounded-lg bg-sky-50 px-2.5 py-1.5 text-sm"
                        >
                          <span className="truncate">{byId.get(v.client_id)?.client.full_name}</span>
                          <Badge tone="blue">без даты</Badge>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div className="px-4 pb-3 text-xs text-zinc-400">Перетащите клиента на день или нажмите, чтобы выбрать дату. Без оплаты клиенты сюда не попадают.</div>
              </div>
            )}
          </Card>
        </aside>
      </div>

      <VisitModal open={!!visit} onClose={() => setVisit(undefined)} visit={visit ? data.visits.find((v) => v.id === visit.id) : undefined} />
      <PlaceModal
        target={placing}
        onClose={() => setPlacing(null)}
        nextFreeTime={nextFreeTime}
        visitsByDay={visitsByDay}
        onSave={(day, time) => {
          if (placing?.entry) createVisit(placing.entry.client.id, placing.entry.week, day, time);
          else if (placing?.visit) update("visits", placing.visit.id, { visit_date: day, start_time: time + ":00" }, "Расстановка визита");
          setPlacing(null);
        }}
      />
    </>
  );
}

function groupBySettlement(entries: PlanEntry[]): [string, PlanEntry[]][] {
  const m = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    const k = [e.client.district, e.client.settlement].filter(Boolean).join(" · ") || "Без адреса";
    m.set(k, [...(m.get(k) || []), e]);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
}

function useDropZone(day: string, onDrop: (day: string, payload: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); onDrop(day, e.dataTransfer.getData("text/plain")); },
    },
  };
}

function VisitChip({ v, b, onOpen, showAddr }: { v: Visit; b?: ClientBundle; onOpen: (v: Visit) => void; showAddr?: boolean }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", `v|${v.id}`)}
      onClick={() => onOpen(v)}
      className={cx("cursor-pointer rounded-lg border-l-[3px] bg-white px-2 py-1.5 text-xs shadow-sm ring-1 ring-black/5 hover:ring-emerald-300", BORDER[v.status], v.status === "missed" && "opacity-60")}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium tabular">{fmtTime(v.start_time) || "—"}</span>
        {v.status !== "planned" && <span className="text-[10px] text-zinc-400">{VISIT_LABEL[v.status]}</span>}
      </div>
      <div className="truncate text-[13px]">{b?.client.full_name || "—"}</div>
      {showAddr !== false && <div className="truncate text-zinc-400">{b?.client.settlement}</div>}
    </div>
  );
}

function WeekDay({ day, visits, byId, onOpen, onDrop, onDay }: { day: string; visits: Visit[]; byId: Map<string, ClientBundle>; onOpen: (v: Visit) => void; onDrop: (d: string, p: string) => void; onDay: (d: string) => void }) {
  const { data } = useStore();
  const s = data.settings;
  const work = s.work_days.includes(isoDow(day));
  const dz = useDropZone(day, onDrop);
  const isToday = day === today();
  const full = visits.length >= s.visit_limit;
  return (
    <div {...dz.props} className={cx("flex min-h-[140px] flex-col rounded-2xl p-2 ring-1 transition", work ? "bg-white ring-black/5" : "bg-zinc-100/60 ring-transparent", dz.over && "ring-2 ring-emerald-500")}>
      <button onClick={() => onDay(day)} className="mb-2 flex items-center justify-between px-1 text-left">
        <span className={cx("text-sm", isToday ? "font-bold text-emerald-700" : "font-medium")}>{DOW_SHORT[isoDow(day) - 1]} {fmtShort(day)}</span>
        {work && <span className={cx("text-[11px] tabular", full ? "text-red-500" : "text-zinc-400")}>{visits.length}/{s.visit_limit}</span>}
      </button>
      <div className="flex flex-1 flex-col gap-1">
        {visits.map((v) => <VisitChip key={v.id} v={v} b={byId.get(v.client_id)} onOpen={onOpen} />)}
        {!visits.length && !work && <div className="px-1 text-[11px] text-zinc-400">выходной</div>}
      </div>
    </div>
  );
}

function WeekView({ monday, visitsByDay, byId, onOpen, onDrop, onDay }: { monday: string; visitsByDay: Map<string, Visit[]>; byId: Map<string, ClientBundle>; onOpen: (v: Visit) => void; onDrop: (d: string, p: string) => void; onDay: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      {days.map((d) => <WeekDay key={d} day={d} visits={visitsByDay.get(d) || []} byId={byId} onOpen={onOpen} onDrop={onDrop} onDay={onDay} />)}
    </div>
  );
}

function DayView({ day, visits, byId, onOpen, onDrop }: { day: string; visits: Visit[]; byId: Map<string, ClientBundle>; onOpen: (v: Visit) => void; onDrop: (d: string, p: string) => void }) {
  const { data, update } = useStore();
  const s = data.settings;
  const dz = useDropZone(day, onDrop);
  const work = s.work_days.includes(isoDow(day));
  const totalMin = visits.reduce((a, v) => a + v.duration_min, 0);
  return (
    <Card className={cx("p-3 transition", dz.over && "ring-2 ring-emerald-500")}>
      <div {...dz.props}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-zinc-500">
          <span>{work ? "Рабочий день" : "Нерабочий день"} · {fmtTime(s.day_start)}–{fmtTime(s.day_end)}</span>
          <span>Визитов {visits.length}/{s.visit_limit} · осмотр {Math.round(totalMin / 6) / 10} ч</span>
        </div>
        {visits.length === 0 && <Empty>На этот день визитов нет. Перетащите сюда клиента из списка ожидающих.</Empty>}
        <div className="space-y-2">
          {visits.map((v, i) => {
            const b = byId.get(v.client_id);
            const st = b?.client.settlement || "";
            const prev = visits[i - 1];
            const header = i === 0 || st !== (byId.get(prev.client_id)?.client.settlement || "");
            const gap = prev?.start_time && v.start_time ? timeToMin(v.start_time) - (timeToMin(prev.start_time) + prev.duration_min) : null;
            return (
              <div key={v.id}>
                {header && (
                  <div className="mb-1 mt-3 flex items-center gap-1 px-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <Icon name="pin" className="h-3.5 w-3.5" />{[b?.client.district, st].filter(Boolean).join(" · ") || "Без адреса"}
                    {gap !== null && i > 0 && <span className="ml-auto normal-case">дорога {gap} мин</span>}
                  </div>
                )}
                <div className={cx("flex items-center gap-3 rounded-xl border-l-4 bg-zinc-50 px-3 py-2.5", BORDER[v.status])}>
                  <div className="w-14 shrink-0 text-sm font-semibold tabular">{fmtTime(v.start_time) || "—"}</div>
                  <button onClick={() => onOpen(v)} className="min-w-0 flex-1 text-left">
                    <div className="truncate font-medium">{b?.client.full_name}</div>
                    <div className="truncate text-xs text-zinc-500">{b?.client.address || "—"} · {b?.area} м² · {v.duration_min} мин</div>
                    {v.note && <div className="truncate text-xs text-zinc-400">📝 {v.note}</div>}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={TONE[v.status]} className="hidden sm:inline-flex">{VISIT_LABEL[v.status]}</Badge>
                    {v.status !== "done" && (
                      <button title="Посещён" onClick={() => update("visits", v.id, { status: "done" }, "Отметка визита")} className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700">✓</button>
                    )}
                    {v.status !== "missed" && v.status !== "done" && (
                      <button title="Не посещён" onClick={() => update("visits", v.id, { status: "missed" }, "Отметка визита")} className="grid h-8 w-8 place-items-center rounded-full bg-red-50 text-red-500">✕</button>
                    )}
                    {b?.client.phone && <a href={`tel:${b.client.phone}`} className="grid h-8 w-8 place-items-center rounded-full bg-zinc-200 text-zinc-600" title="Позвонить">☎</a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function MonthView({ month, visitsByDay, byId, onDay }: { month: string; visitsByDay: Map<string, Visit[]>; byId: Map<string, ClientBundle>; onDay: (d: string) => void }) {
  const { data } = useStore();
  const first = month.slice(0, 8) + "01";
  const start = mondayOf(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const m = first.slice(0, 7);
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-zinc-100 text-center text-xs text-zinc-400">
        {DOW_SHORT.map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const vs = visitsByDay.get(d) || [];
          const inMonth = d.slice(0, 7) === m;
          const work = data.settings.work_days.includes(isoDow(d));
          return (
            <button key={d} onClick={() => onDay(d)} className={cx("min-h-[84px] border-b border-r border-zinc-100 p-1.5 text-left align-top hover:bg-emerald-50/50", !inMonth && "bg-zinc-50/70 text-zinc-300", work && inMonth && "bg-emerald-50/20")}>
              <div className={cx("text-xs", d === today() && "font-bold text-emerald-700")}>{Number(d.slice(8))}</div>
              {vs.slice(0, 3).map((v) => (
                <div key={v.id} className={cx("mt-0.5 truncate rounded px-1 text-[11px]", { planned: "bg-sky-50 text-sky-800", done: "bg-emerald-50 text-emerald-800", missed: "bg-red-50 text-red-700", rescheduled: "bg-amber-50 text-amber-800" }[v.status])}>
                  <span className="hidden sm:inline">{fmtTime(v.start_time)} </span>{byId.get(v.client_id)?.client.full_name.split(" ")[0]}
                </div>
              ))}
              {vs.length > 3 && <div className="mt-0.5 text-[10px] text-zinc-400">+{vs.length - 3}</div>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function PlaceModal({
  target, onClose, onSave, nextFreeTime, visitsByDay,
}: {
  target: { entry?: PlanEntry; visit?: Visit } | null;
  onClose: () => void;
  onSave: (day: string, time: string) => void;
  nextFreeTime: (d: string) => string;
  visitsByDay: Map<string, Visit[]>;
}) {
  const { data } = useStore();
  const { byId } = useBundles();
  const week = target?.entry?.week || target?.visit?.week_start || mondayOf(today());
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const firstWork = days.find((d) => data.settings.work_days.includes(isoDow(d))) || days[0];
  const [day, setDay] = useState(firstWork);
  const [time, setTime] = useState("");
  const [key, setKey] = useState("");
  const k = (target?.entry?.client.id || target?.visit?.id || "") + week;
  if (target && key !== k) {
    setKey(k);
    setDay(firstWork);
    setTime(fmtTime(nextFreeTime(firstWork)));
  }
  const clientId = target?.entry?.client.id || target?.visit?.client_id || "";
  const b = byId.get(clientId);
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Запланировать визит"
      footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" onClick={() => onSave(day, time || fmtTime(data.settings.day_start))}>Запланировать</Button></>}
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-zinc-50 p-3 text-sm">
          <div className="font-medium">{b?.client.full_name}</div>
          <div className="text-zinc-500">{[b?.client.settlement, b?.client.address].filter(Boolean).join(", ")}</div>
          {b?.client.preferred_time && <div className="text-zinc-500">Удобно: {b.client.preferred_time}</div>}
          <div className="text-zinc-500">Неделя: {fmtWeek(week)}</div>
          <Link href={`/client?id=${clientId}`} className="text-emerald-700">Карточка клиента →</Link>
        </div>
        <Field label="День">
          <Select value={day} onChange={(e) => { setDay(e.target.value); setTime(fmtTime(nextFreeTime(e.target.value))); }}>
            {days.map((d) => (
              <option key={d} value={d}>
                {DOW_FULL[isoDow(d) - 1]}, {fmtShort(d)} — {(visitsByDay.get(d) || []).length}/{data.settings.visit_limit}{data.settings.work_days.includes(isoDow(d)) ? "" : " (выходной)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Время начала"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function exportIcs(visits: Visit[], byId: Map<string, ClientBundle>) {
  const esc = (s: string) => s.replace(/[\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AgroKontrol//RU", "CALSCALE:GREGORIAN", "X-WR-CALNAME:AgroKontrol"];
  for (const v of visits) {
    if (!v.visit_date || v.status === "missed") continue;
    const b = byId.get(v.client_id);
    const d = v.visit_date.replace(/-/g, "");
    const st = (v.start_time || "09:00:00").replace(/:/g, "").slice(0, 6);
    const endMin = timeToMin(v.start_time || "09:00") + v.duration_min;
    const en = minToTime(endMin).replace(/:/g, "").slice(0, 6);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${v.id}@agrokontrol`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${d}T${st}`,
      `DTEND:${d}T${en}`,
      `SUMMARY:${esc(`Осмотр: ${b?.client.full_name || ""}`)}`,
      `LOCATION:${esc([b?.client.district, b?.client.settlement, b?.client.address].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${esc([b?.client.phone, VISIT_LABEL[v.status], v.note].filter(Boolean).join("\n"))}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `agrokontrol-${today()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}
