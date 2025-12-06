# mcp-app-view

Build and embed MCP Apps (SEP-1865) - Interactive User Interfaces for MCP.

**Built by [BotDojo](https://botdojo.com) • Framework-agnostic • Optional React support • Zero dependencies**

[![npm version](https://img.shields.io/npm/v/mcp-app-view.svg)](https://www.npmjs.com/package/mcp-app-view)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What is this?

MCP Apps (SEP-1865) is an extension to the Model Context Protocol that enables AI agents to deliver interactive user interfaces. This SDK makes it easy to build MCP Apps that work with any MCP-compatible host.

This package was created by [BotDojo](https://botdojo.com) as an open-source contribution to the MCP ecosystem. While it works standalone with any MCP host, it integrates seamlessly with BotDojo for features like persistent state, tool streaming, and more.

## Installation

```bash
npm install mcp-app-view
# or
pnpm add mcp-app-view
# or
yarn add mcp-app-view
```

## Features

- ✅ **SEP-1865 Compliant** - Implements the [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps)
- ✅ **Framework Agnostic** - Works with any framework or vanilla JS
- ✅ **Optional React Support** - First-class React hooks and components
- ✅ **Zero Dependencies** - No external runtime dependencies
- ✅ **TypeScript First** - Full type safety
- ✅ **State Management** - Built-in state provider system (extensible)
- ✅ **Host Component** - `McpProxyHost` for embedding MCP Apps

## Quick Start

### React (Simplest)

```tsx
import { useMcpApp } from 'mcp-app-view/react';

function MyMcpApp() {
  const { isInitialized, state, tool, updateState, sendMessage } = useMcpApp({
    initialState: { counter: 0 },
  });

  if (!isInitialized) return <div>Connecting...</div>;
  if (tool.isStreaming) return <div>Processing: {tool.name}...</div>;

  return (
    <div>
      <h1>Counter: {state.counter}</h1>
      <button onClick={() => updateState({ counter: state.counter + 1 })}>
        Increment
      </button>
      <button onClick={() => sendMessage([{ type: 'text', text: 'Hello!' }])}>
        Send Message
      </button>
    </div>
  );
}
```

### Framework Agnostic

```ts
import { McpAppClient } from 'mcp-app-view';

const client = new McpAppClient({ debug: true });

// Subscribe to events
client.on('initialize', (params) => {
  console.log('Host:', params.appInfo);
  console.log('Context:', params.hostContext);
});

client.on('toolInput', (params) => {
  console.log('Tool:', params.tool.name);
  console.log('Args:', params.arguments);
});

client.on('toolResult', (params) => {
  console.log('Result:', params.result);
});

// Start the client
client.start();

// Send messages to host
await client.sendMessage([{ type: 'text', text: 'Hello from MCP App!' }]);

// Call tools on the host
const result = await client.callTool('get_weather', { location: 'NYC' });

// Report size changes
client.reportSize(400, 300);
```

---

## Using with BotDojo

[BotDojo](https://botdojo.com) is a platform for building AI agents with rich tool capabilities. When using `mcp-app-view` with BotDojo, you get additional features:

### Persistent State

BotDojo automatically persists your MCP App state across sessions. Use the `botdojo/messageType: 'persist-state'` extension:

```tsx
import { useMcpApp } from 'mcp-app-view/react';

function MyApp() {
  const { state, sendMessage } = useMcpApp({
    initialState: { counter: 0 },
  });

  const persistCounter = async (newValue: number) => {
    // BotDojo will persist this state and hydrate it on next load
    await sendMessage([{
      type: 'text',
      text: JSON.stringify({ counter: newValue }),
      'botdojo/messageType': 'persist-state',
    }]);
  };

  return (
    <button onClick={() => persistCounter(state.counter + 1)}>
      Count: {state.counter}
    </button>
  );
}
```

### Tool Streaming

BotDojo provides real-time tool argument streaming via `ui/notifications/tool-input-partial`:

```tsx
import { useMcpApp } from 'mcp-app-view/react';

function StreamingApp() {
  const { tool } = useMcpApp();

  // BotDojo streams tool arguments in real-time
  if (tool.isStreaming) {
    return (
      <div>
        <h2>Running: {tool.name}</h2>
        <p>Step: {tool.arguments?.stepId}</p>
        <p>Progress: {tool.arguments?.progress}%</p>
      </div>
    );
  }

  return <div>Result: {JSON.stringify(tool.result)}</div>;
}
```

### BotDojo State Provider

For full integration, use the BotDojo state provider (available in `@botdojo/sdk`):

```tsx
import { useMcpApp } from 'mcp-app-view/react';
import { BotDojoStateProvider } from '@botdojo/sdk';

function MyApp() {
  const { state, updateState } = useMcpApp({
    initialState: { counter: 0 },
    // BotDojo provider handles persistence automatically
    stateProvider: new BotDojoStateProvider({ canvasId: 'my-app' }),
  });

  return <div>{state.counter}</div>;
}
```

### Hosting MCP Apps in BotDojo

Use `McpProxyHost` to embed MCP Apps in your BotDojo-powered application:

```tsx
import { McpProxyHost } from 'mcp-app-view/host';

function MyHost() {
  return (
    <McpProxyHost
      proxyUrl="https://your-proxy.botdojo.com"
      appUrl="https://your-mcp-app.com"
      hostContext={{
        theme: 'dark',
        // BotDojo passes persisted state here
        state: persistedState,
      }}
      onMessage={async (params) => {
        // Handle messages, including persist-state
        const content = params.content[0];
        if (content['botdojo/messageType'] === 'persist-state') {
          await persistState(JSON.parse(content.text));
        }
      }}
      onToolCall={async (name, args) => {
        // Execute tools via BotDojo
        return await botdojo.callTool(name, args);
      }}
    />
  );
}
```

---

## API Reference

### Framework-Agnostic (Core)

#### `McpAppClient`

The main client for MCP Apps communication.

```ts
import { McpAppClient } from 'mcp-app-view';

const client = new McpAppClient({
  debug: false,           // Enable debug logging
  autoAcknowledge: true,  // Auto-send ui/notifications/initialized
});

// Lifecycle
client.start();
client.stop();

// State
client.isInitialized;
client.state.appInfo;
client.state.hostCapabilities;
client.state.hostContext;
client.state.tool;

// Events
client.on('initialize', (params) => {});
client.on('toolInputPartial', (params) => {});
client.on('toolInput', (params) => {});
client.on('toolResult', (params) => {});
client.on('hostContextChanged', (context) => {});
client.on('resourceTeardown', () => {});

// Actions
await client.sendMessage(content);
await client.openLink(url);
await client.callTool(name, args);
client.reportSize(width, height);
```

#### State Providers

Pluggable state management system.

```ts
import { createMemoryStateProvider, MemoryStateProvider } from 'mcp-app-view';

// Functional
const provider = createMemoryStateProvider({ counter: 0 });

// Class-based
const provider = new MemoryStateProvider({ counter: 0 });

// API
provider.getState();
provider.setState(newState);
provider.updateState(patch);
provider.subscribe((state, prevState) => {});
provider.reset();
provider.dispose();
```

### React

#### `useMcpApp`

High-level convenience hook.

```tsx
import { useMcpApp } from 'mcp-app-view/react';

function MyApp() {
  const {
    // Connection
    isInitialized,
    appInfo,
    hostCapabilities,
    hostContext,
    
    // Tool state
    tool, // { name, arguments, result, status, isStreaming }
    
    // State management
    state,
    updateState,
    setState,
    
    // Actions
    sendMessage,
    openLink,
    callTool,
    reportSize,
    
    // Utilities
    getArgumentValue,
    client,
  } = useMcpApp({
    initialState: { counter: 0 },
    debug: false,
    containerRef, // For auto size reporting
    autoReportSize: true,
  });
}
```

#### `useMcpProtocol`

Low-level protocol access.

```tsx
import { useMcpProtocol } from 'mcp-app-view/react';

function AdvancedApp() {
  const {
    isInitialized,
    parentOrigin,
    appInfo,
    hostCapabilities,
    hostContext,
    
    // Raw messaging
    sendRequest,
    sendNotification,
    sendResponse,
    sendError,
    
    // Event subscriptions
    onInitialize,
    onToolInputPartial,
    onToolInput,
    onToolResult,
    onHostContextChanged,
    onResourceTeardown,
  } = useMcpProtocol({ debug: true });
}
```

#### `useMcpToolStream`

Fine-grained tool streaming state.

```tsx
import { useMcpToolStream } from 'mcp-app-view/react';

function StreamingApp() {
  const {
    name,
    arguments,
    partialArguments,
    result,
    status, // 'idle' | 'streaming' | 'complete' | 'error' | 'teardown'
    isStreaming,
    getArgumentValue,
    reset,
  } = useMcpToolStream();
}
```

#### `McpApp` & `McpAppProvider`

Component wrappers.

```tsx
import { McpApp, McpAppProvider, useMcpAppContext } from 'mcp-app-view/react';

// Simple wrapper
function App() {
  return (
    <McpApp initialState={{ counter: 0 }}>
      <MyWidget />
    </McpApp>
  );
}

// Provider pattern
function App() {
  return (
    <McpAppProvider
      initialState={{ counter: 0 }}
      onInitialize={(ctx) => console.log('Ready!')}
      onToolResult={(result) => console.log('Done!')}
    >
      <MyWidget />
    </McpAppProvider>
  );
}

function MyWidget() {
  const { state, updateState } = useMcpAppContext();
  return <div>{state.counter}</div>;
}
```

### Host Component

#### `McpProxyHost`

Embed MCP Apps in your React application.

```tsx
import { McpProxyHost, McpProxyHostRef } from 'mcp-app-view/host';

function MyHost() {
  const hostRef = useRef<McpProxyHostRef>(null);

  const handleToolCall = async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_data') {
      return { data: 'Hello from host!' };
    }
    throw new Error(`Unknown tool: ${name}`);
  };

  // Send updates to the app
  useEffect(() => {
    hostRef.current?.sendToolInput({
      tool: { name: 'process_data' },
      arguments: { step: 1 },
    });
  }, []);

  return (
    <McpProxyHost
      ref={hostRef}
      proxyUrl="https://proxy.example.com"
      appUrl="https://my-mcp-app.example.com"
      appInfo={{ name: 'My Host', version: '1.0.0' }}
      hostCapabilities={{ openLinks: {} }}
      hostContext={{ theme: 'dark' }}
      onMessage={async (params) => {
        console.log('Message from app:', params.content);
      }}
      onToolCall={handleToolCall}
      onSizeChange={(size) => {
        console.log('App size:', size);
      }}
    />
  );
}
```

## SEP-1865 Protocol

This SDK implements the [SEP-1865 MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx).

### Host → App Messages

| Method | Type | Description |
|--------|------|-------------|
| `ui/initialize` | Request | Initialize the app |
| `ui/notifications/tool-input-partial` | Notification | Streaming tool args |
| `ui/notifications/tool-input` | Notification | Final tool args |
| `ui/notifications/tool-result` | Notification | Tool result |
| `ui/tool-cancelled` | Notification | Tool cancelled |
| `ui/notifications/host-context-changed` | Notification | Context update |
| `ui/resource-teardown` | Notification | Cleanup |

### App → Host Messages

| Method | Type | Description |
|--------|------|-------------|
| `ui/notifications/initialized` | Notification | App ready |
| `ui/notifications/size-change` | Notification | Size change |
| `ui/open-link` | Request | Open URL |
| `ui/message` | Request | Send message |
| `tools/call` | Request | Call tool |

## Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md).

## About BotDojo

[BotDojo](https://botdojo.com) is a platform for building, running, and integrating AI agents. We created this SDK to help developers build rich interactive experiences with MCP.

- 🌐 [Website](https://botdojo.com)
- 📖 [Documentation](https://docs.botdojo.com)
- 💬 [Discord](https://discord.gg/botdojo)
- 🐦 [Twitter](https://twitter.com/botdojo)

## License

MIT © [BotDojo](https://botdojo.com)
