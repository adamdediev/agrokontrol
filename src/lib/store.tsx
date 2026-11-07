"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isConfigured } from "./supabase";
import { DEFAULT_SETTINGS, type DataState, type Profile, type TableName } from "./types";
import { normalizePhone, uuid } from "./format";

type Row = Record<string, unknown> & { id: string | number; updated_at?: string };

export interface Op {
  opId: string;
  table: TableName;
  kind: "insert" | "update" | "delete";
  id: string | number;
  data?: Record<string, unknown>;
  base?: string | null; // updated_at строки на сервере в момент правки
  at: string;
  label: string;
}

export interface Conflict {
  op: Op;
  server: Row | null;
  message: string;
}

type AuthState = "loading" | "out" | "in";

interface StoreValue {
  auth: AuthState;
  me: Profile | null;
  isAdmin: boolean;
  data: DataState;
  loaded: boolean;
  online: boolean;
  syncing: boolean;
  queue: Op[];
  conflicts: Conflict[];
  lastSync: string | null;
  insert: (table: TableName, row: Record<string, unknown>, label?: string) => string;
  update: (table: TableName, id: string | number, patch: Record<string, unknown>, label?: string) => void;
  remove: (table: TableName, id: string | number, label?: string) => void;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (index: number, choice: "mine" | "theirs") => void;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const EMPTY: DataState = { settings: DEFAULT_SETTINGS, clients: [], greenhouses: [], payments: [], visits: [], profiles: [] };

const K_CACHE = "ak.cache.v1";
const K_QUEUE = "ak.queue.v1";
const K_CONFLICTS = "ak.conflicts.v1";
const K_ME = "ak.me.v1";
const K_SERVER = "ak.server.v1";

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* переполнение хранилища — игнорируем */
  }
}

const Ctx = createContext<StoreValue | null>(null);

async function fetchAll(table: string): Promise<Row[]> {
  const out: Row[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data as Row[]) || []));
    if (!data || data.length < page) break;
  }
  return out;
}

/** Применить операцию к локальным данным (оптимистично) */
function applyOp(state: DataState, op: Op): DataState {
  const now = new Date().toISOString();
  if (op.table === "settings") {
    if (op.kind !== "update") return state;
    return { ...state, settings: { ...state.settings, ...(op.data as object), updated_at: now } };
  }
  const list = state[op.table] as unknown as Row[];
  let next: Row[];
  if (op.kind === "insert") {
    next = [...list.filter((r) => r.id !== op.id), { created_at: now, updated_at: now, ...op.data, id: op.id } as Row];
  } else if (op.kind === "update") {
    next = list.map((r) => (r.id === op.id ? { ...r, ...op.data } : r));
  } else {
    next = list.filter((r) => r.id !== op.id);
  }
  return { ...state, [op.table]: next };
}

