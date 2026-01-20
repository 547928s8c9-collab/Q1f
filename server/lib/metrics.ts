/**
 * Metrics collection and export
 * 
 * Provides structured metrics for monitoring and alerting.
 * In production, consider integrating with Prometheus, Datadog, or similar.
 */

import { logger } from "./logger";

export interface Metrics {
  // Request metrics
  requestCount: number;
  requestsByStatus: Record<string, number>;
  requestsByEndpoint: Record<string, number>;
  
  // Performance metrics
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  
  // Error metrics
  errorCount: number;
  errorRate: number;
  
  // Business metrics
  depositCount: number;
  withdrawalCount: number;
  investmentCount: number;
  vaultTransferCount: number;
}

class MetricsCollector {
  private requestCount = 0;
  private requestsByStatus: Record<string, number> = {};
  private requestsByEndpoint: Record<string, number> = {};
  private responseTimes: number[] = [];
  private businessMetrics = {
    depositCount: 0,
    withdrawalCount: 0,
    investmentCount: 0,
    vaultTransferCount: 0,
  };

  private readonly MAX_RESPONSE_TIMES = 1000; // Keep last 1000 response times for percentiles

  recordRequest(endpoint: string, status: number, duration: number): void {
    this.requestCount++;
    
    const statusKey = `${status}`;
    this.requestsByStatus[statusKey] = (this.requestsByStatus[statusKey] || 0) + 1;
    
    this.requestsByEndpoint[endpoint] = (this.requestsByEndpoint[endpoint] || 0) + 1;
    
    // Track response times
    this.responseTimes.push(duration);
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes.shift();
    }

    // Track business metrics based on endpoint
    if (endpoint.includes("/deposit")) {
      this.businessMetrics.depositCount++;
    } else if (endpoint.includes("/withdraw")) {
      this.businessMetrics.withdrawalCount++;
    } else if (endpoint.includes("/invest")) {
      this.businessMetrics.investmentCount++;
    } else if (endpoint.includes("/vault/transfer")) {
      this.businessMetrics.vaultTransferCount++;
    }
  }

  getMetrics(): Metrics {
    // Count all 4xx and 5xx status codes
    let errorCount = 0;
    for (const [status, count] of Object.entries(this.requestsByStatus)) {
      const statusNum = parseInt(status, 10);
      if (statusNum >= 400 && statusNum < 600) {
        errorCount += count;
      }
    }
    const errorRate = this.requestCount > 0 ? errorCount / this.requestCount : 0;

    // Calculate percentiles
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    
    const averageResponseTime = sortedTimes.length > 0
      ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length
      : 0;
    const p95ResponseTime = sortedTimes[p95Index] || 0;
    const p99ResponseTime = sortedTimes[p99Index] || 0;

    return {
      requestCount: this.requestCount,
      requestsByStatus: { ...this.requestsByStatus },
      requestsByEndpoint: { ...this.requestsByEndpoint },
      averageResponseTime: Math.round(averageResponseTime),
      p95ResponseTime: Math.round(p95ResponseTime),
      p99ResponseTime: Math.round(p99ResponseTime),
      errorCount,
      errorRate: Math.round(errorRate * 10000) / 100, // Percentage with 2 decimals
      ...this.businessMetrics,
    };
  }

  reset(): void {
    this.requestCount = 0;
    this.requestsByStatus = {};
    this.requestsByEndpoint = {};
    this.responseTimes = [];
    this.businessMetrics = {
      depositCount: 0,
      withdrawalCount: 0,
      investmentCount: 0,
      vaultTransferCount: 0,
    };
  }
}

export const metricsCollector = new MetricsCollector();

/**
 * Export metrics in Prometheus format
 */
export function exportPrometheusMetrics(): string {
  const metrics = metricsCollector.getMetrics();
  const lines: string[] = [];

  // Request count
  lines.push(`# HELP http_requests_total Total number of HTTP requests`);
  lines.push(`# TYPE http_requests_total counter`);
  lines.push(`http_requests_total ${metrics.requestCount}`);

  // Requests by status
  for (const [status, count] of Object.entries(metrics.requestsByStatus)) {
    lines.push(`http_requests_total{status="${status}"} ${count}`);
  }

  // Response time
  lines.push(`# HELP http_request_duration_ms HTTP request duration in milliseconds`);
  lines.push(`# TYPE http_request_duration_ms histogram`);
  lines.push(`http_request_duration_ms{quantile="0.5"} ${metrics.averageResponseTime}`);
  lines.push(`http_request_duration_ms{quantile="0.95"} ${metrics.p95ResponseTime}`);
  lines.push(`http_request_duration_ms{quantile="0.99"} ${metrics.p99ResponseTime}`);

  // Error rate
  lines.push(`# HELP http_errors_total Total number of HTTP errors`);
  lines.push(`# TYPE http_errors_total counter`);
  lines.push(`http_errors_total ${metrics.errorCount}`);

  // Business metrics
  lines.push(`# HELP business_operations_total Total number of business operations`);
  lines.push(`# TYPE business_operations_total counter`);
  lines.push(`business_operations_total{type="deposit"} ${metrics.depositCount}`);
  lines.push(`business_operations_total{type="withdrawal"} ${metrics.withdrawalCount}`);
  lines.push(`business_operations_total{type="investment"} ${metrics.investmentCount}`);
  lines.push(`business_operations_total{type="vault_transfer"} ${metrics.vaultTransferCount}`);

  return lines.join("\n");
}

/**
 * Check if metrics indicate health issues
 */
export function checkHealthAlerts(): string[] {
  const metrics = metricsCollector.getMetrics();
  const alerts: string[] = [];

  // High error rate
  if (metrics.errorRate > 5) {
    alerts.push(`High error rate: ${metrics.errorRate}%`);
  }

  // Slow response times
  if (metrics.p95ResponseTime > 1000) {
    alerts.push(`Slow p95 response time: ${metrics.p95ResponseTime}ms`);
  }

  // Very slow p99
  if (metrics.p99ResponseTime > 5000) {
    alerts.push(`Very slow p99 response time: ${metrics.p99ResponseTime}ms`);
  }

  return alerts;
}

/**
 * Log metrics periodically (for development/debugging)
 */
export function startMetricsLogger(intervalMs = 60000): NodeJS.Timeout {
  return setInterval(() => {
    const metrics = metricsCollector.getMetrics();
    const alerts = checkHealthAlerts();

    logger.info("Metrics snapshot", "metrics", {
      requestCount: metrics.requestCount,
      errorRate: `${metrics.errorRate}%`,
      avgResponseTime: `${metrics.averageResponseTime}ms`,
      p95ResponseTime: `${metrics.p95ResponseTime}ms`,
      businessOps: {
        deposits: metrics.depositCount,
        withdrawals: metrics.withdrawalCount,
        investments: metrics.investmentCount,
        vaultTransfers: metrics.vaultTransferCount,
      },
    });

    if (alerts.length > 0) {
      logger.warn("Health alerts detected", "metrics", { alerts });
    }
  }, intervalMs);
}
