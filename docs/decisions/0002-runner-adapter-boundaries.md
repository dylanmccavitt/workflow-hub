# Decision 0002: Runner Adapters Instead Of One Agent Runtime

## Chosen

Represent Symphony, Codex, and Cursor SDK as separate runner/adaptor surfaces in Workflow Hub.

## Why

Cursor SDK can provide a strong harness for Cursor agents and subagents, but Codex is not a native Cursor subagent backend. Symphony also has its own workflow state and dispatch model. Treating each system as a peer runner avoids hiding important state or forcing one tool into another's abstractions.

## Options Considered

- Make Cursor SDK the only runner.
- Run Codex through Cursor as if it were a native subagent.
- Expose Codex through an adapter/MCP-style runner while keeping Cursor SDK native.
- Keep Symphony visible as workflow state rather than only as a hidden trigger.

## Tradeoffs

Separate adapters require more glue code, but the model is honest and keeps each tool's boundaries clear.

## Consequences

- The GUI can show Symphony, Codex, and Cursor runs side by side.
- Codex can be exposed to Cursor later through an explicit adapter.
- Symphony remains inspectable in the GUI.
