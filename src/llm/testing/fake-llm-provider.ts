import { LLMError } from "../models/index.js";
import type { CompletionOptions, LLMProvider } from "../interfaces/index.js";
import type { Message, ModelInfo, LLMResponse } from "../models/index.js";

export type FakeConfig = {
  id?: string;
  /**
   * Whether the model this fake declares calls tools. Configurable, unlike the model id, because
   * it is a real behavioural axis: a model that cannot call tools signals its end differently
   * (`ADR-AGENT-0003`).
   */
  supportsTools?: boolean;
  /** One scripted response per `complete()` call, in order. */
  responses: LLMResponse[];
};

/**
 * Scripted, deterministic provider (ADR-AGENT-0013). The second implementation of the port:
 * it validates the interface and drives the loop tests without a network.
 * It records every call so a test can assert what the loop sent (e.g. "the last call had no tools").
 *
 * **Its model is fixed and no configuration can change it.** A script is a list consumed in order,
 * indexed by a cursor and never by the model, so a fake declaring several models would answer all
 * of them identically and lie about its own nature. Whether the model matters is what the real-LLM
 * suite measures; this one exists so that the provider is never the reason a test fails.
 */
export class FakeLLMProvider implements LLMProvider {
  /** The only model this fake answers for. A constant, not a string to guess: autocompletion finds it. */
  static readonly MODEL_ID = "fake-model";

  readonly id: string;
  readonly calls: { messages: Message[]; opts: CompletionOptions }[] = [];
  private readonly toolsSupported: boolean;
  private readonly script: LLMResponse[];
  private cursor = 0;

  constructor(config: FakeConfig) {
    this.id = config.id ?? "fake";
    this.toolsSupported = config.supportsTools ?? true;
    this.script = config.responses;
  }

  models(): ModelInfo[] {
    // A fresh array each call, so a caller that mutates the result cannot corrupt the declaration.
    return [{ id: FakeLLMProvider.MODEL_ID, supportsTools: this.toolsSupported }];
  }

  supportsStreaming(): boolean {
    return false;
  }

  async complete(messages: Message[], opts: CompletionOptions): Promise<LLMResponse> {
    this.assertDeclared(opts.model);
    this.calls.push({ messages, opts });
    if (this.cursor >= this.script.length) {
      throw new Error(`FakeLLMProvider: no scripted response for call #${this.cursor + 1}`);
    }
    return this.script[this.cursor++];
  }

  /**
   * Refusing a model it never declared is a property of the port, not an Ollama quirk
   * (`ADR-AGENT-0017`). A refused call is not recorded: it never happened.
   */
  private assertDeclared(model: string): void {
    if (model === FakeLLMProvider.MODEL_ID) return;
    throw new LLMError(
      "MODEL_NOT_FOUND",
      `FakeLLMProvider answers for '${FakeLLMProvider.MODEL_ID}' only, not '${model}'.`,
    );
  }
}
