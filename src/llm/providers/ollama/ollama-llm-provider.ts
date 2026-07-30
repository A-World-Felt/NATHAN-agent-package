import { LLMError } from "../../models/index.js";
import type { CompletionOptions, LLMProvider } from "../../interfaces/index.js";
import type {
  Message,
  ModelInfo,
  ToolCall,
  ToolDefinition,
  LLMResponse,
  LLMChunk,
  Usage,
} from "../../models/index.js";

/** The injectable fetch contract: the real global fetch in prod, a fake in tests, the seam that keeps the adapter testable offline. */
type FetchLike = typeof fetch;

export type OllamaConfig = {
  /** The models this provider offers, declared rather than queried (ADR-AGENT-0017). */
  models: ModelInfo[];
  baseURL?: string;
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

export class OllamaLLMProvider implements LLMProvider {
  readonly id = "ollama";
  private readonly declaredModels: ModelInfo[];
  private readonly baseURL: string;
  private readonly fetchFn: FetchLike;

  constructor(config: OllamaConfig) {
    this.declaredModels = config.models;
    this.baseURL = config.baseURL ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
    this.fetchFn = config.fetch ?? fetch;
  }

  models(): ModelInfo[] {
    return this.declaredModels;
  }

  // Ollama streams every chat model over its transport; capability is not per-model here.
  supportsStreaming(): boolean {
    return true;
  }

  async complete(messages: Message[], opts: CompletionOptions): Promise<LLMResponse> {
    const res = await this.post(messages, opts, false);
    let body: OllamaChatChunk;
    try {
      body = (await res.json()) as OllamaChatChunk;
    } catch (cause) {
      throw new LLMError("API_ERROR", `Ollama returned a malformed JSON body: ${String(cause)}`, { cause });
    }
    return {
      content: body.message.content,
      toolCalls: toToolCalls(body.message.tool_calls),
      usage: toUsage(body),
    };
  }

  async *stream(messages: Message[], opts: CompletionOptions): AsyncIterable<LLMChunk> {
    const res = await this.post(messages, opts, true);
    if (!res.body) {
      throw new LLMError("API_ERROR", "Ollama streaming response has no body");
    }
    for await (const line of readNdjson(res.body)) {
      let chunk: OllamaChatChunk;
      try {
        chunk = JSON.parse(line) as OllamaChatChunk;
      } catch (cause) {
        throw new LLMError("API_ERROR", `Ollama returned a malformed NDJSON line: ${String(cause)}`, { cause });
      }
      // LLMChunk declares done as a boolean, and checkProviderContract asserts it. Reject a chunk
      // without it rather than emit done: undefined, which would break that contract downstream.
      if (typeof chunk.done !== "boolean") {
        throw new LLMError("API_ERROR", `Ollama stream chunk has no done boolean: ${line}`);
      }
      yield {
        contentDelta: chunk.message?.content ?? "",
        done: chunk.done,
        usage: chunk.done ? toUsage(chunk) : undefined,
      };
    }
  }

  private async post(messages: Message[], opts: CompletionOptions, stream: boolean): Promise<Response> {
    this.assertDeclared(opts.model);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseURL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages: messages.map(toRequestMessage),
          tools: opts.tools?.map(toRequestTool),
          stream,
        }),
      });
    } catch (cause) {
      throw new LLMError("API_ERROR", `Ollama request failed: ${String(cause)}`, { cause });
    }
    if (!res.ok) {
      const body = await res.text();
      // A 404 has two unrelated causes: a model the server does not hold, and a baseURL that never
      // reaches Ollama. Reporting both as MODEL_NOT_FOUND would break the promise LLMErrorCode makes,
      // that the code tells cases apart without reading the message, and would answer a wrong URL
      // with an `ollama pull` that fixes nothing.
      if (res.status === 404) {
        if (isApiErrorBody(body)) {
          throw new LLMError(
            "MODEL_NOT_FOUND",
            `Ollama on ${this.baseURL} has no model '${opts.model}'. Install it with: ollama pull ${opts.model}. Server said: ${body}`,
          );
        }
        throw new LLMError(
          "API_ERROR",
          `Ollama 404 from ${this.baseURL} did not come from the API. Check the base URL. Server said: ${body}`,
        );
      }
      throw new LLMError("API_ERROR", `Ollama ${res.status}: ${body}`);
    }
    return res;
  }

  /** A model absent from the declaration never reaches the network: the error names what is on offer. */
  private assertDeclared(model: string): void {
    const isDeclared = this.declaredModels.some((declared) => declared.id === model);
    if (isDeclared) return;
    const offered = this.declaredModels.map((declared) => declared.id).join(", ");
    throw new LLMError(
      "MODEL_NOT_FOUND",
      `Model '${model}' is not declared on this provider. Declared: ${offered}`,
    );
  }
}

/**
 * Whether a failing response came from the API itself, which answers its errors as JSON carrying
 * `error`. A request that never reached the API comes back as whatever the fronting server writes,
 * which is not that shape. The split is not airtight, a proxy may answer JSON too, so both branches
 * keep the server's own body and let the reader settle it.
 */
function isApiErrorBody(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  return typeof (parsed as { error?: unknown }).error === "string";
}

function toRequestMessage(m: Message): OllamaRequestMessage {
  const out: OllamaRequestMessage = { role: m.role, content: m.content };
  // Only the assistant variant of the discriminated-union Message carries toolCalls.
  if (m.role === "assistant" && m.toolCalls?.length) {
    out.tool_calls = m.toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.arguments } }));
  }
  // A `role:"tool"` message forwards only role and content; its toolCallId is not sent on the wire.
  // Revisit against the endpoint if call/result correlation ever becomes necessary.
  return out;
}

function toRequestTool(t: ToolDefinition) {
  return { type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } };
}

function toToolCalls(calls: OllamaToolCall[] | undefined): ToolCall[] {
  if (calls === undefined) return [];
  return calls.map((c, i) => ({
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
  // Flush any multi-byte sequence the decoder is still holding after the last read.
  buffer += decoder.decode();
  const last = buffer.trim();
  if (last) yield last;
}
