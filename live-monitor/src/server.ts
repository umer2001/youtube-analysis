import http from "http";
import { StreamSupervisor } from "./supervisor.js";

/**
 * Creates and starts a lightweight HTTP server for Dokku health checks and monitoring.
 */
export function startHttpServer(port: number, supervisor: StreamSupervisor): http.Server {
  const server = http.createServer((req, res) => {
    const url = req.url || "/";

    if (url === "/health" || url === "/ready") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }));
      return;
    }

    if (url === "/status" || url === "/metrics" || url === "/") {
      const status = supervisor.getStatus();
      const memoryUsage = process.memoryUsage();

      const responseData = {
        app: "youtube-live-monitor",
        timestamp: new Date().toISOString(),
        ...status,
        memory: {
          rssMb: Number((memoryUsage.rss / (1024 * 1024)).toFixed(2)),
          heapUsedMb: Number((memoryUsage.heapUsed / (1024 * 1024)).toFixed(2)),
        },
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responseData, null, 2));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(port, () => {
    console.log(`\x1b[32m[HTTP Server] Listening on port ${port} (Healthcheck: http://localhost:${port}/health)\x1b[0m`);
  });

  return server;
}
