export interface UserConfig {
  name: string;
  email: string;
  age?: number;
  roles: string[];
}

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
