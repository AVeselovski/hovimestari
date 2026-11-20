import { describe, expect, it } from "@jest/globals";
import { refuseNonLocal, smokeTarget } from "../localOnly.js";

describe("refuseNonLocal", () => {
  it.each([
    "postgresql://postgres@localhost:5432/hovimestari_smoke",
    "postgresql://postgres@localhost/hovimestari_smoke",
    "postgres://postgres@127.0.0.1:5432/hovimestari_smoke",
    "postgresql://postgres@[::1]:5432/val4b_smoke",
  ])("accepts the local smoke database %s", (url) => {
    expect(refuseNonLocal(url)).toBeNull();
  });

  it.each([
    // The crafted URLs from the reviews: a local-looking string elsewhere in the URL,
    // and a host parameter that pg reads over the URL's own host.
    "postgresql://u@prod.example.com:5432/db_smoke?x=@localhost:1",
    "postgresql://postgres@localhost/x_smoke?host=db.example.com",
    "postgresql://postgres@localhost/x_smoke?hostaddr=10.0.0.1",
    "postgresql://postgres@db.example.com:5432/hovimestari_smoke",
    "postgresql://postgres@localhost.example.com:5432/hovimestari_smoke",
    "postgresql://postgres@127.0.0.1.example.com/hovimestari_smoke",
    // A socket path or an empty host cannot be proved local.
    "postgresql://postgres@%2Fvar%2Frun%2Fpostgresql/hovimestari_smoke",
    "postgresql:///hovimestari_smoke",
    "socket:/var/run/postgresql?db=hovimestari_smoke",
    "/var/run/postgresql hovimestari_smoke",
    "mysql://root@localhost/hovimestari_smoke",
    "not a url",
    "",
    undefined,
  ])("refuses %s", (url) => {
    expect(refuseNonLocal(url)).toEqual(expect.any(String));
  });

  it("refuses a local database whose name does not end in _smoke, as a tunnel to production looks", () => {
    expect(refuseNonLocal("postgresql://postgres@localhost:5432/hovimestari")).toMatch(/_smoke/);
    expect(refuseNonLocal("postgresql://postgres@localhost:5432/hovimestari_smoke_old")).toMatch(/_smoke/);
  });

  it("refuses a database name with a percent escape, which pg may read as another name", () => {
    expect(refuseNonLocal("postgresql://postgres@localhost/hovimestari%2F_smoke")).toMatch(/unescaped/);
    expect(refuseNonLocal("postgresql://postgres@localhost/hovimestari%5Fsmoke")).toMatch(/unescaped/);
  });

  describe("the opt-out of the name rule, for one run", () => {
    const local = "postgresql://postgres@localhost:5432/hovimestari";

    it("takes any local database name when the second variable repeats it exactly", () => {
      expect(refuseNonLocal(local, { anyDatabase: true, confirmDatabase: "hovimestari" })).toBeNull();
      expect(smokeTarget(local, { anyDatabase: true, confirmDatabase: "hovimestari" })).toEqual({
        target: { host: "localhost", database: "hovimestari" },
      });
    });

    it.each([undefined, "", "Hovimestari", "hovimestari ", "hovimestari_smoke", "other"])(
      "refuses the flag with the name repeated as %p, and names the database to repeat",
      (confirmDatabase) => {
        expect(refuseNonLocal(local, { anyDatabase: true, confirmDatabase })).toMatch(
          /MCP_SMOKE_CONFIRM_DATABASE .*exactly: hovimestari$/,
        );
      },
    );

    it("asks for the name with the flag set even on a _smoke database", () => {
      const smoke = "postgresql://postgres@localhost:5432/hovimestari_smoke";
      expect(refuseNonLocal(smoke, { anyDatabase: true })).toMatch(/exactly: hovimestari_smoke$/);
      expect(refuseNonLocal(smoke, { anyDatabase: true, confirmDatabase: "hovimestari_smoke" })).toBeNull();
    });

    it("lifts the name rule only: a remote host or a query parameter is still refused", () => {
      for (const url of [
        "postgresql://postgres@db.example.com/hovimestari",
        "postgresql://postgres@localhost/hovimestari?host=db.example.com",
      ])
        expect(refuseNonLocal(url, { anyDatabase: true, confirmDatabase: "hovimestari" })).toEqual(expect.any(String));
    });
  });
});
