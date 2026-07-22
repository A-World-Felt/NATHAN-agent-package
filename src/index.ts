// Package entry point `.`: engine, ports, types.
// CONSTRAINT: no disk access here (this barrel must stay importable everywhere, ADR-AGENT-0002).
// Disk-coupled implementations live behind `./tools`; the harness behind `./testing`.

export * from "./llm/models/index.js";
export * from "./tools/models/index.js";
