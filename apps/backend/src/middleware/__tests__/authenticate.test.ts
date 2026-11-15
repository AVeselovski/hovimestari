import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../../lib/env.js";
import { signAccessToken } from "../../lib/jwt.js";
import { authenticate } from "../authenticate.js";

const TEST_USER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

// Minimal app to exercise the middleware in isolation
const testApp = express();
testApp.use(express.json());
testApp.get("/protected", authenticate, (req, res) => {
  res.json({ userId: req.user!.id });
});

describe("authenticate middleware", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(testApp).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Sign in to do this.", code: "unauthorized" });
  });

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const res = await request(testApp).get("/protected").set("Authorization", "Basic not-a-bearer");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is not a valid JWT", async () => {
    const res = await request(testApp).get("/protected").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is expired", async () => {
    const expired = jwt.sign({ sub: TEST_USER_ID, exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_ACCESS_SECRET);
    const res = await request(testApp).get("/protected").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthorized");
  });

  it("calls next and attaches req.user.id on a valid access token", async () => {
    const token = signAccessToken({ sub: TEST_USER_ID });
    const res = await request(testApp).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(TEST_USER_ID);
  });
});
