import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerRestApi } from "../rest";
import { ensureCatalog } from "../db";
import { getDb } from "../db";
import { CSRF_COOKIE_NAME } from "@shared/const";
import { randomBytes } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { sql } from "drizzle-orm";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  await ensureCatalog();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok", service: "webotp", uptimeSeconds: Math.floor(process.uptime()) }));
  app.get("/ready", async (_req, res) => { const db = await getDb(); if (!db) return res.status(503).json({ status: "not_ready", database: "unavailable" }); try { await db.execute(sql`SELECT 1`); return res.status(200).json({ status: "ready", database: "ok" }); } catch { return res.status(503).json({ status: "not_ready", database: "error" }); } });
  app.use("/api/trpc", (req, res, next) => {
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const csrfToken = cookies[CSRF_COOKIE_NAME] ?? randomBytes(24).toString("base64url");
    if (!cookies[CSRF_COOKIE_NAME]) res.cookie(CSRF_COOKIE_NAME, csrfToken, { httpOnly: false, sameSite: "lax", secure: req.secure, path: "/", maxAge: 1000 * 60 * 60 * 24 });
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers["x-csrf-token"] !== csrfToken) return res.status(403).json({ error: "CSRF token validation failed" });
    next();
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerRestApi(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
