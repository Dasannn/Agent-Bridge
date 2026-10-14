import type { LoginPrompt, StrategyId } from "./adapter.js";

export type ValidationResult = { ok: true; value?: string } | { ok: false; error: string };

const MAX_CODE_LENGTH = 2048;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Where a loopback login redirects the browser: its `redirect_uri` and `state`. */
export function callbackTarget(
  prompt: LoginPrompt | undefined,
): { port: number; path: string; state: string | null } | undefined {
  try {
    const params = new URL(prompt?.url ?? "").searchParams;
    const redirect = new URL(params.get("redirect_uri") ?? "");
    if (!LOOPBACK_HOSTS.has(redirect.hostname) || !redirect.port) return undefined;
    return { port: Number(redirect.port), path: redirect.pathname, state: params.get("state") };
  } catch {
    return undefined;
  }
}

function validateCallback(
  input: string | undefined,
  prompt: LoginPrompt | undefined,
): ValidationResult {
  const target = callbackTarget(prompt);
  const port = target?.port ?? "the login's port";
  const explain = `After signing in, copy the full address from your browser's address bar (it starts with http://localhost:${port}/) and paste it.`;
  let value = input?.trim() ?? "";
  if (/^(localhost|127\.0\.0\.1):/.test(value)) value = `http://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: explain };
  }
  if (
    !target ||
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    Number(url.port) !== target.port ||
    url.pathname !== target.path
  ) {
    return { ok: false, error: `That is not the address this login is waiting for. ${explain}` };
  }
  if (url.searchParams.get("state") !== target.state) {
    return {
      ok: false,
      error: "That address belongs to a different login. Paste the address from this login.",
    };
  }
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
    return { ok: false, error: `That address has no authorization code. ${explain}` };
  }
  return { ok: true, value: `${url.pathname}${url.search}` };
}

export function validateResponse(
  strategy: StrategyId,
  input: string | undefined,
  prompt?: LoginPrompt,
): ValidationResult {
  if (strategy === "device-code") return { ok: true };
  if (strategy === "loopback-callback") return validateCallback(input, prompt);

  const value = input?.trim() ?? "";
  if (!value) {
    return { ok: false, error: "Paste the code shown in the browser after signing in." };
  }
  if (value.includes("://")) {
    return { ok: false, error: "That looks like a URL. Paste only the code shown in the browser." };
  }
  if (/\s/.test(value)) {
    return { ok: false, error: "The code must not contain spaces. Paste only the code." };
  }
  if (value.length > MAX_CODE_LENGTH) {
    return { ok: false, error: "That is too long to be a code. Paste only the code." };
  }
  return { ok: true, value };
}
