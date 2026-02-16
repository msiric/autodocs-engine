export function formatOutput(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}
