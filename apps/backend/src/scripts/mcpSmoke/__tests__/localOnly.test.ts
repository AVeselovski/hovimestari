import { describe, expect, it } from "@jest/globals";
import { refuseNonLocal } from "../localOnly.js";

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

  it("takes any local database name with the explicit opt-in, and still refuses a remote host", () => {
    expect(refuseNonLocal("postgresql://postgres@localhost:5432/hovimestari", true)).toBeNull();
    expect(refuseNonLocal("postgresql://postgres@db.example.com/hovimestari", true)).toEqual(expect.any(String));
    expect(refuseNonLocal("postgresql://postgres@localhost/x?host=db.example.com", true)).toEqual(expect.any(String));
  });
});
