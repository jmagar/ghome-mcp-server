import { pino } from 'pino';

interface MetricValue {
  value: number;
  timestamp: number;
}

export class MetricsCollector {
  private metrics: Map<string, MetricValue> = new Map();

  increment(metric: string, value = 1): void {
    const current = this.metrics.get(metric)?.value || 0;
    this.metrics.set(metric, {
      value: current + value,
      timestamp: Date.now()
    });
  }

  gauge(metric: string, value: number): void {
    this.metrics.set(metric, {
      value,
      timestamp: Date.now()
    });
  }

  getMetrics(): Record<string, MetricValue> {
    return Object.fromEntries(this.metrics);
  }
}

export class PerformanceMonitor {
  constructor(
    private metrics: MetricsCollector,
    private logger: pino.Logger
  ) {}

  async measureOperation<T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const start = process.hrtime.bigint();

    try {
      const result = await operation();
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000; // Convert to milliseconds

      this.metrics.gauge(`${name}_duration_ms`, duration);
      this.metrics.increment(`${name}_total`);

      return result;
    } catch (error) {
      this.metrics.increment(`${name}_errors`);
      throw error;
    }
  }

  recordMemoryUsage(): void {
    const usage = process.memoryUsage();
    this.metrics.gauge('memory_heap_used', usage.heapUsed);
    this.metrics.gauge('memory_heap_total', usage.heapTotal);
    this.metrics.gauge('memory_rss', usage.rss);
  }
}

export class HealthCheck {
  private checks: Map<string, () => Promise<boolean>> = new Map();

  registerCheck(name: string, check: () => Promise<boolean>): void {
    this.checks.set(name, check);
  }

  async performChecks(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, check] of this.checks) {
      try {
        results[name] = await check();
      } catch {
        results[name] = false;
      }
    }

    return results;
  }
}

// Configure base logger
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  },
  serializers: {
    error: pino.stdSerializers.err,
    err: pino.stdSerializers.err
  }
});

// Create global instances
export const metrics = new MetricsCollector();
export const health = new HealthCheck();

// Register default health checks
health.registerCheck('memory', async () => {
  const usage = process.memoryUsage();
  return usage.heapUsed < usage.heapTotal * 0.9;
});

// Create logger factory with monitoring
export const createLogger = (namespace: string) => {
  const logger = baseLogger.child({ namespace });
  const monitor = new PerformanceMonitor(metrics, logger);

  // Start periodic memory usage monitoring
  setInterval(() => {
    monitor.recordMemoryUsage();
  }, 60000); // Every minute

  return {
    logger,
    monitor,
    debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
    info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
    warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
    error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
    fatal: (msg: string, ...args: any[]) => logger.fatal(msg, ...args),
    trace: (msg: string, ...args: any[]) => logger.trace(msg, ...args),
    child: (bindings: Record<string, any>) => logger.child(bindings),
    measureOperation: <T>(name: string, operation: () => Promise<T>) => 
      monitor.measureOperation(name, operation)
  };
};

// Default logger
export const defaultLogger = createLogger('ghome-server');

// Export types
export type Logger = ReturnType<typeof createLogger>;
