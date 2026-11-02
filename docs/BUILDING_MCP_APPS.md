# Building MCP Apps

This guide covers how to build MCP Apps using the `useMcpApp` hook from `@botdojo/chat-sdk/mcp-app-view/react`.

## Quick Start

```typescript
import { useRef } from 'react';
import { useMcpApp } from '@botdojo/chat-sdk/mcp-app-view/react';

function MyMcpApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const {
    isInitialized,
    tool,
    hostContext,
    callTool,
    reportSize,
  } = useMcpApp({
    containerRef,
    autoReportSize: true,
  });

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <div ref={containerRef}>
      <h2>Result: {JSON.stringify(tool.result)}</h2>
    </div>
  );
}
```

## useMcpApp Hook Reference

### Options

```typescript
interface UseMcpAppOptions {
  containerRef?: RefObject<HTMLElement>;
  autoReportSize?: boolean;
  debug?: boolean;
  onToolInputPartial?: (params: ToolInputPartialParams) => void;
}
```

| Option | Type | Description |
|--------|------|-------------|
| `containerRef` | `RefObject<HTMLElement>` | Optional reference to the container element for size reporting |
| `autoReportSize` | `boolean` | Automatically report size on load (default: true if containerRef provided, else false) |
| `debug` | `boolean` | Enable debug logging (default: false) |
| `onToolInputPartial` | `function` | Callback for streaming tool arguments |

### Return Values

```typescript
interface UseMcpAppReturn {
  // Connection state
  isInitialized: boolean;
  
  // Host info
  appInfo: AppInfo | null;
  hostCapabilities: HostCapabilities | null;
  hostContext: HostContext | null;
  
  // Tool state
  tool: {
    name: string | null;
    arguments: unknown;
    result: unknown;
    isStreaming: boolean;
    status: ToolStatus;
  };
  
  // Actions
  sendMessage: (content: MessageContent[]) => Promise<void>;
  openLink: (url: string) => Promise<void>;
  callTool: <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<T>;
  reportSize: (width: number, height: number) => void;
  
  // Utilities
  getArgumentValue: <T>(key: string, fallback?: T) => T | undefined;
  getPartialUpdateValue: <T>(key: string, fallback?: T) => T | undefined;
  
  // Raw client access
  client: McpAppClient;
}
```

| Property | Description |
|----------|-------------|
| `isInitialized` | True when the MCP connection is established |
| `appInfo` | Information about the MCP App |
| `hostCapabilities` | Capabilities supported by the host |
| `hostContext` | Context from the host including session info and persisted state |
| `tool.name` | Name of the tool being executed |
| `tool.arguments` | Tool arguments (streaming or final) |
| `tool.result` | Final result from tool execution |
| `tool.isStreaming` | True while receiving streaming updates |
| `tool.status` | Current status: `'idle'` \| `'streaming'` \| `'complete'` \| `'error'` \| `'teardown'` |
| `sendMessage` | Send a message to the host |
| `openLink` | Open a link in the host context |
| `callTool` | Function to call tools defined in the host |
| `getArgumentValue` | Get a value from tool arguments with type safety |
| `getPartialUpdateValue` | Get a value from partial streaming updates |
| `client` | Low-level MCP client for advanced use |
| `reportSize` | Report container dimensions to the host |

## Tool Status Lifecycle

```
┌──────────┐     Tool starts     ┌───────────┐     Result received     ┌──────────┐
│   idle   │ ─────────────────► │ streaming │ ─────────────────────► │ complete │
└──────────┘                     └───────────┘                        └──────────┘
     ▲                                │                                     │
     │                                │                                     │
     │                          Error occurs                                │
     │                                │                                     │
     │                                ▼                                     │
     │                          ┌─────────┐                                 │
     └────────────────────────  │  error  │ ◄───────────────────────────────┘
                                └─────────┘
```

- **idle**: Initial state before tool execution begins
- **streaming**: Receiving partial tool arguments
- **complete**: Tool execution finished successfully
- **error**: An error occurred during execution

## Streaming Tool Arguments

Use `onToolInputPartial` to receive streaming updates:

```typescript
const [streamingText, setStreamingText] = useState('');

const { tool } = useMcpApp({
  containerRef,
  onToolInputPartial: (params) => {
    const args = params.arguments as Record<string, unknown>;
    
    // Handle streaming text
    if (typeof args.content === 'string') {
      setStreamingText(args.content);
    }
  },
});

// Display streaming content while active, final result when complete
const displayText = tool.isStreaming ? streamingText : tool.result?.content;
```

