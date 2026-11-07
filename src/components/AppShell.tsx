"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { BASE_PATH, isConfigured } from "@/lib/supabase";
import { ROLE_LABEL } from "@/lib/format";
import { Icon, type IconName } from "./icons";
import { Badge, Button, cx, Modal } from "./ui";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Главная", icon: "home" },
  { href: "/clients", label: "Клиенты", icon: "users" },
  { href: "/payments", label: "Платежи", icon: "wallet" },
  { href: "/calendar", label: "Календарь", icon: "calendar" },
  { href: "/reports", label: "Отчёты", icon: "chart" },
  { href: "/settings", label: "Настройки", icon: "gear" },
];

const PUBLIC = ["/login", "/reset"];

function isActive(path: string, href: string) {
  const p = path.replace(/\/$/, "") || "/";
  if (href === "/") return p === "/";
  return p === href || p.startsWith(href + "/") || (href === "/clients" && p.startsWith("/client"));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const path = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC.some((p) => path.replace(/\/$/, "") === p);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (store.auth === "out" && !isPublic) router.replace("/login");
    if (store.auth === "in" && path.replace(/\/$/, "") === "/login") router.replace("/");
  }, [store.auth, isPublic, path, router]);

  if (!isConfigured) return <NotConfigured />;
  if (isPublic) return <>{children}</>;
  if (store.auth !== "in") {
    return <div className="grid min-h-dvh place-items-center text-zinc-400">Загрузка…</div>;
  }

  return (
    <div className="min-h-dvh bg-[#f2f2f7] md:flex">
      {/* боковое меню на десктопе */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-black/5 bg-white/70 px-3 py-5 backdrop-blur md:flex">
        <div className="mb-6 flex items-center gap-2 px-3">
          <Logo />
          <div>
            <div className="font-semibold leading-tight">AgroKontrol</div>
            <div className="text-xs text-zinc-400">учёт теплиц</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition",
                isActive(path, n.href) ? "bg-emerald-50 font-medium text-emerald-800" : "text-zinc-700 hover:bg-zinc-100",
              )}
            >
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-3">
          <SyncChip />
          <div className="text-sm">
            <div className="font-medium">{store.me?.full_name || "—"}</div>
            <div className="text-xs text-zinc-400">{store.me ? ROLE_LABEL[store.me.role] : ""}</div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* верхняя панель на мобильном */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-[#f2f2f7]/85 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <Logo small />
            <span className="font-semibold">AgroKontrol</span>
          </div>
          <SyncChip compact />
        </header>
        <ConflictBanner />
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      {/* нижняя навигация на мобильном */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-black/5 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px]", isActive(path, n.href) ? "text-emerald-700" : "text-zinc-500")}>
            <Icon name={n.icon} className="h-[22px] w-[22px]" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={cx("grid place-items-center rounded-xl bg-emerald-700 text-white", small ? "h-7 w-7" : "h-9 w-9")}>
      <svg viewBox="0 0 24 24" className={small ? "h-4 w-4" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 21c0-9 5-14 15-16-1 10-6 15-15 16zM5 21l8-8" />
      </svg>
    </div>
  );
}

function SyncChip({ compact }: { compact?: boolean }) {
  const { online, syncing, queue, syncNow } = useStore();
  let label = "Синхронизировано";
  let tone: "green" | "amber" | "gray" | "blue" = "green";
  if (!online) {
    label = queue.length ? `Офлайн · ${queue.length} в очереди` : "Офлайн";
    tone = "amber";
  } else if (syncing) {
    label = "Синхронизация…";
    tone = "blue";
  } else if (queue.length) {
    label = `${queue.length} не отправлено`;
    tone = "amber";
  }
  return (
    <button onClick={() => void syncNow()} title="Синхронизировать сейчас" className="text-left">
      <Badge tone={tone} className={compact ? "" : "px-2.5 py-1"}>
        <Icon name={online ? "cloud" : "off"} className="mr-1 h-3.5 w-3.5" />
        {label}
      </Badge>
    </button>
  );
}

function ConflictBanner() {
  const { conflicts, resolveConflict } = useStore();
  const [open, setOpen] = useState(false);
  if (!conflicts.length) return null;
  return (
    <>
      <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 md:mx-8">
        <span className="flex items-center gap-2">
          <Icon name="warn" />
          Конфликты синхронизации: {conflicts.length}. Проверьте изменения, сделанные офлайн.
        </span>
        <Button size="sm" onClick={() => setOpen(true)}>
          Разобрать
        </Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Конфликты синхронизации" wide>
        <div className="space-y-3">
          {conflicts.map((c, i) => (
            <div key={c.op.opId} className="rounded-xl bg-zinc-50 p-3 text-sm">
              <div className="font-medium">{c.op.label || `${c.op.table}: ${c.op.kind}`}</div>
              <div className="mt-0.5 text-zinc-500">{c.message}</div>
              <div className="mt-0.5 text-xs text-zinc-400">Изменено офлайн: {new Date(c.op.at).toLocaleString("ru-RU")}</div>
              {c.op.data && (
                <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-white p-2 text-xs text-zinc-600">{JSON.stringify(c.op.data, null, 1)}</pre>
              )}
              <div className="mt-2 flex gap-2">
                {!c.message.startsWith("Сервер") && (
                  <Button size="sm" variant="primary" onClick={() => resolveConflict(i, "mine")}>
                    Применить мои
                  </Button>
                )}
                <Button size="sm" onClick={() => resolveConflict(i, "theirs")}>
                  {c.message.startsWith("Сервер") ? "Понятно" : "Оставить с сервера"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function NotConfigured() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#f2f2f7] p-6">
      <div className="max-w-md rounded-3xl bg-white p-6 text-sm text-zinc-600 shadow">
        <h1 className="mb-2 text-lg font-semibold text-zinc-900">Не настроено подключение к базе</h1>
        Укажите переменные <code>NEXT_PUBLIC_SUPABASE_URL</code> и <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (см. README).
      </div>
    </div>
  );
}
