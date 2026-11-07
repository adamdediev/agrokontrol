"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import type { AuditEntry, Profile, Settings } from "@/lib/types";
import { DOW_SHORT, fmtTime } from "@/lib/dates";
import { fmtPhone, ROLE_LABEL } from "@/lib/format";
import { PhoneInput, isPhoneComplete } from "@/components/PhoneInput";
import { ACTION_LABEL, describeChanges, TABLE_LABEL } from "@/lib/audit";
import { Badge, Button, Card, cx, Empty, Field, Input, Modal, PageHeader, Row, SectionTitle, Select } from "@/components/ui";
import { Icon } from "@/components/icons";
import { InstallSteps, useInstall } from "@/components/Install";

export default function SettingsPage() {
  const { isAdmin, me, signOut, queue } = useStore();
  return (
    <>
      <PageHeader
        title="Настройки"
        subtitle={me ? `${me.full_name} · ${ROLE_LABEL[me.role]} · ${fmtPhone(me.phone)}` : ""}
        actions={
          <Button
            variant="danger"
            onClick={() => {
              if (queue.length && !confirm(`Есть ${queue.length} несинхронизированных изменений. При выходе они будут потеряны. Выйти?`)) return;
              void signOut();
            }}
          >
            <Icon name="logout" className="h-4 w-4" />Выйти
          </Button>
        }
      />
      <Schedule />
      {isAdmin && <Users />}
      <MyPassword />
      {isAdmin && <Backups />}
      <Journal />
      <Install />
    </>
  );
}

/* ---------------------------- График работы ---------------------------- */

