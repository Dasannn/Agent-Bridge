import { describe, expect, it } from "vitest";
import { mask, render } from "../../src/core/output.js";

describe("mask", () => {
  it("masks listed secrets", () => {
    expect(mask("token is s3cret-value here", ["s3cret-value"])).toBe("token is *** here");
  });

  it("masks code and state query parameters", () => {
    expect(mask("https://x/cb?code=abc&state=def&scope=s")).toBe(
      "https://x/cb?code=***&state=***&scope=s",
    );
  });

  it("masks token query parameters", () => {
    expect(mask("https://x/?access_token=a&refresh_token=b&id_token=c&token=d")).toBe(
      "https://x/?access_token=***&refresh_token=***&id_token=***&token=***",
    );
  });

  it("leaves text without secrets unchanged", () => {
    expect(mask("Open https://example.test/device and enter ABCD-1234")).toBe(
      "Open https://example.test/device and enter ABCD-1234",
    );
  });

  it("ignores empty secrets", () => {
    expect(mask("abc", [""])).toBe("abc");
  });
});

describe("render", () => {
  it("renders text", () => {
    expect(render({ ok: true, message: "Done" }, false)).toBe("Done\n");
  });

  it("renders json with data fields", () => {
    expect(JSON.parse(render({ ok: false, message: "No", data: { agent: "agy" } }, true))).toEqual({
      ok: false,
      message: "No",
      agent: "agy",
    });
  });

  it("render masks the result's secrets", () => {
    expect(render({ ok: false, message: "Rejected XYZ-1", secrets: ["XYZ-1"] }, false)).toBe(
      "Rejected ***\n",
    );
    expect(
      render({ ok: true, message: "m", data: { echo: "XYZ-1" }, secrets: ["XYZ-1"] }, true),
    ).not.toContain("XYZ-1");
  });

  it("render keeps login URLs intact", () => {
    const url = "https://claude.com/oauth/authorize?code=true&state=abc";
    expect(render({ ok: true, message: `Open ${url}` }, false)).toBe(`Open ${url}\n`);
  });

  it("render does not emit the secrets list", () => {
    expect(render({ ok: true, message: "m", secrets: ["s"] }, true)).not.toContain("secrets");
  });
});
