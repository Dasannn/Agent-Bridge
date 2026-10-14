import type { Adapter } from "../core/adapter.js";
import { agy } from "./agy.js";
import { codex } from "./codex.js";

/** Built-in adapters. */
export const adapters: Adapter[] = [agy, codex];
