#!/usr/bin/env node
// Scripted CLI that imitates the login flows Agent-Bridge drives.
// Credentials live in $HOME/.fake-cli/auth.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2];
const authDir = join(process.env.HOME ?? ".", ".fake-cli");
const authFile = join(authDir, "auth");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function saveAuth() {
  mkdirSync(authDir, { recursive: true });
  writeFileSync(authFile, "token");
}

function readUntil(predicate) {
  return new Promise((resolve) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      if (predicate(buffer)) {
        process.stdin.off("data", onData);
        resolve(buffer);
      }
    };
    process.stdin.on("data", onData);
  });
}

async function pasteCode() {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  // Like Antigravity: ask for primary device attributes and draw nothing until answered.
  process.stdout.write("\x1b[c");
  const ESC = String.fromCharCode(27);
  await readUntil((b) => b.includes(`${ESC}[?`) && /\[\?[\d;]*c/.test(b));
  process.stdout.write("Open https://example.test/auth?state=s1\r\nPaste code: ");
  const line = await readUntil((b) => /[\r\n]/.test(b));
  const code = line.split(/[\r\n]/)[0].trim();
  // Echo the typed code, as interactive CLIs do.
  process.stdout.write(code);
  if (code === "GOOD-CODE" || code === "-GOOD-CODE") {
    saveAuth();
    if (process.env.FAKE_STAY_OPEN === "1") {
      // Like Antigravity: continue into first-run screens instead of exiting.
      process.stdout.write("\r\nChoose a theme:\r\n");
      setInterval(() => {}, 1000);
      return;
    }
    process.stdout.write("\r\nSigned in\r\n");
    process.exit(0);
  }
  process.stdout.write("\r\nInvalid code\r\n");
  process.exit(1);
}

async function deviceCode() {
  process.stdout.write("Go to https://example.test/device\r\nEnter code: ABCD-1234\r\n");
  await sleep(Number(process.env.FAKE_DEVICE_MS ?? 500));
  if (process.env.FAKE_FAIL === "1") {
    process.stdout.write("Denied\r\n");
    process.exit(1);
  }
  saveAuth();
  process.stdout.write("Signed in\r\n");
  process.exit(0);
}

async function loopback() {
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const ok =
      url.pathname === "/cb" &&
      url.searchParams.get("state") === "s1" &&
      url.searchParams.get("code") === "GOOD-CODE";
    res.writeHead(ok ? 200 : 400).end(ok ? "Signed in" : "Login failed");
    if (ok) saveAuth();
    process.stdout.write(ok ? "Signed in\r\n" : "Login failed\r\n");
    setTimeout(() => process.exit(ok ? 0 : 1), 100);
  });
  server.listen(0, "127.0.0.1", () => {
    const redirect = encodeURIComponent(`http://127.0.0.1:${server.address().port}/cb`);
    process.stdout.write(
      `Open https://example.test/auth?redirect_uri=${redirect}&state=s1\r\nWaiting for the browser\r\n`,
    );
  });
}

switch (mode) {
  case "loopback":
    await loopback();
    break;
  case "paste-code":
    await pasteCode();
    break;
  case "device-code":
    await deviceCode();
    break;
  case "menu": {
    // Draws a loading screen, discards input typed too early, then shows a menu.
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    let ready = false;
    let typed = "";
    process.stdin.on("data", (chunk) => {
      if (!ready) return;
      typed += chunk.toString("utf8");
      if (typed.includes("\r")) {
        if (typed.startsWith("2")) {
          process.stdout.write(
            "\r\nGo to https://example.test/device\r\nEnter code: ABCD-1234\r\n",
          );
          setTimeout(() => {
            saveAuth();
            process.exit(0);
          }, 300);
        } else {
          process.stdout.write("\r\nWrong choice\r\n");
          process.exit(1);
        }
      }
    });
    process.stdout.write("Loading...\r\n");
    await sleep(800);
    ready = true;
    process.stdout.write("Pick 1 or 2: ");
    break;
  }
  case "stubborn":
    // Ignores the signals a terminal hangup or polite stop would send.
    process.on("SIGHUP", () => {});
    process.on("SIGTERM", () => {});
    process.stdout.write("Open https://example.test/auth?state=s9\r\nPaste code: ");
    setInterval(() => {}, 1000);
    break;
  case "silent":
    setInterval(() => {}, 1000);
    break;
  case "long-url":
    process.stdout.write(`https://example.test/${"x".repeat(300)}\r\n`);
    await sleep(10_000);
    break;
  case "status":
    process.exit(existsSync(authFile) ? 0 : 1);
    break;
  case "logout":
    rmSync(authFile, { force: true });
    process.exit(0);
    break;
  default:
    process.stderr.write(`unknown mode ${mode}\n`);
    process.exit(2);
}
