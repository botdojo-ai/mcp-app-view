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
  /** Final tool arguments from the LLM (set by tool-input) */
  arguments: Record<string, unknown> | null;
  /** Latest partial update from tool-input-partial (progress notifications from tool execution) */
  partialUpdate: Record<string, unknown> | null;
  /** Tool progress updates (from notifyToolInputPartial with kind: 'botdojo-tool-progress') */
  toolProgress: Record<string, unknown> | null;
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
  /** Callback when tool input partial (progress) is received */
  onToolInputPartial?: (params: { tool: { name: string }; arguments: Record<string, unknown> }) => void;
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
  getPartialUpdateValue: <T>(key: string, fallback?: T) => T | undefined;
  getToolProgressValue: <T>(key: string, fallback?: T) => T | undefined;
  
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
    onToolInputPartial,
  } = options;
  
  // Create stable client ref and start IMMEDIATELY to not miss messages
  const clientRef = useRef<McpAppClient | null>(null);
  
  if (!clientRef.current) {
    clientRef.current = new McpAppClient({ debug });
    // Start listening immediately - don't wait for useEffect!
    // This prevents race condition where host sends messages before listener is ready
    clientRef.current.start();
  }
  
  const client = clientRef.current;
  
  // Use ref for callback to avoid stale closures
  const onToolInputPartialRef = useRef(onToolInputPartial);
  onToolInputPartialRef.current = onToolInputPartial;
  
  // React state
  const [isInitialized, setIsInitialized] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [hostCapabilities, setHostCapabilities] = useState<HostCapabilities | null>(null);
  const [hostContext, setHostContext] = useState<HostContext | null>(null);
  const [tool, setTool] = useState<ToolState>({
    name: null,
    arguments: null,
    partialUpdate: null,
    toolProgress: null,
    result: null,
    status: 'idle',
    isStreaming: false,
  });
  
  // Setup client event handlers
  useEffect(() => {
    if (!client) return;
    
    // Register handlers FIRST, then sync any state that arrived before
    // This ensures no messages are lost in the gap between sync and handler registration
    
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
      // tool-input-partial is used for both:
      // 1. LLM argument streaming (partial JSON as model types) - goes to partialUpdate
      // 2. Tool progress notifications (kind: 'botdojo-tool-progress') - handled via callback
      const isProgressUpdate = params.arguments?.kind === 'botdojo-tool-progress' || 
                               params.arguments?._botdojoProgress === true;
      
      // Call user callback if provided (for progress updates)
      onToolInputPartialRef.current?.(params);
      
      if (isProgressUpdate) {
        // Progress update - store in toolProgress
        // IMPORTANT: Don't regress state if tool already completed
        setTool(prev => {
          if (prev.status === 'complete') {
            // Tool already completed - just update progress, don't change streaming state
            return {
              ...prev,
              toolProgress: params.arguments,
            };
          }
          return {
            ...prev,
            name: params.tool.name,
            toolProgress: params.arguments,
            status: 'streaming',
            isStreaming: true,
          };
        });
      } else {
        // LLM argument streaming - store in partialUpdate
        // IMPORTANT: Don't regress state if tool already completed
        setTool(prev => {
          if (prev.status === 'complete') {
            // Tool already completed - just update partial, don't change streaming state
            return {
              ...prev,
              partialUpdate: params.arguments,
            };
          }
          return {
            ...prev,
            name: params.tool.name,
            partialUpdate: params.arguments,
            status: 'streaming',
            isStreaming: true,
          };
        });
      }
    });
    
    const unsubToolInput = client.on('toolInput', (params) => {
      // Final tool arguments from the LLM - clear partialUpdate as argument streaming is done
      // Keep toolProgress as tool may still send progress updates during execution
      // IMPORTANT: Don't clear result or set streaming if tool already completed (race condition fix)
      setTool(prev => {
        // If tool already completed, don't regress state - just update arguments
        if (prev.status === 'complete') {
          return {
            ...prev,
            name: params.tool.name,
            arguments: params.arguments,
            partialUpdate: null,
            // Keep result, status, and isStreaming as-is
          };
        }
        // Normal case: tool is still in progress
        return {
          ...prev,
          name: params.tool.name,
          arguments: params.arguments,
          partialUpdate: null,
          result: null,
          status: 'streaming',
          isStreaming: true,
        };
      });
    });
    
    const unsubToolResult = client.on('toolResult', (params) => {
      // Tool completed - clear toolProgress as execution is done
      setTool(prev => ({
        ...prev,
        name: params.tool.name,
        result: params.result,
        toolProgress: null,
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
    
    // NOW sync any state that arrived before handlers were set up
    // This must happen AFTER handlers are registered to avoid missing messages
    // that arrive between sync and handler registration
    const currentState = client.state;
    if (currentState.isInitialized) {
      setIsInitialized(true);
      setAppInfo(currentState.appInfo);
      setHostCapabilities(currentState.hostCapabilities);
      setHostContext(currentState.hostContext);
      if (currentState.tool.name || currentState.tool.arguments) {
        setTool({
          name: currentState.tool.name,
          arguments: currentState.tool.arguments,
          partialUpdate: null,
          toolProgress: null,
          result: currentState.tool.result,
          isStreaming: currentState.tool.isStreaming,
          status: currentState.tool.isStreaming ? 'streaming' : (currentState.tool.result ? 'complete' : 'idle'),
        });
      }
    }
    
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
  
  const getPartialUpdateValue = useCallback(<T,>(key: string, fallback?: T): T | undefined => {
    const value = tool.partialUpdate?.[key];
    return (value as T | undefined) ?? fallback;
  }, [tool.partialUpdate]);
  
  const getToolProgressValue = useCallback(<T,>(key: string, fallback?: T): T | undefined => {
    const value = tool.toolProgress?.[key];
    return (value as T | undefined) ?? fallback;
  }, [tool.toolProgress]);
  
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
    getPartialUpdateValue,
    getToolProgressValue,
    client,
  };
}
