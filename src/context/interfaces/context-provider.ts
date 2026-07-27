import type { Message } from "../../llm/models/index.js";

/**
 * The context port (ADR-AGENT-0016): what actually goes to the model, and the hook that lets a
 * strategy learn from what happened. Every strategy is an implementation of this one interface:
 * the sliding window now, a summarizing or memory-backed strategy later, composed if needed.
 *
 * Three members, and deliberately no memory vocabulary: that absence is what keeps the V3
 * memory decision open. `build` is async even though the sliding window is synchronous, because
 * a strategy that summarizes or retrieves must be able to await, and adding `async` later to a
 * published interface would break every implementer.
 */
export interface ContextProvider {
  /** Budget for the outbound list only. The caller sets it under the model's real window. */
  readonly maxTokens: number;
  /** The final message list sent to the model. Nothing is appended to it afterwards. */
  build(history: Message[]): Promise<Message[]>;
  /**
   * What the last iteration added: the assistant message and the tool messages that follow it,
   * not the whole history. Awaited, so evaluation runs stay deterministic. An implementation
   * must not throw: losing a memory write is less bad than losing the answer.
   */
  observe(exchange: Message[]): Promise<void>;
}
