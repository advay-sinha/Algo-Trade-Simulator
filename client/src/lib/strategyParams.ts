// Strategy parameter form helpers shared by the backtest runner and simulation creation.
import type { StrategySpec } from "../types";

export type ParamValues = Record<string, string>;

export function defaultsFor(strategy: StrategySpec | undefined): ParamValues {
  const values: ParamValues = {};
  for (const param of strategy?.parameters ?? []) values[param.name] = param.default != null ? String(param.default) : "";
  return values;
}

export function validateParam(spec: StrategySpec["parameters"][number], raw: string): string | undefined {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) return "Enter a number.";
  if (spec.type === "integer" && !Number.isInteger(value)) return "Use a whole number.";
  if (spec.minimum != null && value < spec.minimum) return `Use ${spec.minimum} or more.`;
  if (spec.maximum != null && value > spec.maximum) return `Use ${spec.maximum} or less.`;
  return undefined;
}

export function toNumbers(values: ParamValues): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
}
