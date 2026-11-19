import { testConnection } from "@/__tests__/helpers/connectionsServer";
import type { ConnectionList } from "@hovimestari/types";
import { QueryClient } from "@tanstack/react-query";
import { dropConnection, putNewConnection } from "../connectionCache";
import { queryKeys } from "../queryKeys";

describe("connectionCache", () => {
  const older = testConnection({ name: "Older" });
  const added = testConnection({ name: "New" });
  const list = (client: QueryClient): string[] | undefined =>
    client.getQueryData<ConnectionList>(queryKeys.connections())?.connections.map((c) => c.name);

  function clientWith(): QueryClient {
    const client = new QueryClient();
    client.setQueryData<ConnectionList>(queryKeys.connections(), {
      connections: [older],
      availability: { connect: true, write: false },
    });
    return client;
  }

  it("puts a new connection at the head of the list, once however often it is put", () => {
    const client = clientWith();
    putNewConnection(client, added);
    putNewConnection(client, added);
    expect(list(client)).toEqual(["New", "Older"]);
  });

  it("takes a connection off the list", () => {
    const client = clientWith();
    dropConnection(client, older.id);
    expect(list(client)).toEqual([]);
  });

  it("leaves a list that was never read alone", () => {
    const client = new QueryClient();
    putNewConnection(client, added);
    dropConnection(client, added.id);
    expect(list(client)).toBeUndefined();
  });
});
