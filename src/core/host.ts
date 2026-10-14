export type HostAgent = "claude" | "codex";

/** Detects the agent Agent-Bridge runs inside (decision 0006). */
export function detectHost(env: NodeJS.ProcessEnv): HostAgent | undefined {
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return "claude";
  if (env.CODEX_THREAD_ID || env.CODEX_SESSION_ID) return "codex";
  return undefined;
}
