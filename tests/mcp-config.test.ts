import { describe, expect, it } from "vitest";
import { KEY_PLACEHOLDER, mcpAddCommand, mcpJsonConfig } from "../src/util/mcp-config";

describe("mcp config", () => {
  it("uses the env names the MCP package reads and swaps the placeholder for a revealed key", () => {
    const placeholder = JSON.parse(mcpJsonConfig("http://x:1", null));
    expect(placeholder.mcpServers.fadewright.env).toEqual({ FADEWRIGHT_API_URL: "http://x:1", FADEWRIGHT_API_KEY: KEY_PLACEHOLDER });
    expect(mcpJsonConfig("http://x:1", "fwk_abc_def")).toContain("fwk_abc_def");
    expect(mcpAddCommand("http://x:1", "fwk_abc_def")).toMatch(/^claude mcp add fadewright -e FADEWRIGHT_API_KEY=fwk_abc_def -e FADEWRIGHT_API_URL=http:\/\/x:1 -- bun run /);
  });
});
