declare namespace Express {
  interface User {
    id: string;
    /** The family of the session the access token was issued to. A token signed before tokens named it has none. */
    sessionFamily?: string;
  }
  interface Request {
    /** Set by requireBff on a call the web server relayed: the browser's address, when it named one. */
    relay?: { clientIp?: string };
  }
}
