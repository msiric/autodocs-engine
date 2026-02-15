export interface ClientOptions {
  baseUrl: string;
  timeout?: number;
}

export function createClient(options: ClientOptions): { get: (path: string) => Promise<unknown> } {
  return {
    get: async (path: string) => {
      const res = await fetch(`${options.baseUrl}${path}`);
      return res.json();
    },
  };
}
