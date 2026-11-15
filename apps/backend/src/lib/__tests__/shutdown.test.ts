import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { EventEmitter } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { installGracefulShutdown } from "../shutdown.js";

function fakeProcess() {
  const proc = new EventEmitter() as unknown as NodeJS.Process;
  proc.exit = jest.fn() as unknown as NodeJS.Process["exit"];
  return proc;
}

const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
  jest.restoreAllMocks();
});

async function listening(handler: http.RequestListener): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe("installGracefulShutdown", () => {
  it("on SIGTERM lets a request in flight finish, then ends the pool and exits 0", async () => {
    let finish: () => void = () => {};
    const { server, url } = await listening((_req, res) => {
      finish = () => res.end("done");
    });
    const proc = fakeProcess();
    const endPool = jest.fn(async () => undefined);
    const stop = installGracefulShutdown(server, endPool, { proc });

    const inFlight = fetch(url).then((r) => r.text());
    await new Promise((resolve) => setTimeout(resolve, 50));
    proc.emit("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(endPool).not.toHaveBeenCalled();

    finish();
    expect(await inFlight).toBe("done");
    await stop();
    expect(endPool).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it("exits 1 when requests outlast the timeout", async () => {
    const { server, url } = await listening(() => {
      // Never answers.
    });
    const proc = fakeProcess();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    installGracefulShutdown(server, async () => undefined, { proc, timeoutMs: 50 });

    void fetch(url).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 30));
    proc.emit("SIGINT");
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(proc.exit).toHaveBeenCalledWith(1);
    server.closeAllConnections();
  });
});
