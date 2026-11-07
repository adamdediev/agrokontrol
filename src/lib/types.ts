export type Role = "admin" | "agronom";

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  role: Role;
  recovery_email: string | null;
  created_at: string;
}

export interface Settings {
  id: number;
  work_days: number[];
  day_start: string;
  day_end: string;
  visit_limit: number;
  visit_duration: number;
  interval_min: number;
  travel_min: number;
  period_anchor: string;
  updated_at: string;
}

export type ClientStatus = "active" | "paused" | "archived";

export interface Client {
  id: string;
  full_name: string;
  phone: string;
  district: string;
  settlement: string;
  address: string;
  preferred_time: string;
  notes: string;
  status: ClientStatus;
  discount_percent: number;
  manual_price: number | null;
  old_debt: number;
  old_debt_note: string;
  pay_on_visit: boolean;
  created_at: string;
  updated_at: string;
}

export interface Greenhouse {
  id: string;
  client_id: string;
  name: string;
  area: number;
  tariff: number;
  address: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type PayMethod = "cash" | "card";

export interface Payment {
  id: string;
  client_id: string;
  paid_at: string;
  amount: number;
  method: PayMethod;
  received_by: string;
  weeks: string[];
  note: string;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

export type VisitStatus = "planned" | "done" | "missed" | "rescheduled";

export interface Visit {
  id: string;
  client_id: string;
  week_start: string;
  visit_date: string | null;
  start_time: string | null;
  duration_min: number;
  status: VisitStatus;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  at: string;
  user_id: string | null;
  user_name: string;
  table_name: string;
  row_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

export interface DataState {
  settings: Settings;
  clients: Client[];
  greenhouses: Greenhouse[];
  payments: Payment[];
  visits: Visit[];
  profiles: Profile[];
}

export type TableName = "clients" | "greenhouses" | "payments" | "visits" | "settings";

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  work_days: [3, 4],
  day_start: "09:00:00",
  day_end: "18:00:00",
  visit_limit: 8,
  visit_duration: 60,
  interval_min: 10,
  travel_min: 30,
  period_anchor: "2026-01-05",
  updated_at: "",
};
