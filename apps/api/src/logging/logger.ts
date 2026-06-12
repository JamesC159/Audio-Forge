import pino from "pino";

// EMF (Embedded Metrics Format) for CloudWatch — zero-dependency structured metrics.
// CloudWatch Logs agent picks up the _aws key automatically and ingests as metrics.
export interface EmfMetric {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: string[][];
      Metrics: Array<{ Name: string; Unit: string }>;
    }>;
  };
  [key: string]: unknown;
}

export function emfMetric(
  metricName: string,
  value: number,
  unit: "Count" | "Milliseconds" | "Bytes" | "Percent",
  dimensions: Record<string, string> = {}
): EmfMetric {
  const namespace = process.env.CLOUDWATCH_NAMESPACE ?? "AudioForge/Local";
  const dimensionKeys = Object.keys(dimensions);

  return {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: dimensionKeys.length ? [dimensionKeys] : [[]],
          Metrics: [{ Name: metricName, Unit: unit }],
        },
      ],
    },
    [metricName]: value,
    ...dimensions,
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // In production ship JSON; in dev use pretty-print via pino-pretty
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  base: { service: "audio-forge-api" },
  // Redact sensitive fields before they hit CloudWatch
  redact: {
    paths: ["req.headers.authorization", "*.password", "*.token"],
    censor: "[REDACTED]",
  },
});

// Emit a CloudWatch EMF metric alongside the pino log
export function logMetric(
  metricName: string,
  value: number,
  unit: "Count" | "Milliseconds" | "Bytes" | "Percent",
  dimensions: Record<string, string> = {}
) {
  const metric = emfMetric(metricName, value, unit, dimensions);
  // pino serialises this as JSON — CloudWatch agent detects _aws key
  logger.info(metric, `metric:${metricName}`);
}
