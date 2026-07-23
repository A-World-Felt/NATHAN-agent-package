// Package entry point `.`: engine, ports, types.
// CONSTRAINT: no disk access here (this barrel must stay importable everywhere, ADR-AGENT-0002).
// core carries the shared kernel types; tools/models adds ToolResult.
// Disk-coupled tools live behind `./tools`; the harness behind `./testing`.

export * from "./core/index.js";
export * from "./llm/models/index.js";
export * from "./tools/models/index.js";
