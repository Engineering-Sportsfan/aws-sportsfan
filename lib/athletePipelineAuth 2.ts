// Config for the Python athlete pipeline service (sportsfan360-sentiment on
// Render). Same convention as app/api/ask-ai/route.ts's PYTHON_AI_URL/KEY —
// base URL and key both come from env, sent as the x-api-key header.
export function getAthletePipelineConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.ATHLETE_PIPELINE_URL;
  const apiKey = process.env.ATHLETE_PIPELINE_KEY;
  if (!baseUrl) return null;
  return { baseUrl, apiKey: apiKey ?? "" };
}