type Detail = { "@type"?: string; retryDelay?: string; violations?: { quotaMetric?: string; quotaId?: string }[] };
export async function readQuota(response: Response) {
  let details: Detail[] = [];
  try {
    const data = await response.json();
    if (Array.isArray(data?.error?.details)) details = data.error.details;
  } catch { /* Some upstream errors have no JSON body. */ }
  const metrics = details.flatMap(d => Array.isArray(d.violations) ? d.violations.map(v => `${v.quotaMetric ?? ""} ${v.quotaId ?? ""}`) : []).filter(Boolean);
  const daily = metrics.some(metric => /per.?day|daily/i.test(metric));
  const retryValue = details.find(d => typeof d.retryDelay === "string")?.retryDelay;
  const header = response.headers.get("retry-after");
  const seconds = retryValue && /^\d+(\.\d+)?s$/.test(retryValue) ? Number(retryValue.slice(0, -1)) : header && /^\d+$/.test(header) ? Number(header) : undefined;
  const waitMs = seconds === undefined ? undefined : Math.ceil(seconds * 1000);
  return {
    metrics: metrics.map(m => m.replace(/[^a-zA-Z0-9_. /-]/g, "").slice(0, 200)).slice(0, 8),
    daily,
    waitMs,
    retry: !daily && waitMs !== undefined && waitMs > 0 && waitMs <= 4000,
    message: daily ? "The Gemini daily quota has been reached. Your outfit is unchanged. Try Sample mode or check your project's quota."
      : seconds !== undefined ? `Gemini is rate-limited. Wait ${Math.ceil(seconds)} seconds before retrying, or use Sample mode. Your outfit is unchanged.`
      : "Gemini is busy or its quota has been reached. Your outfit is unchanged. Retry later or use Sample mode.",
  };
}
