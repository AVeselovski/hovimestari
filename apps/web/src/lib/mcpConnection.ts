// ---------------------------------------------------------------------------
// What an assistant needs to reach Hovimestari over the Model Context
// Protocol: the server's address, its name in the assistant's config, and the
// two setup snippets the Connected AI section shows. Lifted from finanssi,
// without its per-vault server name: one person has one data set here.
//
// Pure functions, no React. The snippets are code, not copy, so they stay out
// of the message catalog.
// ---------------------------------------------------------------------------

/**
 * The `mcp-remote` bridge Claude Desktop runs through `npx`. Pinned, because
 * the bridge sees the key and an unpinned `npx` runs whatever is newest.
 * Bump it deliberately, after trying the new version on a real Claude Desktop.
 */
export const MCP_REMOTE_VERSION = "0.14.3";

/** The server's name in the assistant's config. */
export const MCP_SERVER_NAME = "hovimestari";

/** Stands in for the key where there is none to show (the section's "How to connect"). */
export const KEY_PLACEHOLDER = "YOUR_KEY";

/** The backend address when none is configured, as in local development. */
const LOCAL_API_BASE = "http://localhost:3001";

/** The endpoint's path, on the API's origin. */
const MCP_PATH = "/mcp";

/**
 * The MCP endpoint. It sits at the API's origin, outside `/api/v1`, so any
 * path on the configured base is dropped: `https://api.example.com/api/v1`
 * gives `https://api.example.com/mcp`. A base that is not a whole address,
 * such as a relative `/api/v1`, has no origin to read: the steps then show
 * the path alone rather than take Settings down.
 */
export function mcpServerUrl(apiBase: string | undefined = process.env.NEXT_PUBLIC_API_URL): string {
  try {
    return new URL(MCP_PATH, apiBase || LOCAL_API_BASE).toString();
  } catch {
    return MCP_PATH;
  }
}

/** The one-line Claude Code setup: an HTTP server with the key as a bearer header. */
export function claudeCodeCommand(url: string, key: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} --header "Authorization: Bearer ${key}"`;
}

/**
 * The Claude Desktop entry, as a whole `claude_desktop_config.json` object.
 * Claude Desktop reaches a remote server through the `mcp-remote` bridge. The
 * header is passed as `Authorization:${AUTH_HEADER}`, with no space, and the
 * value comes from `env`: that form survives Windows argument escaping.
 * `${AUTH_HEADER}` is literal text for `mcp-remote` to expand, not a
 * placeholder filled in here.
 */
export function claudeDesktopConfig(url: string, key: string): string {
  const config = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: "npx",
        args: ["-y", `mcp-remote@${MCP_REMOTE_VERSION}`, url, "--header", "Authorization:${AUTH_HEADER}"],
        env: { AUTH_HEADER: `Bearer ${key}` },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}
