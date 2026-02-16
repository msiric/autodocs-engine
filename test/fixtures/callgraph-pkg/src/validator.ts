export function validateInput(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  return true;
}
