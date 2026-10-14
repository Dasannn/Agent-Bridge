// Rebuilds the generated section of skill/SKILL.md; run by `npm run build`.
import { writeFileSync } from "node:fs";
import { adapters } from "../adapters/index.js";
import { readSkill, skillPath, syncSkill } from "../core/skill.js";

writeFileSync(skillPath, syncSkill(readSkill(), adapters));
