import { execSync } from "node:child_process";

// The session runner runs as its own Node.js process from the compiled output.
export default function setup() {
  execSync("npx tsc -p .", { stdio: "inherit" });
}
