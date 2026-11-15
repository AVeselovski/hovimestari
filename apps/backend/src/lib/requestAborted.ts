import type { Request } from "express";

/**
 * True when nobody is waiting for this response any more: the client closed
 * the connection (a superseded period step the browser aborted, a closed
 * tab), or the response was already sent. Heavy routes check it between
 * their stages and return without a body, so abandoned requests stop using
 * pool connections.
 *
 * `req.destroyed` is not a signal here: Node sets it once a request body has
 * been read, on live requests too.
 */
export function isAborted(req: Request): boolean {
  const res = req.res;
  return req.socket.destroyed || res === undefined || res.destroyed || res.writableEnded;
}

/**
 * Thrown by a read service between its stages when the request it serves
 * has been abandoned. The error middleware recognises it and sends nothing:
 * there is nobody to answer, and the point is to stop spending connections.
 */
export class ReadAbandoned extends Error {
  constructor() {
    super("The request was abandoned by its client.");
    this.name = "ReadAbandoned";
  }
}

/** Throws `ReadAbandoned` when the read's caller is gone. A read with no
 *  `abandoned` check (the MCP server, tests) never throws. */
export function stopIfAbandoned(read: { abandoned?: () => boolean }): void {
  if (read.abandoned?.()) throw new ReadAbandoned();
}
