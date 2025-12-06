/**
 * useMcpApp - High-level convenience hook for MCP Apps
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { McpAppClient } from '../protocol/client';
import type {
  AppInfo,
  HostCapabilities,
  HostContext,
  MessageContent,
} from '../protocol/types';

// =============================================================================
// Types
// =============================================================================

export type ToolStatus = 'idle' | 'streaming' | 'complete' | 'error' | 'teardown';

export interface ToolState {
  name: string | null;
  arguments: Record<string, unknown> | null;
  result: unknown | null;
  status: ToolStatus;
  isStreaming: boolean;
}

export interface UseMcpAppOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Ref to container for auto size reporting */
  containerRef?: React.RefObject<HTMLElement>;
  /** Enable auto size reporting (default: true if containerRef provided) */
  autoReportSize?: boolean;
}

export interface UseMcpAppReturn {
  // Connection state
  isInitialized: boolean;
  
  // Host info
  appInfo: AppInfo | null;
  hostCapabilities: HostCapabilities | null;
  hostContext: HostContext | null;
  
  // Tool state
  tool: ToolState;
  
  // Actions
  sendMessage: (content: MessageContent[]) => Promise<void>;
  openLink: (url: string) => Promise<void>;
  callTool: <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<T>;
  reportSize: (width: number, height: number) => void;
  
  // Utilities
  getArgumentValue: <T>(key: string, fallback?: T) => T | undefined;
  
  // Raw client access
  client: McpAppClient;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * High-level hook for MCP Apps
 * 
 * State comes from hostContext.state - read it directly from there.
 * 
 * @example
 * ```tsx
 * function MyApp() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   
 *   const {
 *     isInitialized,
 *     hostContext,
 *     tool,
 *     sendMessage,
 *   } = useMcpApp({ containerRef });
 *   
 *   if (!isInitialized) return <div>Loading...</div>;
 *   
 *   // Read state from hostContext
 *   const counter = hostContext?.state?.counter ?? 0;
 *   
 *   return (
 *     <div ref={containerRef}>
 *       <h1>Counter: {counter}</h1>
 *     </div>
 *   );
 * }
 * ```
 */
export function useMcpApp(options: UseMcpAppOptions = {}): UseMcpAppReturn {
  const {
    debug = false,
    containerRef,
    autoReportSize = !!containerRef,
  } = options;
  
  // Create stable client ref
  const clientRef = useRef<McpAppClient | null>(null);
  
  if (!clientRef.current) {
    clientRef.current = new McpAppClient({ debug });
  }
  
  const client = clientRef.current;
  
  // React state
  const [isInitialized, setIsInitialized] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [hostCapabilities, setHostCapabilities] = useState<HostCapabilities | null>(null);
  const [hostContext, setHostContext] = useState<HostContext | null>(null);
  const [tool, setTool] = useState<ToolState>({
    name: null,
    arguments: null,
    result: null,
    status: 'idle',
    isStreaming: false,
  });
  
  // Setup client event handlers
  useEffect(() => {
    if (!client) return;
    
    const unsubInit = client.on('initialize', (params) => {
      setIsInitialized(true);
      setAppInfo(params.appInfo);
      setHostCapabilities(params.hostCapabilities);
      setHostContext(params.hostContext);
      
      const toolInfo = params.hostContext?.toolInfo;
      if (toolInfo?.tool?.name) {
        setTool(prev => ({
          ...prev,
          name: toolInfo.tool.name,
        }));
      }
    });
    
    const unsubToolInputPartial = client.on('toolInputPartial', (params) => {
      setTool(prev => ({
        name: params.tool.name,
        arguments: { ...prev.arguments, ...params.arguments },
        result: null,
        status: 'streaming',
        isStreaming: true,
      }));
    });
    
    const unsubToolInput = client.on('toolInput', (params) => {
      setTool({
        name: params.tool.name,
        arguments: params.arguments,
        result: null,
        status: 'streaming',
        isStreaming: true,
      });
    });
    
    const unsubToolResult = client.on('toolResult', (params) => {
      setTool(prev => ({
        ...prev,
        name: params.tool.name,
        result: params.result,
        status: 'complete',
        isStreaming: false,
      }));
    });
    
    const unsubContextChanged = client.on('hostContextChanged', (params) => {
      setHostContext(prev => ({ ...prev, ...params }));
      
      if (params?.toolInfo?.tool?.name) {
        setTool(prev => ({
          ...prev,
          name: params.toolInfo!.tool.name,
        }));
      }
    });
    
    const unsubTeardown = client.on('resourceTeardown', () => {
      setTool(prev => ({
        ...prev,
        status: 'teardown',
        isStreaming: false,
      }));
    });
    
    client.start();
    
    return () => {
      unsubInit();
      unsubToolInputPartial();
      unsubToolInput();
      unsubToolResult();
      unsubContextChanged();
      unsubTeardown();
      client.stop();
    };
  }, [client]);
  
  // Auto size reporting
  useEffect(() => {
    if (!autoReportSize || !containerRef?.current || !client) return;
    
    const reportSize = () => {
      const el = containerRef.current;
      if (!el) return;
      
      const rect = el.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);
      
      if (width > 0 && height > 0) {
        client.reportSize(width, height);
      }
    };
    
    reportSize();
    
    const observer = new ResizeObserver(reportSize);
    observer.observe(containerRef.current);
    
    window.addEventListener('resize', reportSize);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', reportSize);
    };
  }, [autoReportSize, containerRef, client]);
  
  // Actions
  const sendMessage = useCallback(async (content: MessageContent[]) => {
    await client.sendMessage(content);
  }, [client]);
  
  const openLink = useCallback(async (url: string) => {
    await client.openLink(url);
  }, [client]);
  
  const callTool = useCallback(async <T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> => {
    return client.callTool<T>(name, args);
  }, [client]);
  
  const reportSize = useCallback((width: number, height: number) => {
    client.reportSize(width, height);
  }, [client]);
  
  // Utilities
  const getArgumentValue = useCallback(<T,>(key: string, fallback?: T): T | undefined => {
    const value = tool.arguments?.[key];
    return (value as T | undefined) ?? fallback;
  }, [tool.arguments]);
  
  return {
    isInitialized,
    appInfo,
    hostCapabilities,
    hostContext,
    tool,
    sendMessage,
    openLink,
    callTool,
    reportSize,
    getArgumentValue,
    client,
  };
}
