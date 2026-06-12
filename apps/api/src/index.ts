import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { audioRouter } from "./routes/audio.js";
import { authRouter } from "./routes/auth.js";
import { logger } from "./logging/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { AudioQueue } from "./queue/audioQueue.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/audio", audioRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "API server started");
});

// Start queue workers
AudioQueue.startWorker();

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...");
  await AudioQueue.close();
  server.close(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
