import type { StrategyId } from "./adapter.js";

export type ValidationResult = { ok: true; value?: string } | { ok: false; error: string };

const MAX_CODE_LENGTH = 2048;

export function validateResponse(
  strategy: StrategyId,
  input: string | undefined,
): ValidationResult {
  if (strategy === "device-code") return { ok: true };

  const value = input?.trim() ?? "";
  if (!value) {
    return { ok: false, error: "Paste the code shown in the browser after signing in." };
  }
  if (/\s/.test(value)) {
    return { ok: false, error: "The code must not contain spaces. Paste only the code." };
  }
  if (value.length > MAX_CODE_LENGTH) {
    return { ok: false, error: "That is too long to be a code. Paste only the code." };
  }
  return { ok: true, value };
}
