import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agy, logoutAction } from "../../src/adapters/agy.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const provider = agy.providers[0];

describe("agy adapter", () => {
  it("parsePrompt extracts the full OAuth URL from the fixture", () => {
    const prompt = provider.parsePrompt(fixture("agy-login.txt"));
    expect(prompt?.url.startsWith("https://accounts.google.com/o/oauth2/auth?")).toBe(true);
    expect(prompt?.url).toContain("redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback");
    expect(prompt?.url.endsWith("&state=PLACEHOLDER")).toBe(true);
    expect(prompt?.url).not.toMatch(/\s/);
    expect(prompt?.code).toBeUndefined();
  });

  it("parsePrompt returns undefined before the URL is drawn", () => {
    expect(provider.parsePrompt(fixture("agy-menu.txt"))).toBeUndefined();
  });

  it("metadata matches decision 0003", () => {
    expect(agy.id).toBe("agy");
    expect(agy.binaries).toEqual(["agy"]);
    expect(agy.requiresLogin).toBe(true);
    expect(agy.providers).toHaveLength(1);
    expect(provider.id).toBe("default");
    expect(provider.command).toEqual(["agy"]);
    expect(provider.keys).toEqual([{ after: "Select login method", send: "\r" }]);
    expect(provider.strategy).toBe("paste-code");
    expect(agy.delegationExample).toContain("bridge run agy -- -p");
  });
});

// Lines from real Antigravity screens met while signing out (captured live).
const TOS_HEAD = [
  "Terms of Service & Data Use",
  "AI coding agents are known to have certain security risks, including autonomous code execution, data exfiltration,",
];
const TOS_TAIL = [
  "      Google to collect and use my Interactions data,",
  "      subject to the Google Antigravity CLI Terms of Service",
];
const tos = (checkbox: string, buttons: string) =>
  [...TOS_HEAD, checkbox, ...TOS_TAIL, buttons, "  ↑/↓ Navigate · enter Toggle"].join("\n");
const screens = {
  welcome: [
    "Welcome to Antigravity CLI!",
    "Choose your color scheme:        ╭──────────╮",
    "  > terminal                     │ > you: add a greeting function │",
    "    [Next]",
    "  ↑/↓ Navigate · enter Confirm",
  ].join("\n"),
  sharingOn: tos(
    "  > [x] Yes, I agree to help improve Antigravity CLI by allowing",
    "    [Previous]      [Done]",
  ),
  sharingOff: tos(
    "  > [ ] Yes, I agree to help improve Antigravity CLI by allowing",
    "    [Previous]      [Done]",
  ),
  onPrevious: tos(
    "    [ ] Yes, I agree to help improve Antigravity CLI by allowing",
    "  >  Previous       [Done]",
  ),
  onDone: tos(
    "    [ ] Yes, I agree to help improve Antigravity CLI by allowing",
    "    [Previous]    >  Done",
  ),
  onDoneSharing: tos(
    "    [x] Yes, I agree to help improve Antigravity CLI by allowing",
    "    [Previous]    >  Done",
  ),
  trust: [
    "Accessing workspace:",
    "/tmp/agy-logout-x",
    "Do you trust the contents of this project?",
    "Antigravity CLI requires permission to read, edit, and execute files here.",
    "> Yes, I trust this folder",
    "  No, exit",
  ].join("\n"),
  prompt: [
    " ┃ Verbosity now defaults to medium",
    "────────────",
    ">",
    "────────────",
    "? for shortcuts                                       Gemini 3.8 Flash · high",
  ].join("\n"),
  menu: [
    "────────────",
    "> /logout",
    "────────────",
    "> /logout  Log out",
    "  ↑/↓ Navigate · enter Select · tab Complete",
    "esc to cancel",
  ].join("\n"),
  signedOut: [
    " Welcome to the Antigravity CLI. You are currently not signed in.",
    " Select login method:",
    " > 1. Google OAuth",
  ].join("\n"),
};

describe("agy logout", () => {
  it("walks the first-run setup with data sharing turned off", () => {
    expect(logoutAction(screens.welcome)).toEqual({ send: "\r" });
    expect(logoutAction(screens.sharingOn)).toEqual({ send: "\r" });
    expect(logoutAction(screens.sharingOff)).toEqual({ send: "\u001b[B" });
    expect(logoutAction(screens.onPrevious)).toEqual({ send: "\u001b[C" });
    expect(logoutAction(screens.onDone)).toEqual({ send: "\r" });
  });

  it("never confirms the terms while data sharing is on", () => {
    expect(logoutAction(screens.onDoneSharing)).toEqual({ send: "\u001b[D" });
  });

  it("trusts the scratch folder, then runs /logout", () => {
    expect(logoutAction(screens.trust)).toEqual({ send: "\r" });
    expect(logoutAction(screens.prompt)).toEqual({ send: "/logout" });
    expect(logoutAction(screens.menu)).toEqual({ send: "\r" });
  });

  it("does not type /logout twice before its menu appears", () => {
    expect(logoutAction(screens.prompt.replace(/^>$/m, "> /logout"))).toBeUndefined();
  });

  it("stops once signed out, and waits on unknown screens", () => {
    expect(logoutAction(screens.signedOut)).toBe("done");
    expect(logoutAction("")).toBeUndefined();
    expect(logoutAction("Loading...")).toBeUndefined();
  });
});
