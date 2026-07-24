import type { LLMProvider } from "../llm/interfaces/index.js";
import type { Message, ToolDefinition, LLMResponse } from "../llm/models/index.js";

export type FakeConfig = {
  model?: string;
  supportsTools?: boolean;
  /** One scripted response per `complete()` call, in order. */
  responses: LLMResponse[];
};

/**
 * Scripted, deterministic provider (ADR-AGENT-0013). The second implementation of the port:
 * it validates the interface and drives the loop tests without a network.
 * It records every call so a test can assert what the loop sent (e.g. "the last call had no tools").
 */
export class FakeLLMProvider implements LLMProvider {
  readonly model: string;
  readonly calls: { messages: Message[]; tools?: ToolDefinition[] }[] = [];
  private readonly toolsSupported: boolean;
  private readonly script: LLMResponse[];
  private cursor = 0;

  constructor(config: FakeConfig) {
    this.model = config.model ?? "fake";
    this.toolsSupported = config.supportsTools ?? true;
    this.script = config.responses;
  }

  supportsTools(): boolean {
    return this.toolsSupported;
  }

  supportsStreaming(): boolean {
    return false;
  }

  async complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    this.calls.push({ messages, tools });
    if (this.cursor >= this.script.length) {
      throw new Error(`FakeLLMProvider: no scripted response for call #${this.cursor + 1}`);
    }
    return this.script[this.cursor++];
  }
}
