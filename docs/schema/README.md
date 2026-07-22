# Schemas: nathan-agent-core

## File to read: `Architecture-agent-core.drawio`

Five pages, **in order**. The first four explain the mindset; the fifth gives the complete architecture. Opening page 5 first means seeing boxes without understanding why they are laid out that way.

| Page | Title | What it makes you understand |
|---|---|---|
| **1** | Agent view | Its entire universe fits into messages: a prompt, a history, a list of tool schemas. Everything else is behind a **wall of opacity**. Whoever controls the tool boundary controls its entire reality. |
| **2** | The substitution | The same agent, two worlds behind the same `ITool`: the real app, or the simulator. **Identical from its point of view.** This is the diagram that explains why we can test an agent without an app. |
| **3** | One iteration | Who talks to whom, and in what order. Each tool call suspends the agent: it is this suspension that the harness drives. The absence of a tool call is the stop signal. |
| **4** | The harness | Scenarios × axes × repetitions → a report. Why a single run measures nothing, why `env` is a factory, why we keep the failures. |
| **5** | Complete architecture | The class diagram, four bands, 28 classes. To be read last. |

## Why five diagrams

A class diagram shows **what exists**, not **what happens**. The strength of this architecture is dynamic: the agent acts on a world it knows nothing about, and it is this ignorance that makes testing possible. No box says that: hence pages 1 to 4.

## UML notation of page 5

| Relation | Line |
|---|---|
| realizes a port (`OllamaLLMProvider` → `ILLMProvider`) | dashed + hollow triangle |
| aggregation, holds a reference (`AgenticLLM` ◇→ `ILLMProvider`) | hollow diamond on the holder side |
| dependency (`Test harness` → `AgenticLLM`) | dashed + open arrow |

**The dashed line has only one meaning: the UML semantics.** V3/V4 status is conveyed solely by the gray fill and the label, never by the line. That was a mistake of a previous version, where the dashed line sometimes meant "realizes a port", sometimes "not yet built".

## Other files

| File | Status |
|---|---|
| `DiagrammeClasseAI.drawio` | **original diagram**, kept as is. Historical reference. |
| `DiagrammeClasseAI-V1.drawio` | team variant, unmodified. |
| `DiagrammeClasse-agent-core.drawio` | ⚠️ **outdated**: replaced by page 5 of `Architecture-agent-core.drawio`. Its arrows are wrong (solid line for realizations, dashed line in both directions). **To be deleted.** |

## What is not verified

The files are validated structurally: well-formed XML, no orphan edge, consistent box heights, no overlap. **The visual rendering is not**: the routing of the orthogonal edges and the possible overflow of the texts only show up when opening the file in draw.io.
