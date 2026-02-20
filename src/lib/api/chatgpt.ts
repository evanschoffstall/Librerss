// AI image-lookup service — not yet integrated.
//
// To enable, set OPENAI_API_KEY in .env.local and replace the fetch call
// below with the current OpenAI chat-completions endpoint and model name.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

async function sendPrompt(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const data = await response.json();
  return (data.choices[0]?.message?.content ?? "").trim();
}

/**
 * Asks OpenAI to find a direct, publicly accessible image URL relevant to
 * the given news article URL. Returns the URL string, or "NO_VALID_IMAGE_FOUND"
 * if none could be located.
 */
export async function requestAIforNewsArticleRelatedImageURL(
  articleURL: string,
): Promise<string> {
  const prompt = `
You are a technically rigorous assistant. Given the news article URL below,
return exactly ONE fully-qualified direct image URL (starting with "https://")
that is publicly accessible and directly related to the article's content.
The image must not be a placeholder, generic icon, logo, or unrelated graphic.

Rules:
- Reply ONLY with the URL string. No other text or explanation.
- If no suitable image exists, reply only with: NO_VALID_IMAGE_FOUND

Article URL: ${articleURL}
  `.trim();

  return sendPrompt(prompt);
}