function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const err = e as { code?: string; message?: string; name?: string };
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (err.code && err.code !== "" && !/fetch/i.test(err.message || "")) return false;
  return /fetch|network|load failed|timeout/i.test(err.message || "") || err.name === "TypeError";
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>("loading");
  const [me, setMe] = useState<Profile | null>(null);
  const [server, setServer] = useState<DataState>(EMPTY); // последний снимок с сервера
  const [queue, setQueue] = useState<Op[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const queueRef = useRef<Op[]>([]);
  const syncingRef = useRef(false);
  const againRef = useRef(false); // синхронизацию запросили, пока шла предыдущая

  // начальная загрузка из кэша
  useEffect(() => {
    const cached = load<DataState | null>(K_SERVER, null) || load<DataState | null>(K_CACHE, null);
    if (cached) {
      setServer({ ...EMPTY, ...cached, settings: { ...DEFAULT_SETTINGS, ...cached.settings } });
      setLoaded(true);
    }
    const q = load<Op[]>(K_QUEUE, []);
    queueRef.current = q;
    setQueue(q);
    setConflicts(load<Conflict[]>(K_CONFLICTS, []));
    setMe(load<Profile | null>(K_ME, null));
    setLastSync(localStorage.getItem("ak.lastSync"));
    setOnline(navigator.onLine);
  }, []);

  const setQ = useCallback((q: Op[]) => {
    queueRef.current = q;
    setQueue(q);
    save(K_QUEUE, q);
  }, []);

  const data = useMemo(() => queue.reduce(applyOp, server), [server, queue]);

  const refresh = useCallback(async () => {
    if (!isConfigured) return;
    try {
      const [clients, greenhouses, payments, visits, profiles, settingsRows] = await Promise.all([
        fetchAll("clients"),
        fetchAll("greenhouses"),
        fetchAll("payments"),
        fetchAll("visits"),
        fetchAll("profiles"),
        fetchAll("settings"),
      ]);
      const next = {
        clients,
        greenhouses,
        payments,
        visits,
        profiles,
        settings: { ...DEFAULT_SETTINGS, ...(settingsRows[0] || {}) },
      } as unknown as DataState;
      setServer(next);
      save(K_SERVER, next);
      setLoaded(true);
      const t = new Date().toISOString();
      setLastSync(t);
      localStorage.setItem("ak.lastSync", t);
    } catch (e) {
      if (!isNetworkError(e)) console.error(e);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!isConfigured) return;
    if (syncingRef.current) {
      againRef.current = true;
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    const newConflicts: Conflict[] = [];
    const bumped = new Map<string | number, { from: string | null | undefined; to: string }>();
    try {
      while (queueRef.current.length > 0) {
        const op = { ...queueRef.current[0] };
        const b = bumped.get(op.id);
        if (b && op.base === b.from) op.base = b.to;
        let ok = true;
        try {
          if (op.kind === "insert") {
            const { error } = await supabase.from(op.table).upsert({ ...op.data, id: op.id }, { onConflict: "id", ignoreDuplicates: true });
            if (error) throw error;
          } else if (op.kind === "update") {
            let qb = supabase.from(op.table).update(op.data!).eq("id", op.id);
            if (op.base) qb = qb.eq("updated_at", op.base);
            const { data: rows, error } = await qb.select();
            if (error) throw error;
            if (!rows || rows.length === 0) {
              const { data: cur } = await supabase.from(op.table).select("*").eq("id", op.id).maybeSingle();
              newConflicts.push({
                op,
                server: (cur as Row) || null,
                message: cur
                  ? "Запись была изменена на другом устройстве, пока вы были офлайн"
                  : "Запись была удалена на другом устройстве",
              });
            } else {
              bumped.set(op.id, { from: op.base, to: (rows[0] as Row).updated_at as string });
            }
          } else {
            const { error } = await supabase.from(op.table).delete().eq("id", op.id);
            if (error) throw error;
          }
        } catch (e) {
          if (isNetworkError(e)) {
            ok = false;
          } else {
            const msg = (e as { message?: string }).message || "Ошибка сервера";
            newConflicts.push({ op, server: null, message: `Сервер отклонил изменение: ${msg}` });
          }
        }
        if (!ok) break;
        setQ(queueRef.current.slice(1));
      }
    } finally {
      if (newConflicts.length) {
        setConflicts((c) => {
          const n = [...c, ...newConflicts];
          save(K_CONFLICTS, n);
          return n;
        });
      }
      await refresh();
      syncingRef.current = false;
      setSyncing(false);
      if (againRef.current) {
        againRef.current = false;
        setTimeout(() => void syncRef.current(), 0);
      }
    }
  }, [refresh, setQ]);
  const syncRef = useRef(syncNow);
  useEffect(() => {
    syncRef.current = syncNow;
  }, [syncNow]);

  const enqueue = useCallback(
    (op: Op) => {
      setQ([...queueRef.current, op]);
      setTimeout(() => void syncNow(), 0);
    },
    [setQ, syncNow],
  );

  const serverRow = useCallback(
    (table: TableName, id: string | number): Row | undefined => {
      if (table === "settings") return server.settings as unknown as Row;
      return (server[table] as unknown as Row[]).find((r) => r.id === id);
    },
    [server],
  );

  const insert = useCallback(
    (table: TableName, row: Record<string, unknown>, label = "") => {
      const id = (row.id as string) || uuid();
      const data = { ...row, id };
      enqueue({ opId: uuid(), table, kind: "insert", id, data, at: new Date().toISOString(), label });
      return id;
    },
    [enqueue],
  );

  const update = useCallback(
    (table: TableName, id: string | number, patch: Record<string, unknown>, label = "") => {
      const sr = serverRow(table, id);
      const clean = { ...patch };
      delete clean.updated_at;
      delete clean.created_at;
      enqueue({ opId: uuid(), table, kind: "update", id, data: clean, base: sr?.updated_at ?? null, at: new Date().toISOString(), label });
    },
    [enqueue, serverRow],
  );

  const remove = useCallback(
    (table: TableName, id: string | number, label = "") => {
      enqueue({ opId: uuid(), table, kind: "delete", id, at: new Date().toISOString(), label });
    },
    [enqueue],
  );

  const resolveConflict = useCallback(
    (index: number, choice: "mine" | "theirs") => {
      setConflicts((c) => {
        const item = c[index];
        const n = c.filter((_, i) => i !== index);
        save(K_CONFLICTS, n);
        if (item && choice === "mine") {
          if (item.server) {
            enqueue({ ...item.op, opId: uuid(), base: (item.server.updated_at as string) || null });
          } else if (item.op.kind === "update" && item.op.table !== "settings" && !item.message.startsWith("Сервер")) {
            // запись удалена — создаём заново с нашими данными
            const local = (server[item.op.table] as unknown as Row[]).find((r) => r.id === item.op.id) || {};
            enqueue({ ...item.op, opId: uuid(), kind: "insert", data: { ...local, ...item.op.data } });
          }
        }
        return n;
      });
    },
    [enqueue, server],
  );

  // сессия и профиль
  const loadProfile = useCallback(async (userId: string) => {
    const { data: p, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) {
      if (isNetworkError(error)) return; // офлайн — используем кэш
      throw error;
    }
    if (p) {
      setMe(p as Profile);
      save(K_ME, p);
    } else {
      // пользователь есть в auth, но нет профиля — доступа нет
      await supabase.auth.signOut();
      setMe(null);
      setAuth("out");
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setAuth("out");
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        setAuth("in");
        await loadProfile(session.user.id).catch(console.error);
        void syncNow();
      } else {
        setAuth("out");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setAuth("out");
        setMe(null);
      } else if (session && event === "SIGNED_IN") {
        setAuth("in");
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, syncNow]);

  // онлайн/офлайн и периодическая синхронизация
  useEffect(() => {
    const on = () => {
      setOnline(true);
      void syncNow();
    };
    const off = () => setOnline(false);
    const focus = () => {
      if (navigator.onLine) void syncNow();
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("focus", focus);
    const t = setInterval(() => {
      if (navigator.onLine && auth === "in") void syncNow();
    }, 60000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", focus);
      clearInterval(t);
    };
  }, [syncNow, auth]);

  const signIn = useCallback(
    async (phone: string, password: string) => {
      const { data: email, error } = await supabase.rpc("login_email", { p_phone: normalizePhone(phone) });
      if (error) throw new Error(isNetworkError(error) ? "Нет связи с сервером" : error.message);
      if (!email) throw new Error("Пользователь с таким телефоном не найден");
      const { data: res, error: e2 } = await supabase.auth.signInWithPassword({ email: email as string, password });
      if (e2) throw new Error(/invalid/i.test(e2.message) ? "Неверный пароль" : e2.message);
      setAuth("in");
      await loadProfile(res.user.id);
      await syncNow();
    },
    [loadProfile, syncNow],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => undefined);
    localStorage.removeItem(K_ME);
    localStorage.removeItem(K_SERVER);
    localStorage.removeItem(K_CACHE);
    setServer(EMPTY);
    setMe(null);
    setAuth("out");
  }, []);

  const value: StoreValue = {
    auth,
    me,
    isAdmin: me?.role === "admin",
    data,
    loaded,
    online,
    syncing,
    queue,
    conflicts,
    lastSync,
    insert,
    update,
    remove,
    refresh,
    syncNow,
    resolveConflict,
    signIn,
    signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("StoreProvider missing");
  return v;
}
