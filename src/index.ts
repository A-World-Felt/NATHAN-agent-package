// Package entry point `.`: engine, ports, types.
// CONSTRAINT: no disk access here (ADR-AGENT-0002). The llm barrel carries the core kernel; the
// tools barrel adds the port and the dispatcher, which are pure. The file tools, coupled to fs,
// ship behind the `./tools` subpath; the harness behind `./testing`.
// context/ ships here rather than behind its own subpath: no standalone consumer yet (ADR-AGENT-0012).
export * from "./llm/index.js";
export * from "./context/index.js";
export * from "./tools/index.js";
