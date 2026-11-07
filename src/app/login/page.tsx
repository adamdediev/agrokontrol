"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase, BASE_PATH } from "@/lib/supabase";
import { PhoneInput, isPhoneComplete } from "@/components/PhoneInput";
import { Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/AppShell";
import { useInstall } from "@/components/Install";

type Mode = "login" | "forgot" | "bootstrap";

export default function LoginPage() {
  const { signIn } = useStore();
  const { standalone, install } = useInstall();
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
    if (!isPhoneComplete(phone)) {
      setError("Введите номер полностью: +7 (XXX) XXX-XX-XX");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(phone, password);
      } else if (mode === "bootstrap") {
        const { error } = await supabase.rpc("create_app_user", {
          p_phone: phone,
          p_password: password,
          p_full_name: name,
          p_role: "admin",
          p_email: email || null,
        });
        if (error) throw new Error(error.message);
        await signIn(phone, password);
      } else {
        const { data: em } = await supabase.rpc("login_email", { p_phone: phone });
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
    <div className="grid min-h-dvh place-items-center bg-[#f2f2f7] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
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
            <PhoneInput value={phone} onChange={setPhone} required autoComplete="username" />
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
        {!standalone && (
          <button type="button" onClick={install} className="mx-auto mt-3 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm ring-1 ring-black/5">
            Установить приложение на телефон
          </button>
        )}
      </div>
    </div>
  );
}
