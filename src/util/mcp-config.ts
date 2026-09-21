/** Placeholder shown when no key is being revealed. */
export const KEY_PLACEHOLDER = "fwk_...";
/** Where the user cloned `screenwriter_api_mcp`; they edit this. */
export const MCP_ENTRY = "/path/to/screenwriter_api_mcp/src/index.ts";

/** Claude Desktop / Claude Code JSON config. Env names are the ones the MCP package reads. */
export function mcpJsonConfig(apiUrl: string, key: string | null): string {
  return JSON.stringify(
    {
      mcpServers: {
        fadewright: {
          command: "bun",
          args: ["run", MCP_ENTRY],
          env: { FADEWRIGHT_API_URL: apiUrl, FADEWRIGHT_API_KEY: key ?? KEY_PLACEHOLDER },
        },
      },
    },
    null,
    2
  );
}

/** One-line `claude mcp add` variant. */
export function mcpAddCommand(apiUrl: string, key: string | null): string {
  return `claude mcp add fadewright -e FADEWRIGHT_API_KEY=${key ?? KEY_PLACEHOLDER} -e FADEWRIGHT_API_URL=${apiUrl} -- bun run ${MCP_ENTRY}`;
}
