type ApiMetric = {
  route: string;
  startMs: number;
};

function shouldLog(ms: number, ok: boolean) {
  if (!ok) return true;
  if (ms >= 800) return true;
  // Allow verbose logging via env var. Otherwise sample a small percentage to reduce volume.
  if (process.env.API_METRICS_VERBOSE === "1") return true;
  const rate = Number(process.env.API_METRICS_SAMPLE_RATE ?? 0.05);
  try {
    return Math.random() < rate;
  } catch {
    return false;
  }
}

export function beginApiMetric(route: string): ApiMetric {
  return { route, startMs: Date.now() };
}

export function endApiMetric(
  metric: ApiMetric,
  result: { ok: boolean; status?: number; note?: string }
) {
  const ms = Date.now() - metric.startMs;
  if (!shouldLog(ms, result.ok)) return;
  const tag = result.ok ? "[API_OK]" : "[API_ERR]";
  const status = result.status ?? (result.ok ? 200 : 500);
  const note = result.note ? ` note=${result.note}` : "";
  const line = `${tag} route=${metric.route} status=${status} duration_ms=${ms}${note}`;
  if (result.ok) {
    console.info(line);
    return;
  }
  console.error(line);
}

