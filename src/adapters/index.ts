import type { Adapter } from "../core/adapter.js";
import { agy } from "./agy.js";
import { claude } from "./claude.js";
import { codex } from "./codex.js";
import { opencode } from "./opencode.js";

/** Built-in adapters. */
export const adapters: Adapter[] = [opencode, agy, codex, claude];
