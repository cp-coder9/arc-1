let counter = 0;

export function createId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function iso(now = new Date()): string {
  return now.toISOString();
}
