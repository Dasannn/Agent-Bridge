export interface CommandResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
  /** Values that must never appear in the rendered output. */
  secrets?: string[];
}

const SECRET_PARAMS = ["code", "token", "access_token", "refresh_token", "id_token", "state"];
const PARAM_PATTERN = new RegExp(`([?&](?:${SECRET_PARAMS.join("|")})=)[^&\\s#"']*`, "g");

function maskSecrets(text: string, secrets: string[]): string {
  let masked = text;
  for (const secret of secrets) {
    if (secret) masked = masked.split(secret).join("***");
  }
  return masked;
}

/** Masks explicit secrets and credential-like URL parameters. For raw CLI output. */
export function mask(text: string, secrets: string[] = []): string {
  return maskSecrets(text, secrets).replace(PARAM_PATTERN, "$1***");
}

export function render(result: CommandResult, json: boolean): string {
  const text = json
    ? JSON.stringify({ ok: result.ok, message: result.message, ...result.data })
    : result.message;
  return `${maskSecrets(text, result.secrets ?? [])}\n`;
}
