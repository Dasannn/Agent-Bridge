// The shipped skill (skill/SKILL.md) and its section generated from the adapters.
import { readFileSync } from "node:fs";
import type { Adapter } from "./adapter.js";

const START = "<!-- agents:start -->";
const END = "<!-- agents:end -->";

export const skillPath = new URL("../../skill/SKILL.md", import.meta.url);

export function readSkill(): string {
  return readFileSync(skillPath, "utf8");
}

/** Per-CLI delegation, model, and effort options, generated from the adapters. */
export function agentsSection(adapters: Adapter[]): string {
  return adapters
    .map((adapter) =>
      [
        `### ${adapter.displayName} (\`${adapter.id}\`)`,
        "",
        `- Delegate: \`${adapter.delegationExample}\``,
        `- Models: ${adapter.models.list}`,
        `- Model: ${adapter.models.model}`,
        `- Effort: ${adapter.models.effort}`,
      ].join("\n"),
    )
    .join("\n\n");
}

/** Returns the skill text with its generated section rebuilt from the adapters. */
export function syncSkill(text: string, adapters: Adapter[]): string {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < start) throw new Error("The skill is missing its agents markers.");
  return `${text.slice(0, start + START.length)}\n${agentsSection(adapters)}\n${text.slice(end)}`;
}
