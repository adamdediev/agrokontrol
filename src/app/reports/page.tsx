"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useBundles } from "@/lib/derived";
import { supabase } from "@/lib/supabase";
import type { AuditEntry } from "@/lib/types";
import { addDays, fmtShort, monthEnd, mondayOf, today } from "@/lib/dates";
import { METHOD_LABEL, rub, STATUS_LABEL, VISIT_LABEL } from "@/lib/format";
import { ACTION_LABEL, describeChanges, TABLE_LABEL } from "@/lib/audit";
import { Button, Card, Field, Input, PageHeader, Segmented, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";

type Range = "week" | "month" | "all" | "custom";

export default function ReportsPage() {
  const { data, online } = useStore();
  const { list, byId } = useBundles();
  const t = today();
  const [range, setRange] = useState<Range>("month");
  const [cFrom, setCFrom] = useState(t.slice(0, 8) + "01");
  const [cTo, setCTo] = useState(t);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [from, to] = useMemo((): [string, string] => {
    if (range === "week") return [mondayOf(t), addDays(mondayOf(t), 6)];
    if (range === "month") return [t.slice(0, 8) + "01", monthEnd(t)];
    if (range === "custom") return [cFrom, cTo];
    return ["0000-01-01", "9999-12-31"];
  }, [range, t, cFrom, cTo]);

  const pays = data.payments.filter((p) => !p.deleted && p.paid_at >= from && p.paid_at <= to);
  const visits = data.visits.filter((v) => (v.visit_date || v.week_start) >= from && (v.visit_date || v.week_start) <= to);
  const total = pays.reduce((s, p) => s + Number(p.amount), 0);

  async function download() {
    setErr("");
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const add = (name: string, rows: Record<string, unknown>[]) => {
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "нет данных" }]);
        const keys = Object.keys(rows[0] || { "": "" });
        ws["!cols"] = keys.map((k) => ({ wch: Math.min(50, Math.max(10, k.length + 2, ...rows.map((r) => String(r[k] ?? "").length + 1))) }));
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      const name = (id: string) => byId.get(id)?.client.full_name || "";

      add("Клиенты", list.map((b) => ({
        "ФИО": b.client.full_name, "Телефон": b.client.phone, "Район": b.client.district, "Населённый пункт": b.client.settlement,
        "Адрес": b.client.address, "Удобное время": b.client.preferred_time, "Статус": STATUS_LABEL[b.client.status],
        "Площадь, м²": b.area, "Скидка, %": Number(b.client.discount_percent), "Ручная цена": b.client.manual_price ?? "",
        "Плата за 4 недели": round(b.fin.periodPrice), "Плата за неделю": round(b.fin.weekPrice),
        "Оплата при визите": b.client.pay_on_visit ? "да" : "", "Примечания": b.client.notes,
      })));
      add("Теплицы и тарифы", data.greenhouses.map((g) => ({
        "Клиент": name(g.client_id), "Теплица": g.name, "Площадь, м²": Number(g.area), "Тариф, ₽/м²": Number(g.tariff),
        "Сумма за 4 недели": round(Number(g.area) * Number(g.tariff)), "За неделю": round((Number(g.area) * Number(g.tariff)) / 4),
        "Адрес": g.address, "Архив": g.archived ? "да" : "",
      })));
      add("Платежи", pays.sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map((p) => ({
        "Дата": p.paid_at, "Клиент": name(p.client_id), "Сумма": Number(p.amount), "Способ": METHOD_LABEL[p.method],
        "Принял": p.received_by, "Недели": p.weeks.join(", ") || "аванс", "Примечание": p.note,
      })));
      add("Итоги оплат", [
        { "Показатель": "Всего", "Сумма": round(total) },
        { "Показатель": "Наличные", "Сумма": round(pays.filter((p) => p.method === "cash").reduce((s, p) => s + Number(p.amount), 0)) },
        { "Показатель": "Перевод на карту", "Сумма": round(pays.filter((p) => p.method === "card").reduce((s, p) => s + Number(p.amount), 0)) },
      ]);
      add("Долги", list.filter((b) => b.fin.debt > 0 || b.fin.oldDebt > 0).map((b) => ({
        "Клиент": b.client.full_name, "Район": b.client.district, "Телефон": b.client.phone,
        "Текущий долг": round(b.fin.debt), "Долг прошлого сезона": round(b.fin.oldDebt), "Комментарий": b.client.old_debt_note,
        "Итого": round(b.fin.debt + b.fin.oldDebt),
      })));
      add("Визиты", visits.sort((a, b) => (a.visit_date || "").localeCompare(b.visit_date || "")).map((v) => {
        const c = byId.get(v.client_id)?.client;
        return {
          "Дата": v.visit_date || "не расставлен", "Время": v.start_time?.slice(0, 5) || "", "Неделя": v.week_start, "Клиент": c?.full_name || "",
          "Район": c?.district || "", "Посёлок": c?.settlement || "", "Статус": VISIT_LABEL[v.status], "Минут": v.duration_min, "Заметка": v.note,
        };
      }));

      if (online) {
        let q = supabase.from("audit_log").select("*").order("at", { ascending: true }).limit(5000);
        if (range !== "all") q = q.gte("at", from).lte("at", to + "T23:59:59");
        const { data: log, error } = await q;
        if (error) throw error;
        add("Журнал изменений", ((log as AuditEntry[]) || []).map((e) => ({
          "Когда": new Date(e.at).toLocaleString("ru-RU"), "Кто": e.user_name, "Раздел": TABLE_LABEL[e.table_name] || e.table_name,
          "Действие": ACTION_LABEL[e.action] || e.action,
          "Клиент": name(String((e.new_data || e.old_data || {})["client_id"] || (e.table_name === "clients" ? e.row_id : ""))),
          "Подробности": describeChanges(e),
        })));
      }
      XLSX.writeFile(wb, `AgroKontrol_${range === "all" ? "весь-период" : `${from}_${to}`}.xlsx`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Отчёты" subtitle="Выгрузка в Excel (.xlsx)" />
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Segmented<Range> value={range} onChange={setRange} options={[{ value: "week", label: "Неделя" }, { value: "month", label: "Месяц" }, { value: "all", label: "Весь период" }, { value: "custom", label: "Даты" }]} />
          {range === "custom" && (
            <>
              <Field label="С"><Input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} /></Field>
              <Field label="По"><Input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} /></Field>
            </>
          )}
        </div>
        <div className="mt-2 text-sm text-zinc-500">{range === "all" ? "Все данные" : `${fmtShort(from)} – ${fmtShort(to)}`}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Платежей" value={pays.length} />
          <Stat label="Сумма" value={rub(total)} tone="green" />
          <Stat label="Визитов" value={visits.length} />
          <Stat label="Выполнено" value={visits.filter((v) => v.status === "done").length} />
        </div>
        <div className="mt-4 text-sm text-zinc-500">
          Листы: клиенты, теплицы и тарифы, платежи и способы оплаты, итоги, долги, график и статусы визитов, журнал изменений{online ? "" : " (журнал недоступен офлайн)"}.
        </div>
        {err && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <Button variant="primary" className="mt-4" onClick={download} disabled={busy}>
          <Icon name="download" className="h-4 w-4" />{busy ? "Формируем…" : "Скачать Excel"}
        </Button>
      </Card>
    </>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
