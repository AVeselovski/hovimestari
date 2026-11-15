import { describe, expect, it, jest } from "@jest/globals";
import { consoleMailer, sendPasswordResetEmail } from "../email.js";

describe("the reset mail", () => {
  it("goes to the console when no mail service is configured, with the link in it", async () => {
    const log = jest.fn<(line: string) => void>();
    const link = "http://localhost:3000/auth/reset-password?token=abc123";

    await sendPasswordResetEmail("anna@example.com", link, consoleMailer(log));

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("to anna@example.com: Reset your Hovimestari password");
    expect(log.mock.calls[0][0]).toContain(link);
  });

  it("escapes the link in the HTML part", async () => {
    const send = jest.fn<(mail: { html: string; text: string }) => Promise<void>>(async () => undefined);
    await sendPasswordResetEmail("anna@example.com", 'http://x/"><b>', { send });
    expect(send.mock.calls[0][0].html).toContain("http://x/&quot;&gt;&lt;b&gt;");
  });
});
