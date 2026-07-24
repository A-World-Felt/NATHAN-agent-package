import type { LLMProvider } from "../llm/interfaces/index.js";

/** One invariant of the port, checked in isolation. `detail` is filled only on failure. */
export type ContractCheck = { name: string; ok: boolean; detail?: string };

/** The outcome of {@link checkProviderContract}. `ok` is the AND of every check. */
export type ContractReport = { ok: boolean; checks: ContractCheck[] };

/** A check body returns a plain boolean, or `{ ok, detail }` to carry a diagnostic. */
type CheckResult = boolean | { ok: boolean; detail?: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isUsage = (u: unknown): boolean =>
  isRecord(u) && typeof u.tokensIn === "number" && typeof u.tokensOut === "number";

/** Best-effort rendering of a value for a failure detail; never throws. */
const seen = (v: unknown): string => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

/**
 * Runner-agnostic conformance check for the `LLMProvider` port (ADR-AGENT-0015).
 * Runs the port's happy path and records one {@link ContractCheck} per invariant.
 *
 * It **never throws on a failed check**: a violated invariant — or an exception thrown
 * while checking it — is caught and recorded as `{ ok:false, detail }`. The caller asserts
 * on the returned {@link ContractReport} with whatever test runner it likes, or none.
 *
 * Streaming checks run only when `provider.supportsStreaming()` is true (ADR-AGENT-0013):
 * a non-streaming provider records none.
 */
export async function checkProviderContract(
  provider: LLMProvider,
  opts?: { prompt?: string },
): Promise<ContractReport> {
  const prompt = opts?.prompt ?? "ping";
  const checks: ContractCheck[] = [];

  // Run one check in isolation: a thrown error becomes a recorded failure, not a crash.
  const check = async (name: string, fn: () => CheckResult | Promise<CheckResult>): Promise<void> => {
    try {
      const r = await fn();
      const ok = typeof r === "boolean" ? r : r.ok;
      const detail = typeof r === "boolean" ? undefined : r.detail;
      checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
    } catch (err) {
      checks.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  };

  await check("model is a non-empty string", () =>
    typeof provider.model === "string" && provider.model.length > 0
      ? true
      : { ok: false, detail: `model = ${seen(provider.model)}` },
  );

  await check("supportsTools() returns a boolean", () =>
    typeof provider.supportsTools() === "boolean"
      ? true
      : { ok: false, detail: `supportsTools() = ${seen(provider.supportsTools())}` },
  );

  await check("supportsStreaming() returns a boolean", () =>
    typeof provider.supportsStreaming() === "boolean"
      ? true
      : { ok: false, detail: `supportsStreaming() = ${seen(provider.supportsStreaming())}` },
  );

  // Capture the completion once; the shape checks below read it. If complete() throws
  // (a propagating provider error), this check fails and `response` stays undefined,
  // so the shape checks fail gracefully instead of crashing.
  let response: unknown;
  await check("complete() resolves", async () => {
    response = await provider.complete([{ role: "user", content: prompt }]);
    return true;
  });

  await check("complete() content is a string", () =>
    isRecord(response) && typeof response.content === "string"
      ? true
      : { ok: false, detail: `response = ${seen(response)}` },
  );

  await check("complete() toolCalls is an array", () =>
    isRecord(response) && Array.isArray(response.toolCalls)
      ? true
      : { ok: false, detail: `response = ${seen(response)}` },
  );

  await check("complete() usage, if present, is {tokensIn, tokensOut}", () => {
    const u = isRecord(response) ? response.usage : undefined;
    return u === undefined || isUsage(u) ? true : { ok: false, detail: `usage = ${seen(u)}` };
  });

  // Streaming is an optional capability: check it only when the provider declares support.
  let streams = false;
  try {
    streams = provider.supportsStreaming() === true;
  } catch {
    streams = false; // already recorded as a failure by the boolean check above
  }
  if (streams) {
    const streamFn = provider.stream;
    const defined = typeof streamFn === "function";
    await check("stream is defined", () =>
      defined
        ? true
        : { ok: false, detail: "supportsStreaming() is true but stream is undefined" },
    );
    if (defined && streamFn) {
      const boundStream = streamFn.bind(provider);
      const chunks: unknown[] = [];
      await check("stream yields at least one chunk", async () => {
        for await (const c of boundStream([{ role: "user", content: prompt }])) {
          chunks.push(c);
        }
        return chunks.length >= 1 ? true : { ok: false, detail: "0 chunks" };
      });

      await check("each chunk has contentDelta:string and done:boolean", () => {
        const bad = chunks.findIndex(
          (c) => !(isRecord(c) && typeof c.contentDelta === "string" && typeof c.done === "boolean"),
        );
        return bad === -1 ? true : { ok: false, detail: `chunk #${bad} = ${seen(chunks[bad])}` };
      });

      await check("exactly the last chunk has done:true", () => {
        const dones = chunks.map((c) => isRecord(c) && c.done === true);
        const count = dones.filter(Boolean).length;
        const lastIsDone = dones.length > 0 && dones[dones.length - 1] === true;
        return count === 1 && lastIsDone
          ? true
          : { ok: false, detail: `${count} chunk(s) with done:true across ${chunks.length}` };
      });

      await check("terminal usage, if present, is {tokensIn, tokensOut}", () => {
        const last = chunks[chunks.length - 1];
        const u = isRecord(last) ? last.usage : undefined;
        return u === undefined || isUsage(u) ? true : { ok: false, detail: `usage = ${seen(u)}` };
      });
    }
  }

  return { ok: checks.every((c) => c.ok), checks };
}
