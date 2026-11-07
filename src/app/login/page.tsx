"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase, BASE_PATH } from "@/lib/supabase";
import { normalizePhone } from "@/lib/format";
import { Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/AppShell";

type Mode = "login" | "forgot" | "bootstrap";

export default function LoginPage() {
  const { signIn } = useStore();
  const [mode, setMode] = useState<Mode>("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    supabase.rpc("needs_bootstrap").then(({ data }) => {
      if (data === true) setMode("bootstrap");
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(phone, password);
      } else if (mode === "bootstrap") {
        const { error } = await supabase.rpc("create_app_user", {
          p_phone: normalizePhone(phone),
          p_password: password,
          p_full_name: name,
          p_role: "admin",
          p_email: email || null,
        });
        if (error) throw new Error(error.message);
        await signIn(phone, password);
      } else {
        const { data: em } = await supabase.rpc("login_email", { p_phone: normalizePhone(phone) });
        if (!em) throw new Error("Пользователь с таким телефоном не найден");
        if (String(em).endsWith("@agrokontrol.local")) {
          setInfo("Для этой учётной записи не указан email. Попросите администратора задать новый пароль в разделе «Настройки → Пользователи».");
        } else {
          const { error } = await supabase.auth.resetPasswordForEmail(String(em), {
            redirectTo: `${window.location.origin}${BASE_PATH}/reset/`,
          });
          if (error) throw new Error(error.message);
          setInfo("Ссылка для смены пароля отправлена на email, привязанный к учётной записи.");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[#f2f2f7] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AgroKontrol</h1>
            <p className="text-sm text-zinc-500">
              {mode === "bootstrap" ? "Первый запуск: создайте администратора" : mode === "forgot" ? "Восстановление доступа" : "Вход для сотрудников"}
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          {mode === "bootstrap" && (
            <Field label="Имя">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Иван Петров" />
            </Field>
          )}
          <Field label="Телефон">
            <Input type="tel" inputMode="tel" autoComplete="username" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+7 900 000-00-00" />
          </Field>
          {mode !== "forgot" && (
            <Field label="Пароль">
              <Input type="password" autoComplete={mode === "bootstrap" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </Field>
          )}
          {mode === "bootstrap" && (
            <Field label="Email для восстановления пароля" hint="Необязательно, но без него сбросить пароль администратора можно будет только через Supabase">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </Field>
          )}
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          {info && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</div>}
          <Button variant="primary" className="w-full" disabled={busy}>
            {busy ? "Подождите…" : mode === "login" ? "Войти" : mode === "bootstrap" ? "Создать и войти" : "Восстановить"}
          </Button>
          {mode !== "bootstrap" && (
            <button type="button" className="w-full text-center text-sm text-emerald-700" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setError(""); setInfo(""); }}>
              {mode === "login" ? "Забыли пароль?" : "← Назад ко входу"}
            </button>
          )}
        </form>
        <p className="mt-4 text-center text-xs text-zinc-400">Регистрация закрыта. Доступ выдаёт администратор.</p>
      </div>
    </div>
  );
}
