import type { CompletionOptions, LLMProvider } from "../interfaces/index.js";
import type { Message, ModelInfo, LLMResponse } from "../models/index.js";

export type FakeConfig = {
  id?: string;
  /** Models this fake declares. Defaults to a single tool-capable one. */
  models?: ModelInfo[];
  /** One scripted response per `complete()` call, in order. */
  responses: LLMResponse[];
};

/**
 * Scripted, deterministic provider (ADR-AGENT-0013). The second implementation of the port:
 * it validates the interface and drives the loop tests without a network.
 * It records every call so a test can assert what the loop sent (e.g. "the last call had no tools").
 */
export class FakeLLMProvider implements LLMProvider {
  readonly id: string;
  readonly calls: { messages: Message[]; opts: CompletionOptions }[] = [];
  private readonly declaredModels: ModelInfo[];
  private readonly script: LLMResponse[];
  private cursor = 0;

  constructor(config: FakeConfig) {
    this.id = config.id ?? "fake";
    this.declaredModels = config.models ?? [{ id: "fake-model", supportsTools: true }];
    this.script = config.responses;
  }

  models(): ModelInfo[] {
    return this.declaredModels;
  }

  supportsStreaming(): boolean {
    return false;
  }

  async complete(messages: Message[], opts: CompletionOptions): Promise<LLMResponse> {
    this.calls.push({ messages, opts });
    if (this.cursor >= this.script.length) {
      throw new Error(`FakeLLMProvider: no scripted response for call #${this.cursor + 1}`);
    }
    return this.script[this.cursor++];
  }
}
