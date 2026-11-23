// Decimal strings are kept exact until a chart needs a numeric coordinate.
export function analyticsCents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("INVALID_INPUT");
  const cents = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

export function analyticsMoney(cents: bigint): string {
  const negative = cents < BigInt(0);
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

// Round half away from zero, including signed corrections.
export function analyticsAverage(total: bigint, count: number): string {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("INVALID_INPUT");
  const divisor = BigInt(count);
  const absolute = total < BigInt(0) ? -total : total;
  const rounded = (absolute + divisor / BigInt(2)) / divisor;
  return analyticsMoney(total < BigInt(0) ? -rounded : rounded);
}

export function analyticsParams(params: URLSearchParams, allowed: readonly string[]): void {
  for (const key of new Set(params.keys())) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error("INVALID_INPUT");
  }
}

export function analyticsMonth(month: string, current: string): string {
  const parse = (value: string) => {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
    if (!match || match[1] === "0000") throw new Error("INVALID_INPUT");
    return Number(match[1]) * 12 + Number(match[2]) - 1;
  };
  const offset = parse(current) - parse(month);
  if (offset < 0 || offset >= 24) throw new Error("INVALID_INPUT");
  return month;
}
