/**
 * McpApp - Simple wrapper component for MCP Apps
 * The easiest way to build MCP Apps with React
 */

import React, { useRef, type ReactNode, type CSSProperties } from 'react';
import { McpAppProvider, type McpAppProviderProps } from './McpAppContext';

export interface McpAppProps<TState = unknown> extends Omit<McpAppProviderProps<TState>, 'children'> {
  children: ReactNode;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
  /** Enable auto size reporting (default: true) */
  autoReportSize?: boolean;
}

/**
 * McpApp - Wrapper component for MCP Apps
 * Handles all setup automatically
 * 
 * @example
 * ```tsx
 * export default function MyWidget() {
 *   return (
 *     <McpApp initialState={{ counter: 0 }}>
 *       <CounterUI />
 *     </McpApp>
 *   );
 * }
 * 
 * function CounterUI() {
 *   const { state, updateState, tool } = useMcpApp<{ counter: number }>();
 *   
 *   if (tool.isStreaming) return <div>Loading...</div>;
 *   
 *   return (
 *     <div>
 *       <h1>{state.counter}</h1>
 *       <button onClick={() => updateState({ counter: state.counter + 1 })}>
 *         +
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function McpApp<TState = unknown>({
  children,
  className,
  style,
  autoReportSize = true,
  initialState,
  stateProvider,
  clientOptions,
  onInitialize,
  onToolInput,
  onToolInputPartial,
  onToolResult,
  onHostContextChanged,
  onTeardown,
}: McpAppProps<TState>) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Auto size reporting via ResizeObserver
  React.useEffect(() => {
    if (!autoReportSize || !containerRef.current) return;
    
    // We'll report size via the provider's client
    // This is handled inside the provider via hostContext updates
  }, [autoReportSize]);
  
  return (
    <McpAppProvider
      initialState={initialState}
      stateProvider={stateProvider}
      clientOptions={clientOptions}
      onInitialize={onInitialize}
      onToolInput={onToolInput}
      onToolInputPartial={onToolInputPartial}
      onToolResult={onToolResult}
      onHostContextChanged={onHostContextChanged}
      onTeardown={onTeardown}
    >
      <div ref={containerRef} className={className} style={style}>
        {children}
      </div>
    </McpAppProvider>
  );
}

