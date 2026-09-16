// Config for the Python athlete pipeline service (sportsfan360-sentiment).
// Follows the same convention as dolly/ask-ai routes:
// Reads ATHLETE_PIPELINE_URL and ATHLETE_PIPELINE_KEY from environment variables,
// returning null if not configured so callers can respond with 500 cleanly.
export function getAthletePipelineConfig(): { baseUrl: string; apiKey: string } | null {
  const rawUrl = process.env.ATHLETE_PIPELINE_URL;
  if (!rawUrl || !rawUrl.trim()) {
    return null;
  }

  let baseUrl = rawUrl.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  const apiKey = (process.env.ATHLETE_PIPELINE_KEY || "").trim().replace(/^["']|["']$/g, "");

  // Prevent Windows Node.js fetch ECONNREFUSED on IPv6 [::1] when using localhost
  if (baseUrl.includes("localhost")) {
    baseUrl = baseUrl.replace("localhost", "127.0.0.1");
  }

  return { baseUrl, apiKey };
}