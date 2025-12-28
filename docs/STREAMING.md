# Streaming Guide

How to implement real-time streaming updates in MCP Apps.

## Overview

MCP Apps receive streaming data in two ways:

1. **LLM argument streaming**: As the AI generates tool arguments
2. **Tool execution streaming**: Data sent via `notifyToolInputPartial`

Both are received through the `onToolInputPartial` callback.

## Receiving Streaming Data

```typescript
const [streamingContent, setStreamingContent] = useState('');

const { tool } = useMcpApp({
  containerRef,
  onToolInputPartial: (params) => {
    const args = params.arguments as Record<string, unknown>;
    
    // Handle streaming content
    if (typeof args.content === 'string') {
      setStreamingContent(args.content);
    }
  }
});
```

## Tool Status States

Use `tool.status` to track the streaming lifecycle:

```typescript
const { tool } = useMcpApp({ ... });

// Status values:
// - 'idle': Initial state, no tool execution
// - 'streaming': Receiving partial updates
// - 'complete': Tool execution finished
// - 'error': An error occurred
// - 'teardown': App is being torn down (cleanup state)

const isActive = tool.status === 'streaming';
const isDone = tool.status === 'complete' || tool.status === 'idle' || tool.status === 'teardown';
```

## Streaming vs Final Content

Display streaming content while active, final result when complete:

```typescript
const { tool } = useMcpApp({
  onToolInputPartial: (params) => {
    const args = params.arguments as Record<string, unknown>;
    if (typeof args.text === 'string') {
      setStreamingText(args.text);
    }
  }
});

// Determine what to display
const isStreaming = tool.status === 'streaming';
const displayText = isStreaming 
  ? streamingText 
  : (tool.result as any)?.text || streamingText;
```

## Transitioning from Streaming to Final UI

Use `tool.result` to trigger UI transitions:

```typescript
const [showFinalView, setShowFinalView] = useState(false);

useEffect(() => {
  if (tool.result) {
    // Add a small delay for smooth transition
    setTimeout(() => {
      setShowFinalView(true);
    }, 500);
  }
}, [tool.result]);

return (
  <div>
    {!showFinalView ? (
      <StreamingView text={streamingText} />
    ) : (
      <ComparisonView original={original} enhanced={enhanced} />
    )}
  </div>
);
```

## Sending Streaming Data from Host

In the host's tool execute function:

```typescript
execute: async (params, context) => {
  // Send partial update
  context?.notifyToolInputPartial?.({
    status: 'processing',
    partialContent: 'Working...'
  });
  
  // Do processing...
  
  // Send another update
  context?.notifyToolInputPartial?.({
    status: 'finishing',
    partialContent: 'Almost done...'
  });
  
  // Return final result
  return { 
    content: 'Final result',
    status: 'complete'
  };
}
```

## Handling Multiple Data Sources

Streaming data can come from LLM arguments and tool execution:

```typescript
const [textFromLLM, setTextFromLLM] = useState('');
const [dataFromTool, setDataFromTool] = useState<any>(null);

const { tool } = useMcpApp({
  onToolInputPartial: (params) => {
    const args = params.arguments as Record<string, unknown>;
    
    // LLM streaming arguments
    if (typeof args.enhanced_text === 'string') {
      setTextFromLLM(args.enhanced_text);
    }
    
    // Tool execution streaming (wrapped in a payload)
    if (args.payload) {
      setDataFromTool(args.payload);
    }
  }
});
```

## Progress Indicators

Show progress during streaming:

```typescript
const { tool } = useMcpApp({ ... });

return (
  <div>
    {tool.status === 'streaming' && (
      <div className="streaming-indicator">
        <span className="dot-pulse" />
        AI is generating...
      </div>
    )}
    
    <div className="content">
      {displayText}
    </div>
    
    {tool.status === 'complete' && (
      <button onClick={handleApply}>
        Apply Changes
      </button>
    )}
  </div>
);
```

## Complete Streaming Example

```typescript
function StreamingMcpApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [streamingText, setStreamingText] = useState('');
  const [showComparison, setShowComparison] = useState(false);
  
  const { tool, hostContext, callTool, reportSize } = useMcpApp({
    containerRef,
    autoReportSize: true,
    onToolInputPartial: (params) => {
      const args = params.arguments as Record<string, unknown>;
      if (typeof args.enhanced_text === 'string') {
        setStreamingText(args.enhanced_text);
      }
    }
  });
  
  // Transition to comparison view when complete
  useEffect(() => {
    if (tool.result) {
      setTimeout(() => setShowComparison(true), 500);
    }
  }, [tool.result]);
  
  const isStreaming = tool.status === 'streaming';
  const result = tool.result as { original?: string; enhanced?: string } | null;
  const displayText = isStreaming ? streamingText : result?.enhanced || streamingText;
  
  return (
    <div ref={containerRef} className="mcp-app">
      {!showComparison ? (
        // Streaming view
        <div className="streaming-view">
          {isStreaming && <div className="status">Generating...</div>}
          <div className="text">{displayText}</div>
        </div>
      ) : (
        // Comparison view
        <div className="comparison-view">
          <div className="original">
            <h3>Original</h3>
            <p>{result?.original}</p>
          </div>
          <div className="enhanced">
            <h3>Enhanced</h3>
            <p>{result?.enhanced}</p>
          </div>
          <button onClick={() => callTool('apply', { text: result?.enhanced })}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
```


