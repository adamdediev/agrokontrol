// Критерии приёмки из ТЗ: npx tsx tests/acceptance.test.ts
import assert from "node:assert/strict";
import { autoPlan, clientFinance, periodPrice, plannableWeeks, weekPrice } from "../src/lib/billing";
import { addDays, mondayOf, today } from "../src/lib/dates";
import { DEFAULT_SETTINGS, type Client, type Greenhouse, type Payment } from "../src/lib/types";

const base = { created_at: "", updated_at: "" };
const client = (id: string, extra: Partial<Client> = {}): Client => ({
  ...base, id, full_name: id, phone: "", district: "Район", settlement: "Посёлок", address: "", preferred_time: "", notes: "",
  status: "active", discount_percent: 0, manual_price: null, old_debt: 0, old_debt_note: "", pay_on_visit: false, ...extra,
});
const gh: Greenhouse = { ...base, id: "g1", client_id: "a", name: "", area: 5000, tariff: 7, address: "", archived: false };
const w0 = mondayOf(today());
const pay = (weeks: string[], amount: number): Payment => ({
  ...base, id: Math.random().toString(), client_id: "a", paid_at: today(), amount, method: "cash", received_by: "", weeks, note: "", deleted: false,
});

// 5 000 м² × 7 руб. = 35 000 руб. за 4 недели; 1 неделя = 8 750 руб.
const a = client("a");
assert.equal(periodPrice(a, [gh]), 35000);
assert.equal(weekPrice(a, [gh]), 8750);

// После оплаты за 2 недели доступны 2 визита
const p2 = [pay([w0, addDays(w0, 7)], 17500)];
const fin = clientFinance(a, [gh], p2, [], today());
assert.equal(fin.paidWeeks.length, 2);
assert.equal(plannableWeeks(a, fin, [], today()).length, 2);
assert.equal(fin.debt, 0);

// Частичная оплата: неделя не считается оплаченной, видна неоплаченная часть
const fp = clientFinance(a, [gh], [pay([w0], 5000)], [], today());
assert.equal(fp.paidWeeks.length, 0);
assert.equal(fp.debt, 3750);
assert.equal(plannableWeeks(a, fp, [], today()).length, 0);

// Неоплаченный клиент не попадает в автоплан
const u = client("u");
const fu = clientFinance(u, [{ ...gh, client_id: "u" }], [], [], today());
assert.equal(plannableWeeks(u, fu, [], today()).length, 0);

// Исключение «оплата при визите» — попадает без оплаты
const v = client("v", { pay_on_visit: true });
const fv = clientFinance(v, [gh], [], [], today());
assert.ok(plannableWeeks(v, fv, [], today()).length > 0);

// Скидка и ручная цена
assert.equal(periodPrice(client("d", { discount_percent: 10 }), [gh]), 31500);
assert.equal(periodPrice(client("m", { manual_price: 30000 }), [gh]), 30000);

// Автоплан: лимит визитов в день и рабочие дни (ср, чт)
const entries = Array.from({ length: 10 }, (_, i) => ({ client: client("c" + i), week: w0, reason: "paid" as const }));
const res = autoPlan(entries, w0, { ...DEFAULT_SETTINGS, visit_limit: 4 }, []);
assert.equal(res.placed.length, 8);
assert.equal(res.notPlaced.length, 2);
assert.deepEqual([...new Set(res.placed.map((p) => p.visit_date))], [addDays(w0, 2), addDays(w0, 3)]);

console.log("✓ все проверки приёмки пройдены");
