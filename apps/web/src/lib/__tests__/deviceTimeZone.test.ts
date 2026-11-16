import { updateSettings } from "@/lib/api/settings";
import { queryKeys } from "@/lib/queryKeys";
import { QueryClient } from "@tanstack/react-query";
import { AxiosError, type AxiosResponse } from "axios";
import { TEST_USER } from "../../__tests__/helpers/auth";
import { deviceTimeZone, syncDeviceTimeZone } from "../deviceTimeZone";

jest.mock("@/lib/api/settings", () => ({ updateSettings: jest.fn() }));

const realFormat = Intl.DateTimeFormat;
/** The device's zone, as Intl reports it. */
function deviceIn(zone: string): void {
  jest.spyOn(Intl, "DateTimeFormat").mockImplementation(function deviceFormat(
    ...args: ConstructorParameters<typeof realFormat>
  ) {
    const real = new realFormat(...args);
    return Object.assign(Object.create(real), {
      resolvedOptions: () => ({ ...real.resolvedOptions(), timeZone: zone }),
    });
  } as unknown as typeof Intl.DateTimeFormat);
}

afterEach(() => jest.restoreAllMocks());
beforeEach(() => jest.mocked(updateSettings).mockReset());

describe("syncDeviceTimeZone", () => {
  it("reads the device's zone from Intl", () => {
    deviceIn("America/New_York");
    expect(deviceTimeZone()).toBe("America/New_York");
  });

  it("stores the device's zone once when it differs, and refreshes the account and today", async () => {
    deviceIn("America/New_York");
    const next = { ...TEST_USER, timeZone: "America/New_York" };
    jest.mocked(updateSettings).mockResolvedValue(next);
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");

    await syncDeviceTimeZone(client, { timeZone: "Europe/Helsinki" });
    await syncDeviceTimeZone(client, { timeZone: "Europe/Helsinki" });

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ timeZone: "America/New_York" });
    expect(client.getQueryData(queryKeys.me())).toEqual(next);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.targets() });
  });

  it("sends nothing when the stored zone is the device's", async () => {
    deviceIn("Europe/Helsinki");
    await syncDeviceTimeZone(new QueryClient(), { timeZone: "Europe/Helsinki" });
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("drops a refused zone quietly: no throw, nothing cached, and no second try in this app start", async () => {
    deviceIn("Mars/Olympus");
    jest.mocked(updateSettings).mockRejectedValue(
      new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { message: "Server text.", code: "invalid_time_zone" },
      } as AxiosResponse),
    );
    const client = new QueryClient();
    await expect(syncDeviceTimeZone(client, { timeZone: "Europe/Helsinki" })).resolves.toBeUndefined();
    await syncDeviceTimeZone(client, { timeZone: "Europe/Helsinki" });
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(queryKeys.me())).toBeUndefined();
  });

  it("tries again on the next app start, which is a new query client", async () => {
    deviceIn("America/New_York");
    jest.mocked(updateSettings).mockRejectedValue(new TypeError("offline"));
    await syncDeviceTimeZone(new QueryClient(), { timeZone: "Europe/Helsinki" });
    await syncDeviceTimeZone(new QueryClient(), { timeZone: "Europe/Helsinki" });
    expect(updateSettings).toHaveBeenCalledTimes(2);
  });
});
