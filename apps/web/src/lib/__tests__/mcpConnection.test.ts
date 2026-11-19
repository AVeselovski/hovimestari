import { testConnectionKey } from "@/__tests__/helpers/connectionsServer";
import {
  claudeCodeCommand,
  claudeDesktopConfig,
  KEY_PLACEHOLDER,
  MCP_REMOTE_VERSION,
  MCP_SERVER_NAME,
  mcpServerUrl,
} from "../mcpConnection";

const KEY = testConnectionKey();

describe("mcpServerUrl", () => {
  it("drops the API's /api/v1 path: the endpoint sits at the origin", () => {
    expect(mcpServerUrl("https://api.example.com/api/v1")).toBe("https://api.example.com/mcp");
  });

  it("keeps a local port", () => {
    expect(mcpServerUrl("http://localhost:3001/api/v1")).toBe("http://localhost:3001/mcp");
  });

  it("falls back to the local backend when no base is configured", () => {
    expect(mcpServerUrl(undefined)).toBe("http://localhost:3001/mcp");
    expect(mcpServerUrl("")).toBe("http://localhost:3001/mcp");
  });

  it("shows the path alone for a base that is not a whole address, rather than throw", () => {
    expect(mcpServerUrl("/api/v1")).toBe("/mcp");
  });
});

describe("the server name", () => {
  it("is the fixed hovimestari: one person, one data set", () => {
    expect(MCP_SERVER_NAME).toBe("hovimestari");
  });
});

describe("claudeCodeCommand", () => {
  it("is the exact claude mcp add line, with the header quoted", () => {
    expect(claudeCodeCommand("http://localhost:3001/mcp", KEY)).toBe(
      `claude mcp add --transport http hovimestari http://localhost:3001/mcp --header "Authorization: Bearer ${KEY}"`,
    );
  });

  it("carries the placeholder where there is no key to show", () => {
    expect(claudeCodeCommand("http://localhost:3001/mcp", KEY_PLACEHOLDER)).toBe(
      'claude mcp add --transport http hovimestari http://localhost:3001/mcp --header "Authorization: Bearer YOUR_KEY"',
    );
  });
});

describe("claudeDesktopConfig", () => {
  const out = claudeDesktopConfig("https://api.example.com/mcp", KEY);

  it("is valid JSON with one server under mcpServers", () => {
    const parsed = JSON.parse(out) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(parsed)).toEqual(["mcpServers"]);
    expect(Object.keys(parsed.mcpServers)).toEqual(["hovimestari"]);
  });

  it("runs the pinned mcp-remote bridge with the literal ${AUTH_HEADER} and the key in env", () => {
    expect(MCP_REMOTE_VERSION).toBe("0.14.3");
    expect(JSON.parse(out)).toEqual({
      mcpServers: {
        hovimestari: {
          command: "npx",
          args: ["-y", "mcp-remote@0.14.3", "https://api.example.com/mcp", "--header", "Authorization:${AUTH_HEADER}"],
          env: { AUTH_HEADER: `Bearer ${KEY}` },
        },
      },
    });
  });

  it("is indented two spaces, as it will be pasted into the config file", () => {
    expect(out.split("\n")[1]).toBe('  "mcpServers": {');
  });
});
