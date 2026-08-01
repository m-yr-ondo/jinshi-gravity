import { defineRoom, defineServer } from "colyseus";
import express, { type Request, type Response } from "express";
import { GravityRoom } from "./rooms/GravityRoom.js";

export default defineServer({
  rooms: {
    gravity: defineRoom(GravityRoom).filterBy(["code", "mode"]),
  },
  express: (app) => {
    app.disable("x-powered-by");
    app.use((request, response, next) => {
      response.setHeader("Cache-Control", "no-store");
      next();
    });
    app.use(express.json({ limit: "8kb" }));

    app.get("/health", (_request: Request, response: Response) => {
      response.json({ status: "ok", name: "jinshi-gravity" });
    });
  },
});