const TIME_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function durationToMs(input: string) {
  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration format: ${input}`);
  }
  const [, amount, unit] = match;
  return Number(amount) * TIME_UNITS[unit.toLowerCase()];
}
