import { LLMError } from "../../models/index.js";
import type { ILLMProvider } from "../../interfaces/index.js";
import type {
  Message,
  ToolCall,
  ToolDefinition,
  LLMResponse,
  LLMChunk,
  Usage,
} from "../../models/index.js";

/** The injectable fetch contract: the real global fetch in prod, a fake in tests — the seam that keeps the adapter testable offline. */
type FetchLike = typeof fetch;

export type OllamaConfig = {
  model: string;
  baseURL?: string;
  /** Whether the model supports tool calls. Default true (verified for qwen2.5). See ADR-0013. */
  supportsTools?: boolean;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: FetchLike;
};

// --- Ollama /api/chat wire types (verified against the endpoint 2026-07-22) ---
type OllamaToolCall = {
  id?: string;
  function: { index?: number; name: string; arguments: Record<string, unknown> };
};
type OllamaResponseMessage = { role: string; content: string; tool_calls?: OllamaToolCall[] };
type OllamaChatChunk = {
  message: OllamaResponseMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
};
type OllamaRequestMessage = {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
};

export class OllamaLLMProvider implements ILLMProvider {
  readonly model: string;
  private readonly baseURL: string;
  private readonly toolsSupported: boolean;
  private readonly fetchFn: FetchLike;

  constructor(config: OllamaConfig) {
    this.model = config.model;
    this.baseURL = config.baseURL ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
    this.toolsSupported = config.supportsTools ?? true;
    this.fetchFn = config.fetch ?? fetch;
  }

  supportsTools(): boolean {
    return this.toolsSupported;
  }

  // Ollama streams every chat model over its transport; capability is not per-model here.
  supportsStreaming(): boolean {
    return true;
  }

  async complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const res = await this.post(messages, tools, false);
    const body = (await res.json()) as OllamaChatChunk;
    return {
      content: body.message.content,
      toolCalls: toToolCalls(body.message.tool_calls),
      usage: toUsage(body),
    };
  }

  async *stream(messages: Message[], tools?: ToolDefinition[]): AsyncIterable<LLMChunk> {
    const res = await this.post(messages, tools, true);
    if (!res.body) {
      throw new LLMError("API_ERROR", "Ollama streaming response has no body");
    }
    for await (const line of readNdjson(res.body)) {
      const chunk = JSON.parse(line) as OllamaChatChunk;
      yield {
        contentDelta: chunk.message?.content ?? "",
        done: chunk.done,
        usage: chunk.done ? toUsage(chunk) : undefined,
      };
    }
  }

  private async post(messages: Message[], tools: ToolDefinition[] | undefined, stream: boolean): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseURL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(toRequestMessage),
          tools: tools?.map(toRequestTool),
          stream,
        }),
      });
    } catch (cause) {
      throw new LLMError("API_ERROR", `Ollama request failed: ${String(cause)}`, { cause });
    }
    if (!res.ok) {
      throw new LLMError("API_ERROR", `Ollama ${res.status}: ${await res.text()}`);
    }
    return res;
  }
}

function toRequestMessage(m: Message): OllamaRequestMessage {
  const out: OllamaRequestMessage = { role: m.role, content: m.content };
  // Only the assistant variant of the discriminated-union Message carries toolCalls.
  if (m.role === "assistant" && m.toolCalls?.length) {
    out.tool_calls = m.toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.arguments } }));
  }
  return out;
}

function toRequestTool(t: ToolDefinition) {
  return { type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } };
}

function toToolCalls(calls: OllamaToolCall[] | undefined): ToolCall[] {
  return (calls ?? []).map((c, i) => ({
    id: c.id ?? `call_${i}`,
    name: c.function.name,
    arguments: c.function.arguments,
  }));
}

function toUsage(chunk: OllamaChatChunk): Usage | undefined {
  if (typeof chunk.prompt_eval_count !== "number" || typeof chunk.eval_count !== "number") {
    return undefined;
  }
  return { tokensIn: chunk.prompt_eval_count, tokensOut: chunk.eval_count };
}

async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield line;
    }
  }
  const last = buffer.trim();
  if (last) yield last;
}
