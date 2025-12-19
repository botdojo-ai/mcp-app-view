/**
 * useMcpProtocol - Low-level SEP-1865 protocol hook
 * Provides raw access to the MCP Apps protocol
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { McpTransport } from '../protocol/transport';
import {
  McpMethods,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type AppInfo,
  type HostCapabilities,
  type HostContext,
  type UiInitializeParams,
  type ToolInputPartialParams,
  type ToolInputParams,
  type ToolResultParams,
  type MessageContent,
} from '../protocol/types';

export interface UseMcpProtocolOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-acknowledge initialization (default: true) */
  autoAcknowledge?: boolean;
}

export interface UseMcpProtocolReturn {
  // Connection state
  isInitialized: boolean;
  parentOrigin: string;
  appInfo: AppInfo | null;
  hostCapabilities: HostCapabilities | null;
  hostContext: HostContext | null;
  
  // Raw messaging
  sendRequest: (method: string, params?: unknown) => Promise<unknown>;
  sendNotification: (method: string, params?: unknown) => void;
  sendResponse: (id: string | number, result: unknown) => void;
  sendError: (id: string | number, code: number, message: string, data?: unknown) => void;
  
  // Event subscriptions (returns unsubscribe function)
  onInitialize: (handler: (params: UiInitializeParams) => void) => () => void;
  onToolInputPartial: (handler: (params: ToolInputPartialParams) => void) => () => void;
  onToolInput: (handler: (params: ToolInputParams) => void) => () => void;
  onToolResult: (handler: (params: ToolResultParams) => void) => () => void;
  onHostContextChanged: (handler: (params: HostContext) => void) => () => void;
  onResourceTeardown: (handler: () => void) => () => void;
}

type EventHandler<T = void> = (data: T) => void;

/**
 * Low-level hook for MCP Apps protocol
 * Use this when you need full control over the protocol
 */
export function useMcpProtocol(options: UseMcpProtocolOptions = {}): UseMcpProtocolReturn {
  const { debug = false, autoAcknowledge = true } = options;
  
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [hostCapabilities, setHostCapabilities] = useState<HostCapabilities | null>(null);
  const [hostContext, setHostContext] = useState<HostContext | null>(null);
  
  // Refs for stable handlers
  const transportRef = useRef<McpTransport | null>(null);
  const handlersRef = useRef<{
    initialize: Set<EventHandler<UiInitializeParams>>;
    toolInputPartial: Set<EventHandler<ToolInputPartialParams>>;
    toolInput: Set<EventHandler<ToolInputParams>>;
    toolResult: Set<EventHandler<ToolResultParams>>;
    hostContextChanged: Set<EventHandler<HostContext>>;
    resourceTeardown: Set<EventHandler>;
  }>({
    initialize: new Set(),
    toolInputPartial: new Set(),
    toolInput: new Set(),
    toolResult: new Set(),
    hostContextChanged: new Set(),
    resourceTeardown: new Set(),
  });
  
  // Initialize transport
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const transport = new McpTransport({ debug });
    transportRef.current = transport;
    
    const handleMessage = (message: JsonRpcMessage) => {
      if (!('method' in message)) return;
      
      const { method, params, id } = message as JsonRpcRequest;
      
      switch (method) {
        case McpMethods.INITIALIZE: {
          const initParams = params as UiInitializeParams;
          setIsInitialized(true);
          setAppInfo(initParams.appInfo);
          setHostCapabilities(initParams.hostCapabilities);
          setHostContext(initParams.hostContext);
          
          // Respond to request
          if (id !== undefined) {
            transport.sendResponse(id, { ok: true });
          }
          
          // Auto-send initialized notification
          if (autoAcknowledge) {
            transport.sendNotification(McpMethods.INITIALIZED, {});
          }
          
          handlersRef.current.initialize.forEach(h => h(initParams));
          break;
        }
        
        case McpMethods.TOOL_INPUT_PARTIAL: {
          const toolParams = params as ToolInputPartialParams;
          handlersRef.current.toolInputPartial.forEach(h => h(toolParams));
          break;
        }
        
        case McpMethods.TOOL_INPUT: {
          const toolParams = params as ToolInputParams;
          handlersRef.current.toolInput.forEach(h => h(toolParams));
          break;
        }
        
        case McpMethods.TOOL_RESULT: {
          const resultParams = params as ToolResultParams;
          handlersRef.current.toolResult.forEach(h => h(resultParams));
          break;
        }
        
        case McpMethods.HOST_CONTEXT_CHANGED: {
          const ctxParams = params as HostContext;
          setHostContext(prev => ({ ...prev, ...ctxParams }));
          handlersRef.current.hostContextChanged.forEach(h => h(ctxParams));
          break;
        }
        
        case McpMethods.RESOURCE_TEARDOWN: {
          if (id !== undefined) {
            transport.sendResponse(id, { ok: true });
          }
          handlersRef.current.resourceTeardown.forEach(h => h());
          break;
        }
        
        default:
          // Unknown method - acknowledge if request
          if (id !== undefined) {
            transport.sendResponse(id, { ok: true, ignored: true });
          }
      }
    };
    
    transport.start(handleMessage);
    
    return () => {
      transport.stop();
      transportRef.current = null;
    };
  }, [debug, autoAcknowledge]);
  
  // Messaging functions
  const sendRequest = useCallback((method: string, params?: unknown): Promise<unknown> => {
    if (!transportRef.current) return Promise.reject(new Error('Transport not initialized'));
    return transportRef.current.sendRequest(method, params);
  }, []);
  
  const sendNotification = useCallback((method: string, params?: unknown): void => {
    transportRef.current?.sendNotification(method, params);
  }, []);
  
  const sendResponse = useCallback((id: string | number, result: unknown): void => {
    transportRef.current?.sendResponse(id, result);
  }, []);
  
  const sendError = useCallback((id: string | number, code: number, message: string, data?: unknown): void => {
    transportRef.current?.sendError(id, code, message, data);
  }, []);
  
  // Event subscription helpers
  const createSubscriber = <T>(
    set: Set<EventHandler<T>>
  ) => (handler: EventHandler<T>): (() => void) => {
    set.add(handler);
    return () => set.delete(handler);
  };
  
  const onInitialize = useCallback(
    createSubscriber(handlersRef.current.initialize),
    []
  );
  
  const onToolInputPartial = useCallback(
    createSubscriber(handlersRef.current.toolInputPartial),
    []
  );
  
  const onToolInput = useCallback(
    createSubscriber(handlersRef.current.toolInput),
    []
  );
  
  const onToolResult = useCallback(
    createSubscriber(handlersRef.current.toolResult),
    []
  );
  
  const onHostContextChanged = useCallback(
    createSubscriber(handlersRef.current.hostContextChanged),
    []
  );
  
  const onResourceTeardown = useCallback(
    createSubscriber(handlersRef.current.resourceTeardown),
    []
  );
  
  return {
    // State
    isInitialized,
    parentOrigin: transportRef.current?.getOrigin() ?? '*',
    appInfo,
    hostCapabilities,
    hostContext,
    
    // Messaging
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
  };
}