## Detecting Tool Completion

Use `tool.result` to detect when the tool finishes:

```typescript
useEffect(() => {
  if (tool.result) {
    // Tool execution completed - show final UI
    setShowComparison(true);
  }
}, [tool.result]);
```

## Calling Host Tools

MCP Apps can call tools defined in the host's ModelContext:

```typescript
const { callTool } = useMcpApp({ ... });

const handleApply = async () => {
  try {
    const result = await callTool('updateDocument', {
      content: newContent
    });
    console.log('Applied:', result);
  } catch (error) {
    console.error('Failed to apply:', error);
  }
};
```

## Size Reporting

MCP Apps run in iframes. The host needs to know the content size to resize the iframe properly.

### Automatic Size Reporting

```typescript
const { } = useMcpApp({
  containerRef,
  autoReportSize: true,  // Reports size on initial load
});
```

### Manual Size Reporting

For dynamic content, report size when content changes:

```typescript
const { reportSize } = useMcpApp({ containerRef });

const updateSize = useCallback(() => {
  if (!containerRef.current) return;
  const rect = containerRef.current.getBoundingClientRect();
  reportSize(Math.ceil(rect.width), Math.ceil(rect.height));
}, [reportSize]);

// Report on content changes
useEffect(() => {
  updateSize();
}, [content, updateSize]);

// Use ResizeObserver for responsive layouts
useEffect(() => {
  if (!containerRef.current) return;
  
  const observer = new ResizeObserver(updateSize);
  observer.observe(containerRef.current);
  
  return () => observer.disconnect();
}, [updateSize]);
```

## State Persistence

### Saving State

Use `sendMessage` with `botdojo/persist` content type to save state across page reloads:

```typescript
const { sendMessage } = useMcpApp({ ... });

const saveState = async (state: object) => {
  await sendMessage([{
    type: 'text',
    text: '', // Empty text is fine
    // BotDojo extension for state persistence
    'botdojo/persist': true,
    // State is passed via content object
  }]);
  
  // Alternatively, use the client directly for more control
  // await client.sendRequest('ui/message', {
  //   role: 'user',
  //   content: [{
  //     type: 'botdojo/persist',
  //     state
  //   }]
  // });
};

// Example: Save when user makes a selection
const handleSelect = async (option: string) => {
  setSelected(option);
  await saveState({ selected: option, timestamp: Date.now() });
};
```

**Note**: BotDojo's implementation expects `ui/message` with content array containing objects with `type: 'botdojo/persist'` and `state` property. The `sendMessage` helper simplifies this.

### Restoring State

Access persisted state via `hostContext.state`:

```typescript
const { hostContext } = useMcpApp({ ... });

useEffect(() => {
  const state = hostContext?.state as Record<string, unknown> | undefined;
  if (state?.selected) {
    setSelected(state.selected as string);
  }
}, [hostContext?.state]);
```

The host automatically hydrates persisted state when the MCP App remounts.

## Complete Example

See the product enhancement example in the playground:

**Files:**
- Host page: `sdk-playground/pages/examples/product-enhance/index.tsx`
- MCP App: `sdk-playground/pages/examples/product-enhance/widgets/enhance-mcp-app.tsx`

**Key patterns demonstrated:**
- Streaming text preview
- Transition from streaming to comparison view
- Calling host tools to apply changes
- Persisting applied state
- Dynamic size reporting



## Expose frontend tools in a BotDojo Workspace

A Workspace-hosted app can use `registerFrontendMcp` from
`@botdojo/chat-sdk/frontend-mcp` (or `mcp-app-view/frontend`).
Define tools using the existing frontend `ModelContext` shape: `name`,
`description`, `inputSchema`, and local `execute` functions. Only metadata crosses
into the host. Tools operate against the live iframe and are removed on teardown.

Single-file HTML imports the SDK's standalone build from a pinned URL,
`https://cdn.jsdelivr.net/npm/@botdojo/chat-sdk@0.0.31/lib/frontend-mcp/index.js`.
Workspace previews allow that exact URL; an MCP app resource that imports it lists it
in `_meta.ui.csp.resourceDomains`. No API token or embedded chat is required. If using an existing `McpAppClient`,
pass `{ client }` as the registration function's second argument to share its
transport. Wait for registration acknowledgement before showing a ready state.

See the task-board example in the BotDojo SDK Playground and the API & SDK guide
at `https://docs.botdojo.com/docs/api-sdk/workspace-app-tools` for the complete
contract. This is a negotiated BotDojo extension; other MCP App hosts can report
that frontend MCP registration is unavailable.
