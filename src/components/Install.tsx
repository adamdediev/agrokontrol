"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Button, Modal } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

interface InstallState {
  /** приложение уже открыто как установленное */
  standalone: boolean;
  platform: Platform;
  /** браузер готов показать системное окно установки */
  canPrompt: boolean;
  install: () => void;
}

const Ctx = createContext<InstallState>({ standalone: false, platform: "desktop", canPrompt: false, install: () => undefined });
const K_DISMISS = "ak.install.dismissed";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    const mq = window.matchMedia("(display-mode: standalone)");
    const check = () => setStandalone(mq.matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    check();
    mq.addEventListener("change", check);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setEvt(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      mq.removeEventListener("change", check);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(() => {
    if (evt) {
      void evt.prompt();
      void evt.userChoice.then(() => setEvt(null));
    } else {
      setHelp(true);
    }
  }, [evt]);

  return (
    <Ctx.Provider value={{ standalone, platform, canPrompt: !!evt, install }}>
      {children}
      <Modal open={help} onClose={() => setHelp(false)} title="Установить на телефон" footer={<Button variant="primary" onClick={() => setHelp(false)}>Понятно</Button>}>
        <InstallSteps platform={platform} />
      </Modal>
    </Ctx.Provider>
  );
}

export function useInstall() {
  return useContext(Ctx);
}

export function InstallSteps({ platform }: { platform: Platform }) {
  if (platform === "ios") {
    return (
      <ol className="space-y-3 text-[15px]">
        <li className="flex gap-3"><Num n={1} />Откройте сайт в <b>Safari</b>.</li>
        <li className="flex gap-3">
          <Num n={2} />
          <span>
            Нажмите кнопку «Поделиться» <ShareIcon /> внизу экрана.
          </span>
        </li>
        <li className="flex gap-3"><Num n={3} /><span>Выберите <b>«На экран „Домой“»</b> и нажмите «Добавить».</span></li>
        <li className="flex gap-3"><Num n={4} />Запускайте AgroKontrol с иконки — он откроется как приложение, без адресной строки.</li>
      </ol>
    );
  }
  if (platform === "android") {
    return (
      <ol className="space-y-3 text-[15px]">
        <li className="flex gap-3"><Num n={1} />Откройте сайт в <b>Chrome</b>.</li>
        <li className="flex gap-3"><Num n={2} /><span>Нажмите меню <b>⋮</b> в правом верхнем углу.</span></li>
        <li className="flex gap-3"><Num n={3} /><span>Выберите <b>«Установить приложение»</b> или «Добавить на главный экран».</span></li>
        <li className="flex gap-3"><Num n={4} />Иконка AgroKontrol появится на рабочем столе.</li>
      </ol>
    );
  }
  return (
    <ol className="space-y-3 text-[15px]">
      <li className="flex gap-3"><Num n={1} />Откройте сайт в Chrome или Edge.</li>
      <li className="flex gap-3"><Num n={2} />Нажмите значок установки ⊕ в правой части адресной строки.</li>
      <li className="flex gap-3"><Num n={3} />Подтвердите «Установить».</li>
    </ol>
  );
}

/** Баннер «Установите приложение» — показывается в браузере, пока приложение не установлено */
export function InstallBanner() {
  const { standalone, platform, canPrompt, install } = useInstall();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const t = Number(localStorage.getItem(K_DISMISS) || 0);
    setHidden(Date.now() - t < 14 * 86400000);
  }, []);

  if (standalone || hidden) return null;
  if (platform === "desktop" && !canPrompt) return null;

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 md:mx-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icon-192.png`} alt="" className="h-11 w-11 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold leading-tight">Установите приложение</div>
        <div className="text-xs leading-tight text-zinc-500">Иконка на экране, работа без интернета</div>
      </div>
      <Button size="sm" variant="primary" onClick={install}>Установить</Button>
      <button
        aria-label="Скрыть"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100"
        onClick={() => {
          localStorage.setItem(K_DISMISS, String(Date.now()));
          setHidden(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-700 text-xs font-semibold text-white">{n}</span>;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline h-5 w-5 align-[-4px] text-sky-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
