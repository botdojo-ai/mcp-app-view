/**
 * McpApp - Simple wrapper component for MCP Apps
 * The easiest way to build MCP Apps with React
 */

import React, { useRef, type ReactNode, type CSSProperties } from 'react';
import { McpAppProvider, type McpAppProviderProps } from './McpAppContext';

export interface McpAppProps extends Omit<McpAppProviderProps, 'children'> {
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
 *     <McpApp>
 *       <CounterUI />
 *     </McpApp>
 *   );
 * }
 * 
 * function CounterUI() {
 *   const { hostContext, tool } = useMcpAppContext();
 *   
 *   // State comes from hostContext
 *   const counter = hostContext?.state?.counter ?? 0;
 *   
 *   if (tool.isStreaming) return <div>Loading...</div>;
 *   
 *   return (
 *     <div>
 *       <h1>{counter}</h1>
 *     </div>
 *   );
 * }
 * ```
 */
export function McpApp({
  children,
  className,
  style,
  autoReportSize = true,
  clientOptions,
  onInitialize,
  onToolInput,
  onToolInputPartial,
  onToolResult,
  onHostContextChanged,
  onTeardown,
}: McpAppProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Auto size reporting via ResizeObserver
  React.useEffect(() => {
    if (!autoReportSize || !containerRef.current) return;
    
    // We'll report size via the provider's client
    // This is handled inside the provider via hostContext updates
  }, [autoReportSize]);
  
  return (
    <McpAppProvider
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
