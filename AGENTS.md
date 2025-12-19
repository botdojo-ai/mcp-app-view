# mcp-app-view — Agents Guide

## Purpose

Build and embed MCP Apps (SEP-1865) - Interactive User Interfaces for MCP. This is a standalone, zero-dependency package that provides both framework-agnostic and React-specific APIs for building MCP Apps.

**Built by [BotDojo](https://botdojo.com)** as an open-source contribution to the MCP ecosystem.

**Key Responsibilities:**
- Implement SEP-1865 MCP Apps protocol
- Provide convenient React hooks and components
- Support hosting MCP Apps via McpProxyHost
- Pluggable state management system (BotDojo provides persistent state provider)

## Key entry points

- Source root: `packages/mcp-app/src/`
- Important files:
  - `src/index.ts` - Main exports (framework-agnostic)
  - `src/react/index.ts` - React exports
  - `src/host/index.ts` - Host component exports
  - `src/protocol/client.ts` - Main McpAppClient class
  - `src/protocol/types.ts` - SEP-1865 type definitions
  - `src/state/StateProvider.ts` - State provider interface

## Package Structure

```
mcp-app/
├── src/
│   ├── index.ts                    # Main exports
│   ├── protocol/
│   │   ├── types.ts               # SEP-1865 types
│   │   ├── transport.ts           # PostMessage transport
│   │   └── client.ts              # McpAppClient
│   ├── state/
│   │   ├── StateProvider.ts       # State provider interface
│   │   └── MemoryStateProvider.ts # Default in-memory provider
│   ├── react/
│   │   ├── index.ts               # React exports
│   │   ├── useMcpApp.ts           # High-level hook
│   │   ├── useMcpProtocol.ts      # Low-level protocol hook
│   │   ├── useMcpToolStream.ts    # Tool streaming hook
│   │   ├── McpApp.tsx             # Wrapper component
│   │   └── McpAppContext.tsx      # Context provider
│   └── host/
│       ├── index.ts               # Host exports
│       └── McpProxyHost.tsx       # Host component
└── dist/                          # Built output
```

## Where to edit what

### Add a new protocol message type
- Add type definition in `src/protocol/types.ts`
- Add method constant to `McpMethods`
- Handle in `src/protocol/client.ts` handleMessage()
- Expose in React hooks if needed

### Add a new state provider
- Implement `StateProvider<T>` interface from `src/state/StateProvider.ts`
- Export from `src/state/index.ts`
- Example: BotDojo will add a `BotDojoStateProvider` that persists via `ui/message`

### Add a new React hook
- Create in `src/react/`
- Export from `src/react/index.ts`
- Follow existing hook patterns

### Modify the host component
- Edit `src/host/McpProxyHost.tsx`
- The host handles ui/initialize and forwards tool updates

## Run & test

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm typecheck

# Clean
pnpm clean
```

## Exports

```ts
// Framework-agnostic (main entry)
import { McpAppClient, McpTransport } from 'mcp-app-view';
import { createMemoryStateProvider } from 'mcp-app-view';
import type { AppInfo, HostContext, ToolInputParams } from 'mcp-app-view';

// React (requires react peer dependency)
import { useMcpApp, useMcpProtocol, useMcpToolStream } from 'mcp-app-view/react';
import { McpApp, McpAppProvider, useMcpAppContext } from 'mcp-app-view/react';

// Host component
import { McpProxyHost } from 'mcp-app-view/host';

// BotDojo integration (in @botdojo/sdk)
import { BotDojoStateProvider } from '@botdojo/sdk';
```

## BotDojo Integration

When used with BotDojo, additional features are available:

1. **Persistent State** - State is automatically persisted across sessions
2. **Tool Streaming** - Real-time tool argument streaming
3. **BotDojoStateProvider** - Drop-in state provider for automatic persistence

```tsx
import { useMcpApp } from 'mcp-app-view/react';
import { BotDojoStateProvider } from '@botdojo/sdk';

function MyApp() {
  const { state } = useMcpApp({
    initialState: { counter: 0 },
    stateProvider: new BotDojoStateProvider({ canvasId: 'my-app' }),
  });
}
```

## SEP-1865 Protocol Reference

Protocol identifier: `io.modelcontextprotocol/ui`

### Host → App Messages
- `ui/initialize` - Initialize app
- `ui/notifications/tool-input-partial` - Streaming tool args
- `ui/notifications/tool-input` - Final tool args
- `ui/notifications/tool-result` - Tool result
- `ui/tool-cancelled` - Tool cancelled
- `ui/notifications/host-context-changed` - Context update
- `ui/resource-teardown` - Cleanup

### App → Host Messages
- `ui/notifications/initialized` - App ready
- `ui/notifications/size-change` - Size change
- `ui/open-link` - Open URL
- `ui/message` - Send message
- `tools/call` - Call tool

## Patterns & conventions

### State Provider Pattern
```ts
interface StateProvider<T> {
  getState(): T;
  setState(state: T): void;
  updateState(patch: Partial<T>): void;
  subscribe(listener: (state: T, prevState: T) => void): () => void;
  persist?(): Promise<void>;
  hydrate?(initialState?: T): Promise<T>;
}
```

### React Hook Usage
```tsx
// Simple usage
const { state, tool, sendMessage } = useMcpApp({ initialState: { counter: 0 } });

// With auto size reporting
const containerRef = useRef<HTMLDivElement>(null);
const { state } = useMcpApp({ initialState: {}, containerRef });
```

### Host Component Usage
```tsx
<McpProxyHost
  proxyUrl="https://proxy.example.com"
  appUrl="https://app.example.com"
  onToolCall={async (name, args) => { /* handle */ }}
  onMessage={async (params) => { /* handle */ }}
/>
```

## Troubleshooting

### Messages not being received
- Check that the iframe has loaded before sending
- Verify targetOrigin is correct (default: '*')
- Enable debug mode: `new McpAppClient({ debug: true })`

### State not updating
- Ensure you're using the state from the hook, not stale closure
- Check that state provider is not being recreated on each render

### TypeScript errors with state
- Provide type parameter: `useMcpApp<MyStateType>({ ... })`

## Improving this document

If you find gaps or mistakes, propose a PR with concrete edits.

