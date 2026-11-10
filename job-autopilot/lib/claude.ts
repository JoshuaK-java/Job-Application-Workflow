import Anthropic from "@anthropic-ai/sdk";

export const claude = new Anthropic(); // reads ANTHROPIC_API_KEY

export async function askText(model: string, system: string, user: string, maxTokens = 4000) {
  const res = await claude.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

export type JSONSchema = Anthropic.Tool.InputSchema;

/**
 * Gets structured data back using tool use: Claude must answer by "calling" a tool whose
 * input matches `schema`, so the API returns an object instead of text to parse.
 * Retries once (with more room) if the answer was cut off or missing.
 */
export async function askStructured<T>(
  model: string,
  system: string,
  user: string,
  schema: JSONSchema,
  maxTokens = 1000
): Promise<T> {
  const tool: Anthropic.Tool = {
    name: "record_result",
    description: "Record your answer. Always answer by calling this tool.",
    input_schema: schema,
  };
  let lastProblem = "";
  for (const tokens of [maxTokens, maxTokens * 2]) {
    const res = await claude.messages.create({
      model,
      max_tokens: tokens,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: user }],
    });
    const call = res.content.find((b) => b.type === "tool_use");
    if (call && call.type === "tool_use" && res.stop_reason !== "max_tokens") return call.input as T;
    lastProblem = res.stop_reason === "max_tokens" ? "answer was cut off" : "no structured answer returned";
  }
  throw new Error(`Claude: ${lastProblem}`);
}
