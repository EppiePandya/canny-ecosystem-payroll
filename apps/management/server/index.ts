import "dotenv/config";
import crypto from "node:crypto";
import { helmet } from "@nichtsam/helmet/node-http";
import { createRequestHandler } from "@remix-run/express";
import { ip as ipAddress } from "address";
import closeWithGrace from "close-with-grace";
import compression from "compression";
import express from "express";
import rateLimit from "express-rate-limit";
import getPort, { portNumbers } from "get-port";
import morgan from "morgan";
import http from "node:http";
import type { ServerBuild } from "@remix-run/node";

const MODE = process.env.NODE_ENV ?? "development";
const IS_PROD = MODE === "production";
const IS_DEV = MODE === "development";
const ALLOW_INDEXING = process.env.ALLOW_INDEXING !== "false";

/* -------------------- EXPRESS APP & HTTP SERVER -------------------- */
const app = express();
const server = http.createServer(app);

/* -------------------- VITE SERVER (DEV ONLY) -------------------- */
const viteDevServer = IS_PROD
  ? undefined
  : await import("vite").then((vite) =>
    vite.createServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
        },
      },
    }),
  );

// trust proxy (fly, vercel, etc.)
app.set("trust proxy", true);

// force https in production
app.use((req, res, next) => {
  if (!IS_PROD) return next();
  if (req.method !== "GET") return next();
  const proto = req.get("X-Forwarded-Proto");
  const host = req.get("X-Forwarded-Host") ?? req.get("host");
  if (proto === "http") {
    res.redirect(`https://${host}${req.originalUrl}`);
    return;
  }
  next();
});

// remove trailing slash
app.get("*", (req, res, next) => {
  if (req.path !== "/" && req.path.endsWith("/")) {
    const q = req.url.slice(req.path.length);
    res.redirect(302, req.path.slice(0, -1) + q);
    return;
  }
  next();
});

app.use(compression());
app.disable("x-powered-by");

// security headers
app.use((_, res, next) => {
  helmet(res, { general: { referrerPolicy: false } });
  next();
});

// static assets
if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
  );
  app.use(express.static("build/client", { maxAge: "1h" }));
}

// logging
morgan.token("url", (req) => {
  try {
    return decodeURIComponent(req.url ?? "");
  } catch {
    return req.url ?? "";
  }
});
app.use(
  morgan("tiny", {
    skip: (req, res) =>
      res.statusCode === 200 &&
      (req.url?.startsWith("/resources/note-images") ||
        req.url?.startsWith("/resources/user-images") ||
        req.url?.startsWith("/resources/healthcheck")),
  }),
);

// nonce
app.use((_, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("hex");
  next();
});

// rate limits
const maxMultiple = !IS_PROD ? 10_000 : 1;
const rateLimitBase = {
  windowMs: 60 * 1000,
  limit: 1000 * maxMultiple,
  standardHeaders: true,
  legacyHeaders: false,
};

const strongest = rateLimit({ ...rateLimitBase, limit: 10 * maxMultiple });
const strong = rateLimit({ ...rateLimitBase, limit: 100 * maxMultiple });
const general = rateLimit(rateLimitBase);

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.path.includes("/login")) return strongest(req, res, next);
    return strong(req, res, next);
  }
  if (req.path.includes("/verify")) return strongest(req, res, next);
  return general(req, res, next);
});

/* -------------------- BUILD LOADING (FIXED) -------------------- */
let serverBuild: ServerBuild | null = null;

async function loadBuild() {
  if (viteDevServer) {
    // dev mode: always fresh build from vite
    return await viteDevServer.ssrLoadModule("virtual:remix/server-build");
  }
  // prod: load once
  if (!serverBuild) {
    serverBuild = (await import("../build/server/index.js")) as any;
  }
  return serverBuild;
}

/* -------------------- ROBOTS -------------------- */
if (!ALLOW_INDEXING) {
  app.use((_, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    next();
  });
}

/* -------------------- WELL-KNOWN (DEVTOOLS / AUTO-DISCOVERY) -------------------- */
app.all("/.well-known/*", (_, res) => {
  res.status(404).json({ error: "Not found" });
});

/* -------------------- REMIX HANDLER (FIXED) -------------------- */
app.all("*", async (req, res, next) => {
  try {
    const build = await loadBuild();
    return createRequestHandler({
      build,
      mode: MODE,
      getLoadContext: () => ({
        cspNonce: res.locals.cspNonce,
      }),
    })(req, res, next);
  } catch (err) {
    next(err);
  }
});

/* -------------------- START SERVER -------------------- */
const desiredPort = Number(process.env.PORT || 3000);
const portToUse = await getPort({
  port: portNumbers(desiredPort, desiredPort + 100),
});
const portAvailable = desiredPort === portToUse;

server.listen(portToUse, () => {
  if (!portAvailable && !IS_DEV) {
    console.log(`⚠️ Port ${desiredPort} is not available.`);
    process.exit(1);
  }

  console.log("🚀  We have liftoff!");
  const localUrl = `http://localhost:${portToUse}`;
  const localIp = ipAddress();
  let lanUrl = null;

  if (
    /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(localIp ?? "")
  ) {
    lanUrl = `http://${localIp}:${portToUse}`;
  }

  console.log(
    `
Local:            ${localUrl}
${lanUrl ? `On Your Network:  ${lanUrl}` : ""}
Press Ctrl+C to stop
`.trim(),
  );
});

/* -------------------- GRACEFUL SHUTDOWN -------------------- */
closeWithGrace(async ({ err }) => {
  await new Promise((resolve, reject) => {
    server.close((e) => (e ? reject(e) : resolve("ok")));
  });
  if (err) console.error(err);
});
