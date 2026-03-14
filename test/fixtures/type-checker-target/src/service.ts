import type { Result, UserConfig } from "./types.js";

export function createUser(config: UserConfig): Result<string> {
  if (!config.name) return { ok: false, error: new Error("Name required") };
  return { ok: true, value: `user-${config.name}` };
}

export async function fetchUser(id: string, timeout?: number): Promise<UserConfig | null> {
  return null;
}

export const MAX_RETRIES = 3;

export const processUser = (user: UserConfig): string => {
  return `${user.name} <${user.email}>`;
};
