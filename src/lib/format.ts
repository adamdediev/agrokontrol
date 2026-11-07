export function rub(n: number): string {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
}

export function num(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function normalizePhone(p: string): string {
  let d = (p || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d;
}

export function fmtPhone(p: string): string {
  const d = normalizePhone(p);
  if (d.length !== 11) return p;
  return `+${d[0]} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const METHOD_LABEL = { cash: "Наличные", card: "Перевод на карту" } as const;
export const STATUS_LABEL = { active: "Активный", paused: "Пауза", archived: "Архив" } as const;
export const VISIT_LABEL = {
  planned: "Запланирован",
  done: "Посещён",
  missed: "Не посещён",
  rescheduled: "Перенесён",
} as const;
export const ROLE_LABEL = { admin: "Администратор", agronom: "Агроном" } as const;
