# Portability Model

## Principle
- MCP server is the product.
- Skills/playbooks are adapters.

This repo keeps implementation portable and agent-specific UX separate.

## What is portable
- `mcp/server.py` protocol contract
- Tool names and input/output schemas
- Error code model
- Runtime requirements (env vars)

## What is agent-specific
- Hermes SKILL.md metadata (`metadata.hermes.*`, toolsets)
- OpenClaw command/playbook conventions
- Installation and registration commands

## Compatibility target
- Hermes Agent: via MCP registration + Hermes skill adapter
- OpenClaw: via MCP registration + OpenClaw adapter docs
- Other MCP clients: directly, as long as stdio MCP is supported
