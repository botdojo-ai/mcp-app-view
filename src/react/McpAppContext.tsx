/**
 * McpAppContext - React Context for MCP Apps
 * 
 * For most use cases, prefer useMcpApp hook instead.
 * This context is useful when you need to share MCP App state across multiple components.
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { McpAppClient, type McpAppClientOptions } from '../protocol/client';
import type {
  AppInfo,
  HostCapabilities,
  HostContext,
  MessageContent,
  ToolInputPartialParams,
  ToolInputParams,
  ToolResultParams,
} from '../protocol/types';

// =============================================================================
// Context Value Types
// =============================================================================

export interface McpAppContextValue {
  // Client
  client: McpAppClient;
  
  // Connection state
  isInitialized: boolean;
  appInfo: AppInfo | null;
  hostCapabilities: HostCapabilities | null;
  hostContext: HostContext | null;
  
  // Tool state
  tool: {
    name: string | null;
    arguments: Record<string, unknown> | null;
    result: unknown | null;
    isStreaming: boolean;
  };
  
  // Actions
  sendMessage: (content: MessageContent[]) => Promise<void>;
  openLink: (url: string) => Promise<void>;
  callTool: <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<T>;
  reportSize: (width: number, height: number) => void;
}

// =============================================================================
// Context
// =============================================================================

const McpAppContext = createContext<McpAppContextValue | null>(null);

// =============================================================================
// Provider Props
// =============================================================================

export interface McpAppProviderProps {
  children: ReactNode;
  /** Client options */
  clientOptions?: McpAppClientOptions;
  /** Called when initialized with host context */
  onInitialize?: (context: HostContext) => void;
  /** Called when tool streaming starts */
  onToolInput?: (params: ToolInputParams) => void;
  /** Called during tool argument streaming */
  onToolInputPartial?: (params: ToolInputPartialParams) => void;
  /** Called when tool completes */
  onToolResult?: (params: ToolResultParams) => void;
  /** Called when host context changes */
  onHostContextChanged?: (context: HostContext) => void;
  /** Called on teardown */
  onTeardown?: () => void;
}

// =============================================================================
// Provider Component
// =============================================================================

export function McpAppProvider({
  children,
  clientOptions = {},
  onInitialize,
  onToolInput,
  onToolInputPartial,
  onToolResult,
  onHostContextChanged,
  onTeardown,
}: McpAppProviderProps) {
  const clientRef = useRef<McpAppClient | null>(null);
  
  if (!clientRef.current) {
    clientRef.current = new McpAppClient(clientOptions);
  }
  
  const client = clientRef.current;
  
  // React state
  const [isInitialized, setIsInitialized] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [hostCapabilities, setHostCapabilities] = useState<HostCapabilities | null>(null);
  const [hostContext, setHostContext] = useState<HostContext | null>(null);
  const [tool, setTool] = useState({
    name: null as string | null,
    arguments: null as Record<string, unknown> | null,
    result: null as unknown,
    isStreaming: false,
  });
  
  // Setup event handlers
  useEffect(() => {
    if (!client) return;
    
    const unsubInit = client.on('initialize', (params) => {
      setIsInitialized(true);
      setAppInfo(params.appInfo);
      setHostCapabilities(params.hostCapabilities);
      setHostContext(params.hostContext);
      onInitialize?.(params.hostContext);
    });
    
    const unsubToolInputPartial = client.on('toolInputPartial', (params) => {
      setTool(prev => ({
        name: params.tool.name,
        arguments: { ...prev.arguments, ...params.arguments },
        result: null,
        isStreaming: true,
      }));
      onToolInputPartial?.(params);
    });
    
    const unsubToolInput = client.on('toolInput', (params) => {
      setTool({
        name: params.tool.name,
        arguments: params.arguments,
        result: null,
        isStreaming: true,
      });
      onToolInput?.(params);
    });
    
    const unsubToolResult = client.on('toolResult', (params) => {
      setTool(prev => ({
        ...prev,
        name: params.tool.name,
        result: params.result,
        isStreaming: false,
      }));
      onToolResult?.(params);
    });
    
    const unsubContextChanged = client.on('hostContextChanged', (params) => {
      setHostContext(prev => ({ ...prev, ...params }));
      onHostContextChanged?.(params);
    });
    
    const unsubTeardown = client.on('resourceTeardown', () => {
      onTeardown?.();
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
  }, [client, onInitialize, onToolInput, onToolInputPartial, onToolResult, onHostContextChanged, onTeardown]);
  
  // Build context value
  const contextValue: McpAppContextValue = {
    client,
    isInitialized,
    appInfo,
    hostCapabilities,
    hostContext,
    tool,
    sendMessage: (content) => client.sendMessage(content),
    openLink: (url) => client.openLink(url),
    callTool: (name, args) => client.callTool(name, args),
    reportSize: (width, height) => client.reportSize(width, height),
  };
  
  return (
    <McpAppContext.Provider value={contextValue}>
      {children}
    </McpAppContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access MCP App context
 * Must be used within McpAppProvider
 */
export function useMcpAppContext(): McpAppContextValue {
  const context = useContext(McpAppContext);
  if (!context) {
    throw new Error('useMcpAppContext must be used within McpAppProvider');
  }
  return context;
}
