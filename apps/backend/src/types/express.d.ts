declare namespace Express {
  interface User {
    id: string;
  }
  interface Request {
    vaultMember?: { vaultId: string; userId: string; role: "owner" | "member" };
  }
}
