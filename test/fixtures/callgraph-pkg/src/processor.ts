import { validateInput } from "./validator.js";
import { formatOutput } from "./formatter.js";

export function processData(input: unknown): string {
  if (!validateInput(input)) {
    throw new Error("Invalid input");
  }
  const result = { processed: true, data: input };
  return formatOutput(result);
}
