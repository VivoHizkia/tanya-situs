import type { PlanName } from "./types";

export type PlanLimits = { bots: number; pagesPerBot: number; messagesPerMonth: number };

// What each plan allows. An account's plan is changed with `npm run plan -- <email> <plan>`.
export const PLANS: Record<PlanName, PlanLimits> = {
  free: { bots: 1, pagesPerBot: 10, messagesPerMonth: 200 },
  pro: { bots: 5, pagesPerBot: 50, messagesPerMonth: 5000 },
};

export const isPlanName = (value: string): value is PlanName => value in PLANS;

export const limitsFor = (plan: string): PlanLimits =>
  isPlanName(plan) ? PLANS[plan] : PLANS.free;

// "2026-11": the key of one month of usage. UTC, so it does not depend on the server's zone.
export const monthKey = (now = new Date()): string => now.toISOString().slice(0, 7);