function Schedule() {
  const { data, update, isAdmin } = useStore();
  const [f, setF] = useState<Settings>(data.settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setF(data.settings), [data.settings]);
  const dirty = JSON.stringify(f) !== JSON.stringify(data.settings);
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: Number(e.target.value) }));

  function save() {
    const { work_days, day_start, day_end, visit_limit, visit_duration, interval_min, travel_min, period_anchor } = f;
    update("settings", 1, { work_days: [...work_days].sort(), day_start, day_end, visit_limit, visit_duration, interval_min, travel_min, period_anchor }, "Настройки графика");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <SectionTitle>График и планирование</SectionTitle>
      <Card className="p-4">
        <fieldset disabled={!isAdmin} className="space-y-4">
          <Field label="Рабочие дни">
            <div className="flex flex-wrap gap-1.5">
              {DOW_SHORT.map((d, i) => {
                const n = i + 1;
                const on = f.work_days.includes(n);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setF((p) => ({ ...p, work_days: on ? f.work_days.filter((x) => x !== n) : [...f.work_days, n] }))}
                    className={cx("h-10 w-12 rounded-xl text-sm font-medium ring-1", on ? "bg-emerald-700 text-white ring-emerald-700" : "ring-zinc-200")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Начало дня"><Input type="time" value={fmtTime(f.day_start)} onChange={(e) => setF((p) => ({ ...p, day_start: e.target.value + ":00" }))} /></Field>
            <Field label="Конец дня"><Input type="time" value={fmtTime(f.day_end)} onChange={(e) => setF((p) => ({ ...p, day_end: e.target.value + ":00" }))} /></Field>
            <Field label="Лимит визитов в день"><Input type="number" min={1} value={f.visit_limit} onChange={num("visit_limit")} /></Field>
            <Field label="Длительность осмотра, мин"><Input type="number" min={5} step={5} value={f.visit_duration} onChange={num("visit_duration")} /></Field>
            <Field label="Интервал в одном посёлке, мин"><Input type="number" min={0} step={5} value={f.interval_min} onChange={num("interval_min")} /></Field>
            <Field label="Дорога между посёлками, мин"><Input type="number" min={0} step={5} value={f.travel_min} onChange={num("travel_min")} /></Field>
            <Field label="Начало 4-недельных периодов" hint="Понедельник, от которого считаются периоды" className="col-span-2">
              <Input type="date" value={f.period_anchor} onChange={(e) => setF((p) => ({ ...p, period_anchor: e.target.value }))} />
            </Field>
          </div>
        </fieldset>
        {isAdmin && (
          <div className="mt-4 flex items-center gap-3">
            <Button variant="primary" onClick={save} disabled={!dirty}>Сохранить</Button>
            {saved && <span className="text-sm text-emerald-700">Сохранено</span>}
          </div>
        )}
      </Card>
    </>
  );
}

/* ---------------------------- Пользователи ---------------------------- */

function Users() {
  const { data, me, refresh, online } = useStore();
  const [add, setAdd] = useState(false);
  const [pw, setPw] = useState<Profile | null>(null);
  const [f, setF] = useState({ full_name: "", phone: "", password: "", role: "agronom", email: "" });
  const [newPw, setNewPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setErr("");
    if (!isPhoneComplete(f.phone)) return setErr("Введите номер полностью: +7 (XXX) XXX-XX-XX");
    setBusy(true);
    const { error } = await supabase.rpc("create_app_user", {
      p_phone: f.phone, p_password: f.password, p_full_name: f.full_name, p_role: f.role, p_email: f.email || null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setAdd(false);
    setF({ full_name: "", phone: "", password: "", role: "agronom", email: "" });
    void refresh();
  }

  async function setPassword() {
    if (!pw) return;
    setErr("");
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_password", { p_user: pw.id, p_password: newPw });
    setBusy(false);
    if (error) return setErr(error.message);
    setPw(null);
    setNewPw("");
    alert("Пароль изменён");
  }

  async function del(p: Profile) {
    if (!confirm(`Удалить пользователя ${p.full_name}? Он больше не сможет войти.`)) return;
    const { error } = await supabase.rpc("admin_delete_user", { p_user: p.id });
    if (error) alert(error.message);
    void refresh();
  }

  return (
    <>
      <SectionTitle right={<Button size="sm" variant="ghost" onClick={() => setAdd(true)} disabled={!online}>+ Пользователь</Button>}>Пользователи</SectionTitle>
      <Card>
        {data.profiles.map((p) => (
          <Row key={p.id}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{p.full_name} {p.id === me?.id && <Badge>вы</Badge>}</div>
              <div className="text-xs text-zinc-500">{fmtPhone(p.phone)}{p.recovery_email ? ` · ${p.recovery_email}` : ""}</div>
            </div>
            <Badge tone={p.role === "admin" ? "violet" : "blue"}>{ROLE_LABEL[p.role]}</Badge>
            <Button size="sm" onClick={() => { setPw(p); setErr(""); }} disabled={!online}>Пароль</Button>
            {p.id !== me?.id && <Button size="sm" variant="danger" onClick={() => del(p)} disabled={!online}>✕</Button>}
          </Row>
        ))}
      </Card>
      <p className="mt-2 px-1 text-xs text-zinc-400">Регистрация закрыта: новых сотрудников добавляет только администратор. Если сотрудник забыл пароль — задайте новый кнопкой «Пароль».</p>

      <Modal open={add} onClose={() => setAdd(false)} title="Новый пользователь" footer={<><Button onClick={() => setAdd(false)}>Отмена</Button><Button variant="primary" onClick={create} disabled={busy}>Создать</Button></>}>
        <div className="space-y-3">
          <Field label="Имя"><Input autoComplete="off" name="new-user-name" value={f.full_name} onChange={(e) => setF((p) => ({ ...p, full_name: e.target.value }))} /></Field>
          <Field label="Телефон (логин)"><PhoneInput autoComplete="off" value={f.phone} onChange={(v) => setF((p) => ({ ...p, phone: v }))} /></Field>
          <Field label="Пароль"><Input type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF((p) => ({ ...p, password: e.target.value }))} minLength={6} /></Field>
          <Field label="Роль">
            <Select value={f.role} onChange={(e) => setF((p) => ({ ...p, role: e.target.value }))}>
              <option value="agronom">Агроном</option>
              <option value="admin">Администратор</option>
            </Select>
          </Field>
          <Field label="Email для восстановления (необязательно)"><Input type="email" autoComplete="off" name="new-user-email" value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} /></Field>
          {err && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        </div>
      </Modal>

      <Modal open={!!pw} onClose={() => setPw(null)} title={`Новый пароль: ${pw?.full_name || ""}`} footer={<><Button onClick={() => setPw(null)}>Отмена</Button><Button variant="primary" onClick={setPassword} disabled={busy || newPw.length < 6}>Сохранить</Button></>}>
        <Field label="Новый пароль (не короче 6 символов)"><Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
        {err && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </Modal>
    </>
  );
}

function MyPassword() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  async function save() {
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : "Пароль изменён");
    if (!error) setPw("");
  }
  return (
    <>
      <SectionTitle>Мой пароль</SectionTitle>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Новый пароль" className="min-w-[200px] flex-1"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Button onClick={save} disabled={pw.length < 6}>Сменить</Button>
        {msg && <div className="w-full text-sm text-zinc-500">{msg}</div>}
      </Card>
    </>
  );
}

/* ---------------------------- Резервные копии ---------------------------- */

interface BackupRow { id: number; created_at: string; kind: string; size_bytes: number }

function Backups() {
  const { refresh, online } = useStore();
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("backups").select("id,created_at,kind,size_bytes").order("created_at", { ascending: false }).limit(60);
    setRows((data as BackupRow[]) || []);
  }, []);
  useEffect(() => { if (online) void load(); }, [load, online]);

  async function make() {
    setBusy(true);
    const { error } = await supabase.rpc("make_backup", { p_kind: "manual" });
    setBusy(false);
    setMsg(error ? error.message : "Копия создана");
    void load();
  }

  async function download(id: number, at: string) {
    const { data, error } = await supabase.rpc("backup_data", { p_id: id });
    if (error) return setMsg(error.message);
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `agrokontrol-backup-${at.slice(0, 10)}-${id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(id: number, at: string) {
    if (!confirm(`Восстановить данные из копии от ${new Date(at).toLocaleString("ru-RU")}?\nТекущие данные будут заменены (перед этим автоматически сохранится копия текущего состояния).`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("restore_backup", { p_id: id });
    setBusy(false);
    setMsg(error ? error.message : "Данные восстановлены");
    await refresh();
    void load();
  }

  async function restoreFile(file: File) {
    try {
      const json = JSON.parse(await file.text());
      if (!confirm(`Восстановить данные из файла ${file.name}? Текущие данные будут заменены.`)) return;
      setBusy(true);
      const { error } = await supabase.rpc("restore_snapshot", { p_data: json });
      setBusy(false);
      setMsg(error ? error.message : "Данные восстановлены из файла");
      await refresh();
      void load();
    } catch {
      setMsg("Не удалось прочитать файл");
    }
  }

  const KIND: Record<string, string> = { auto: "ежедневная", manual: "вручную", "before-restore": "перед восстановлением" };

  return (
    <>
      <SectionTitle
        right={
          <div className="flex gap-1">
            <label className={cx("inline-flex h-8 cursor-pointer items-center rounded-xl px-3 text-[13px] font-medium text-emerald-700 hover:bg-emerald-50", !online && "pointer-events-none opacity-50")}>
              Из файла
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && restoreFile(e.target.files[0])} />
            </label>
            <Button size="sm" variant="ghost" onClick={make} disabled={busy || !online}>Создать копию</Button>
          </div>
        }
      >
        Резервные копии
      </SectionTitle>
      <Card>
        {msg && <div className="border-b border-zinc-100 px-4 py-2 text-sm text-emerald-700">{msg}</div>}
        {!online && <Empty>Нужен интернет</Empty>}
        {online && rows.length === 0 && <Empty>Копий пока нет. Автоматическая копия создаётся ежедневно в 05:00 МСК.</Empty>}
        {rows.slice(0, 15).map((r) => (
          <Row key={r.id}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{new Date(r.created_at).toLocaleString("ru-RU")}</div>
              <div className="text-xs text-zinc-500">{KIND[r.kind] || r.kind} · {(r.size_bytes / 1024).toFixed(1)} КБ</div>
            </div>
            <Button size="sm" onClick={() => download(r.id, r.created_at)}><Icon name="download" className="h-4 w-4" /></Button>
            <Button size="sm" onClick={() => restore(r.id, r.created_at)} disabled={busy}>Восстановить</Button>
          </Row>
        ))}
      </Card>
    </>
  );
}

/* ---------------------------- Журнал ---------------------------- */

function Journal() {
  const { online, data, lastSync } = useStore();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [table, setTable] = useState("");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    if (!online) return;
    let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
    if (table) q = q.eq("table_name", table);
    q.then(({ data: d }) => setRows((d as AuditEntry[]) || []));
  }, [online, table, limit, lastSync]);

  const clientName = (e: AuditEntry) => {
    const d = e.new_data || e.old_data || {};
    const id = e.table_name === "clients" ? e.row_id : String(d["client_id"] || "");
    return data.clients.find((c) => c.id === id)?.full_name || (e.table_name === "clients" ? String(d["full_name"] || "") : "");
  };

  return (
    <>
      <SectionTitle
        right={
          <Select value={table} onChange={(e) => setTable(e.target.value)} className="h-8 w-auto py-1 text-[13px]">
            <option value="">Все разделы</option>
            <option value="payments">Платежи</option>
            <option value="clients">Клиенты</option>
            <option value="greenhouses">Теплицы</option>
            <option value="visits">Визиты</option>
            <option value="settings">Настройки</option>
          </Select>
        }
      >
        Журнал действий
      </SectionTitle>
      <Card>
        {!online && <Empty>Журнал доступен при подключении к интернету</Empty>}
        {online && rows.length === 0 && <Empty>Записей нет</Empty>}
        {rows.map((e) => (
          <div key={e.id} className="border-b border-zinc-100 px-4 py-2.5 text-sm last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={e.action === "delete" ? "red" : e.action === "insert" ? "green" : "gray"}>{TABLE_LABEL[e.table_name] || e.table_name}: {ACTION_LABEL[e.action] || e.action}</Badge>
              <span className="font-medium">{clientName(e)}</span>
              <span className="ml-auto text-xs text-zinc-400">{new Date(e.at).toLocaleString("ru-RU")} · {e.user_name}</span>
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">{describeChanges(e)}</div>
          </div>
        ))}
        {rows.length >= limit && (
          <div className="p-2 text-center"><Button size="sm" variant="ghost" onClick={() => setLimit(limit + 100)}>Показать ещё</Button></div>
        )}
      </Card>
    </>
  );
}

function Install() {
  const { standalone, platform, canPrompt, install } = useInstall();
  return (
    <>
      <SectionTitle>Приложение на телефоне</SectionTitle>
      <Card className="p-4 text-sm text-zinc-600">
        {standalone ? (
          <p className="text-emerald-700">Приложение установлено и запущено с экрана «Домой».</p>
        ) : (
          <>
            {canPrompt ? (
              <Button variant="primary" onClick={install} className="mb-3 w-full sm:w-auto">
                <Icon name="download" className="h-4 w-4" />Установить приложение
              </Button>
            ) : (
              <InstallSteps platform={platform} />
            )}
          </>
        )}
        <p className="mt-3 text-zinc-400">Без интернета приложение открывается из памяти телефона, а изменения и платежи складываются в очередь и отправляются при появлении связи.</p>
      </Card>
    </>
  );
}
