"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button, Field, Input } from "@/components/ui";

export default function ResetPage() {
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => session && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setErr(error.message);
    else setMsg("Пароль изменён. Теперь можно войти.");
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[#f2f2f7] p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h1 className="text-xl font-bold">Новый пароль</h1>
        {!ready && !msg && <p className="text-sm text-zinc-500">Проверяем ссылку… Если ничего не происходит, запросите восстановление ещё раз.</p>}
        {ready && !msg && (
          <>
            <Field label="Новый пароль">
              <Input type="password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </Field>
            {err && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
            <Button variant="primary" className="w-full">Сохранить</Button>
          </>
        )}
        {msg && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}
        <Link href="/" className="block text-center text-sm text-emerald-700">На главную</Link>
      </form>
    </div>
  );
}
