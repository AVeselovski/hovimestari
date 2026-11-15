declare namespace Express {
  interface User {
    id: string;
  }
  interface Request {
    /** Set by requireBff on a call the web server relayed: the browser's address, when it named one. */
    relay?: { clientIp?: string };
  }
}
