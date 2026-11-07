import type { AuditEntry } from "./types";

export const TABLE_LABEL: Record<string, string> = {
  clients: "Клиент",
  greenhouses: "Теплица",
  payments: "Платёж",
  visits: "Визит",
  settings: "Настройки",
  backups: "Резервная копия",
};
export const ACTION_LABEL: Record<string, string> = { insert: "создание", update: "изменение", delete: "удаление", restore: "восстановление" };

const FIELD: Record<string, string> = {
  full_name: "ФИО", phone: "телефон", district: "район", settlement: "посёлок", address: "адрес", preferred_time: "удобное время",
  notes: "заметки", status: "статус", discount_percent: "скидка", manual_price: "ручная цена", old_debt: "старый долг",
  old_debt_note: "коммент. к долгу", pay_on_visit: "оплата при визите", name: "название", area: "площадь", tariff: "тариф",
  archived: "архив", paid_at: "дата", amount: "сумма", method: "способ", received_by: "принял", weeks: "недели", note: "примечание",
  visit_date: "дата визита", start_time: "время", duration_min: "длительность", week_start: "неделя", work_days: "рабочие дни",
  day_start: "начало дня", day_end: "конец дня", visit_limit: "лимит", visit_duration: "длительность осмотра",
  interval_min: "интервал", travel_min: "дорога", period_anchor: "начало периода",
};

const SKIP = new Set(["updated_at", "created_at", "id", "client_id"]);

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "да" : "нет";
  return String(v);
}

export function describeChanges(e: AuditEntry): string {
  if (e.action === "update" && e.old_data && e.new_data) {
    const parts: string[] = [];
    for (const k of Object.keys(e.new_data)) {
      if (SKIP.has(k)) continue;
      const a = JSON.stringify(e.old_data[k]);
      const b = JSON.stringify(e.new_data[k]);
      if (a !== b) parts.push(`${FIELD[k] || k}: ${show(e.old_data[k])} → ${show(e.new_data[k])}`);
    }
    return parts.join("; ");
  }
  const d = e.new_data || e.old_data;
  if (!d) return "";
  if (e.table_name === "payments") return `${show(d.amount)} ₽, ${show(d.paid_at)}, недели: ${show(d.weeks)}`;
  if (e.table_name === "clients") return show(d.full_name);
  if (e.table_name === "visits") return `${show(d.visit_date)} ${show(d.start_time)} ${show(d.status)}`;
  if (e.table_name === "greenhouses") return `${show(d.area)} м² × ${show(d.tariff)} ₽`;
  return "";
}
