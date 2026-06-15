import OpenAI from "openai";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return new OpenAI({ apiKey });
}

export async function generateHaiku(): Promise<string> {
  const openai = getOpenAIClient();

  const prompt =
    "Write a haiku about AI. Output exactly 3 lines with a 5-7-5 syllable pattern. Do not include any extra commentary or headings.";

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned an empty response");

  return content;
}
