// Все даты — локальные строки YYYY-MM-DD, неделя начинается с понедельника.

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today(): string {
  return toISO(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** ISO день недели: 1 = понедельник … 7 = воскресенье */
export function isoDow(s: string): number {
  const d = parseISO(s).getDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(s: string): string {
  return addDays(s, 1 - isoDow(s));
}

export function weeksBetween(a: string, b: string): number {
  return Math.round((parseISO(mondayOf(b)).getTime() - parseISO(mondayOf(a)).getTime()) / (7 * 86400000));
}

export function weekRange(monday: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(monday, i * 7));
}

/** Начало текущего 4-недельного периода */
export function periodStart(date: string, anchor: string): string {
  const w = weeksBetween(anchor, date);
  const idx = Math.floor(w / 4);
  return addDays(mondayOf(anchor), idx * 28);
}

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const DOW_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const DOW_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtShort(s: string): string {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtWeek(monday: string): string {
  return `${fmtShort(monday)} – ${fmtShort(addDays(monday, 6))}`;
}

export function monthTitle(s: string): string {
  const d = parseISO(s);
  return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
}

export function monthEnd(s: string): string {
  const d = parseISO(s);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
