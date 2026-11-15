/** The address relayed calls name in tests. TEST-NET-3, never a real client. */
export const RELAYED_CLIENT_IP = "203.0.113.7";

/** The headers the web server's route handlers send on a relayed call. */
export function relayHeaders(clientIp: string = RELAYED_CLIENT_IP): Record<string, string> {
  return { "X-Bff-Secret": process.env.BFF_SECRET!, "X-Client-Ip": clientIp };
}
