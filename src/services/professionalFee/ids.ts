let n = 0;

export function id(prefix: string): string {
  n += 1;
  return `${prefix}_${Date.now().toString(36)}_${n.toString(36)}`;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
