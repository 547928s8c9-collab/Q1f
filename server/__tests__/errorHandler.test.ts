import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler } from "../middleware/errorHandler";

describe("errorHandler middleware", () => {
  it("returns 500 with JSON message for thrown errors", async () => {
    const app = express();
    app.get("/boom", (_req, _res, next) => {
      next(new Error("boom"));
    });
    app.use(errorHandler);

    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "boom" });
  });

  it("returns custom status if error has status property", async () => {
    const app = express();
    app.get("/not-found", (_req, _res, next) => {
      const err = new Error("Not found") as any;
      err.status = 404;
      next(err);
    });
    app.use(errorHandler);

    const res = await request(app).get("/not-found");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Not found" });
  });

  it("returns default message if error has no message", async () => {
    const app = express();
    app.get("/empty", (_req, _res, next) => {
      const err = {} as any;
      next(err);
    });
    app.use(errorHandler);

    const res = await request(app).get("/empty");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Internal Server Error" });
  });
});
