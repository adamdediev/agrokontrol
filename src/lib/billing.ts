import type { Client, Greenhouse, Payment, Settings, Visit } from "./types";
import { addDays, isoDow, minToTime, mondayOf, timeToMin, weekRange } from "./dates";

export const WEEKS_IN_PERIOD = 4;
const EPS = 0.5; // допуск в рублях при сравнении сумм

/** Сумма площадь × тариф по всем активным теплицам (без скидки) */
export function basePeriodPrice(ghs: Greenhouse[]): number {
  return ghs.filter((g) => !g.archived).reduce((s, g) => s + Number(g.area) * Number(g.tariff), 0);
}

/** Плата за 4-недельный период с учётом скидки или ручной цены */
export function periodPrice(client: Client, ghs: Greenhouse[]): number {
  if (client.manual_price !== null && client.manual_price !== undefined && String(client.manual_price) !== "") {
    return Number(client.manual_price);
  }
  const base = basePeriodPrice(ghs);
  return base * (1 - Number(client.discount_percent || 0) / 100);
}

export function weekPrice(client: Client, ghs: Greenhouse[]): number {
  return periodPrice(client, ghs) / WEEKS_IN_PERIOD;
}

export type WeekState = "paid" | "partial" | "unpaid";

export interface WeekInfo {
  week: string;
  allocated: number;
  due: number;
  state: WeekState;
}

export interface ClientFinance {
  periodPrice: number;
  weekPrice: number;
  totalPaid: number;
  credit: number; // предоплата без привязки к неделям
  weeks: WeekInfo[]; // все недели, которые упоминаются в оплатах или визитах
  paidWeeks: string[];
  debt: number; // текущая неоплаченная часть
  oldDebt: number;
  currentWeekPaid: boolean;
}

/** Распределение платежей по неделям: сумма платежа делится поровну на его недели */
export function allocate(payments: Payment[]): { byWeek: Map<string, number>; credit: number } {
  const byWeek = new Map<string, number>();
  let credit = 0;
  for (const p of payments) {
    if (p.deleted) continue;
    const amt = Number(p.amount);
    if (!p.weeks || p.weeks.length === 0) {
      credit += amt;
      continue;
    }
    const part = amt / p.weeks.length;
    for (const w of p.weeks) byWeek.set(w, (byWeek.get(w) || 0) + part);
  }
  return { byWeek, credit };
}

export function weekStateOf(allocated: number, due: number): WeekState {
  if (allocated <= 0) return "unpaid";
  if (due <= 0 || allocated >= due - EPS) return "paid";
  return "partial";
}

export function clientFinance(
  client: Client,
  ghs: Greenhouse[],
  payments: Payment[],
  visits: Visit[],
  todayISO: string,
): ClientFinance {
  const pp = periodPrice(client, ghs);
  const wp = pp / WEEKS_IN_PERIOD;
  const { byWeek, credit } = allocate(payments);
  const weekSet = new Set<string>(byWeek.keys());
  for (const v of visits) if (v.status === "done") weekSet.add(v.week_start);
  const weeks = [...weekSet].sort().map((week) => {
    const allocated = byWeek.get(week) || 0;
    return { week, allocated, due: wp, state: weekStateOf(allocated, wp) };
  });
  const shortfall = weeks.reduce((s, w) => s + Math.max(0, w.due - w.allocated), 0);
  const totalPaid = payments.filter((p) => !p.deleted).reduce((s, p) => s + Number(p.amount), 0);
  const cw = mondayOf(todayISO);
  const cur = weeks.find((w) => w.week === cw);
  return {
    periodPrice: pp,
    weekPrice: wp,
    totalPaid,
    credit,
    weeks,
    paidWeeks: weeks.filter((w) => w.state === "paid").map((w) => w.week),
    debt: Math.max(0, shortfall - credit),
    oldDebt: Number(client.old_debt || 0),
    currentWeekPaid: cur?.state === "paid",
  };
}

