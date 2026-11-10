import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncomingMessage, Server, ServerResponse, createServer } from 'http';
import { MetricsService } from './metrics.service';

/** Serves /metrics on its own port so nginx, which proxies the API port, never exposes it. */
@Injectable()
export class MetricsServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MetricsServer.name);
  private server?: Server;

  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const port = this.config.get<string>('METRICS_PORT');
    if (!port) return;

    this.server = createServer((req, res) => void this.handle(req, res));
    // A taken port must not take the API down; Prometheus then reports the target down.
    this.server.on('error', error =>
      this.logger.error(`Metrics server failed on port ${port}: ${error.message}`),
    );
    this.server.listen(Number(port), '0.0.0.0', () =>
      this.logger.log(`Metrics available on port ${port} at /metrics`),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server?.listening) return;
    // Prometheus keeps connections alive; close them or shutdown waits for the keep-alive timeout.
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await this.metrics.registry.metrics();
      res.writeHead(200, { 'Content-Type': this.metrics.registry.contentType }).end(body);
    } catch (error) {
      this.logger.error(`Failed to render metrics: ${(error as Error).message}`);
      res.writeHead(500).end();
    }
  }
}
