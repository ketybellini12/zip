import { logger } from './logger';

// Performance monitoring utilities
export class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();
  private counters: Map<string, number> = new Map();
  
  recordTiming(name: string, duration: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(duration);
    
    // Keep only last 1000 samples
    const timings = this.metrics.get(name)!;
    if (timings.length > 1000) {
      timings.shift();
    }
  }
  
  incrementCounter(name: string, value: number = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }
  
  getMetrics(name: string) {
    const timings = this.metrics.get(name);
    if (!timings || timings.length === 0) return null;
    
    const sorted = [...timings].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      total: sum,
    };
  }
  
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }
  
  reset(name: string) {
    this.metrics.delete(name);
    this.counters.delete(name);
  }
  
  resetAll() {
    this.metrics.clear();
    this.counters.clear();
  }
  
  snapshot(): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    
    for (const [name] of this.metrics) {
      snapshot[name] = this.getMetrics(name);
    }
    
    for (const [name, value] of this.counters) {
      snapshot[`counter:${name}`] = value;
    }
    
    return snapshot;
  }
}

export const metrics = new MetricsCollector();

// Timing decorator
export function timed(name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const metricName = name || `${target.constructor?.name || ''}.${propertyKey}`;
    
    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - start;
        metrics.recordTiming(metricName, duration);
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        metrics.recordTiming(`${metricName}.error`, duration);
        metrics.incrementCounter(`${metricName}.errors`);
        throw error;
      }
    };
    
    return descriptor;
  };
}

// System resource monitoring
export function getSystemMetrics() {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  
  return {
    memory: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      rss: Math.round(memory.rss / 1024 / 1024),
      external: Math.round(memory.external / 1024 / 1024),
    },
    cpu: {
      user: cpu.user,
      system: cpu.system,
    },
    uptime: Math.floor(process.uptime()),
    pid: process.pid,
    node: process.version,
    platform: process.platform,
  };
}

// Alert manager
export class AlertManager {
  private alerts: Map<string, { threshold: number; callback: () => void; lastTriggered: number }> = new Map();
  
  registerAlert(
    name: string,
    threshold: number,
    callback: () => void
  ) {
    this.alerts.set(name, {
      threshold,
      callback,
      lastTriggered: 0,
    });
  }
  
  checkMetric(name: string, value: number): boolean {
    const alert = this.alerts.get(name);
    if (!alert) return false;
    
    if (value > alert.threshold) {
      const now = Date.now();
      // Prevent alert spam - min 5 minutes between alerts
      if (now - alert.lastTriggered > 300000) {
        alert.lastTriggered = now;
        logger.warn('Alert triggered', { 
          metric: name, 
          value, 
          threshold: alert.threshold 
        });
        
        // Execute alert callback asynchronously
        setImmediate(() => {
          try {
            alert.callback();
          } catch (error) {
            logger.error('Alert callback failed', error as Error);
          }
        });
        
        return true;
      }
    }
    
    return false;
  }
}

export const alerts = new AlertManager();

// Set up default alerts
alerts.registerAlert('memory.heapUsed', 500, () => {
  logger.warn('High memory usage detected', getSystemMetrics());
});

alerts.registerAlert('database.queryTime', 5000, () => {
  logger.warn('Slow database queries detected');
});

// Export single instance
export default {
  metrics,
  timed,
  getSystemMetrics,
  alerts,
};