/** Первая неоплаченная неделя, начиная с текущей — для подсказки в форме оплаты */
export function nextUnpaidWeek(fin: ClientFinance, todayISO: string): string {
  let w = mondayOf(todayISO);
  const paid = new Set(fin.paidWeeks);
  for (let i = 0; i < 104 && paid.has(w); i++) w = addDays(w, 7);
  return w;
}

export interface PlanEntry {
  client: Client;
  week: string;
  reason: "paid" | "pay_on_visit";
}

/**
 * Недели, которые нужно расставить в календаре.
 * Клиент попадает сюда только после оплаты недели (или с исключением «оплата при визите»).
 */
export function plannableWeeks(
  client: Client,
  fin: ClientFinance,
  clientVisits: Visit[],
  todayISO: string,
): PlanEntry[] {
  if (client.status !== "active") return [];
  const cw = mondayOf(todayISO);
  const hasVisit = new Set(clientVisits.map((v) => v.week_start));
  const res: PlanEntry[] = [];
  for (const w of fin.paidWeeks) {
    if (w >= cw && !hasVisit.has(w)) res.push({ client, week: w, reason: "paid" });
  }
  if (client.pay_on_visit) {
    for (const w of weekRange(cw, 4)) {
      if (!hasVisit.has(w) && !fin.paidWeeks.includes(w)) res.push({ client, week: w, reason: "pay_on_visit" });
    }
  }
  return res.sort((a, b) => a.week.localeCompare(b.week));
}

export interface AutoPlanResult {
  placed: { client_id: string; week_start: string; visit_date: string; start_time: string; duration_min: number }[];
  notPlaced: PlanEntry[];
}

/**
 * Автоматическая расстановка визитов одной недели по рабочим дням.
 * Клиенты группируются по району и посёлку, между посёлками учитывается время дороги.
 */
export function autoPlan(entries: PlanEntry[], week: string, settings: Settings, existing: Visit[], fromDate = ""): AutoPlanResult {
  const days = [1, 2, 3, 4, 5, 6, 7]
    .filter((d) => settings.work_days.includes(d))
    .map((d) => addDays(week, d - 1))
    .filter((d) => d >= fromDate); // прошедшие дни не заполняем
  const dayStart = timeToMin(settings.day_start);
  const dayEnd = timeToMin(settings.day_end);
  const dur = settings.visit_duration;

  const sorted = [...entries].sort(
    (a, b) =>
      a.client.district.localeCompare(b.client.district, "ru") ||
      a.client.settlement.localeCompare(b.client.settlement, "ru") ||
      a.client.address.localeCompare(b.client.address, "ru"),
  );

  type DayState = { date: string; count: number; cursor: number; lastSettlement: string | null };
  const state: DayState[] = days.map((date) => {
    const dv = existing
      .filter((v) => v.visit_date === date && v.start_time)
      .sort((a, b) => (a.start_time! < b.start_time! ? -1 : 1));
    const last = dv[dv.length - 1];
    return {
      date,
      count: existing.filter((v) => v.visit_date === date).length,
      cursor: last ? timeToMin(last.start_time!) + last.duration_min : dayStart,
      lastSettlement: null,
    };
  });

  const placed: AutoPlanResult["placed"] = [];
  const notPlaced: PlanEntry[] = [];
  let di = 0;
  for (const e of sorted) {
    let done = false;
    while (di < state.length) {
      const d = state[di];
      const gap = d.count === 0 && d.lastSettlement === null && d.cursor === dayStart
        ? 0
        : d.lastSettlement === e.client.settlement ? settings.interval_min : settings.travel_min;
      const start = d.cursor + gap;
      if (d.count < settings.visit_limit && start + dur <= dayEnd) {
        placed.push({ client_id: e.client.id, week_start: week, visit_date: d.date, start_time: minToTime(start), duration_min: dur });
        d.count++;
        d.cursor = start + dur;
        d.lastSettlement = e.client.settlement;
        done = true;
        break;
      }
      di++;
    }
    if (!done) notPlaced.push(e);
  }
  return { placed, notPlaced };
}

export function isWorkDay(date: string, settings: Settings): boolean {
  return settings.work_days.includes(isoDow(date));
}
