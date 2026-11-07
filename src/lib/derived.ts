"use client";

import { useMemo } from "react";
import { useStore } from "./store";
import { clientFinance, plannableWeeks, type ClientFinance, type PlanEntry } from "./billing";
import type { Client, Greenhouse, Payment, Visit } from "./types";
import { today } from "./dates";

export interface ClientBundle {
  client: Client;
  greenhouses: Greenhouse[];
  payments: Payment[];
  visits: Visit[];
  fin: ClientFinance;
  plan: PlanEntry[];
  area: number;
}

function groupBy<T extends { client_id: string }>(list: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const a = m.get(x.client_id);
    if (a) a.push(x);
    else m.set(x.client_id, [x]);
  }
  return m;
}

export function useBundles() {
  const { data } = useStore();
  return useMemo(() => {
    const t = today();
    const gh = groupBy(data.greenhouses);
    const pay = groupBy(data.payments.filter((p) => !p.deleted));
    const vis = groupBy(data.visits);
    const list: ClientBundle[] = data.clients.map((client) => {
      const greenhouses = gh.get(client.id) || [];
      const payments = (pay.get(client.id) || []).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
      const visits = vis.get(client.id) || [];
      const fin = clientFinance(client, greenhouses, payments, visits, t);
      return {
        client,
        greenhouses,
        payments,
        visits,
        fin,
        plan: plannableWeeks(client, fin, visits, t),
        area: greenhouses.filter((g) => !g.archived).reduce((s, g) => s + Number(g.area), 0),
      };
    });
    list.sort((a, b) => a.client.full_name.localeCompare(b.client.full_name, "ru"));
    const byId = new Map(list.map((b) => [b.client.id, b]));
    return { list, byId };
  }, [data]);
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
}
