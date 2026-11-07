"use client";

import { Input } from "./ui";

/** Цифры номера без кода страны из сохранённого значения (7XXXXXXXXXX, 8XXXXXXXXXX и т.п.) */
function storedDigits(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d[0] === "7" || (d.length === 11 && d[0] === "8")) d = d.slice(1);
  return d.slice(0, 10);
}

/** Цифры из того, что пользователь ввёл или вставил в поле */
function typedDigits(text: string): string {
  if (text.trim().startsWith("+7")) return text.trim().slice(2).replace(/\D/g, "").slice(0, 10);
  let d = text.replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
  return d.slice(0, 10);
}

function mask(d: string): string {
  if (!d) return "";
  let s = "+7 (" + d.slice(0, 3);
  if (d.length >= 3) s += ") ";
  if (d.length > 3) s += d.slice(3, 6);
  if (d.length > 6) s += "-" + d.slice(6, 8);
  if (d.length > 8) s += "-" + d.slice(8, 10);
  return s;
}

export function formatPhoneMask(raw: string): string {
  return mask(storedDigits(raw));
}

/** Полный номер в формате 7XXXXXXXXXX (или пусто) */
export function phoneValue(raw: string): string {
  const d = storedDigits(raw);
  return d ? "7" + d : "";
}

export function isPhoneComplete(raw: string): boolean {
  return storedDigits(raw).length === 10;
}

/**
 * Поле телефона с маской +7 (XXX) XXX-XX-XX.
 * value/onChange работают с номером вида 7XXXXXXXXXX.
 */
export function PhoneInput({
  value,
  onChange,
  required,
  autoFocus,
  autoComplete = "tel",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  id?: string;
}) {
  const shown = formatPhoneMask(value);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    let d = typedDigits(next);
    // стёрли только символ маски — убираем и последнюю цифру
    if (next.length === shown.length - 1 && d === storedDigits(value)) d = d.slice(0, -1);
    onChange(d ? "7" + d : "");
  }

  return (
    <Input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete={autoComplete}
      placeholder="+7 (900) 000-00-00"
      value={shown}
      onChange={handle}
      required={required}
      autoFocus={autoFocus}
      pattern="\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}"
      title="Номер в формате +7 (900) 000-00-00"
      maxLength={18}
    />
  );
}
