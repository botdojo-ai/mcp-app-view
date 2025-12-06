/**
 * McpProxyHost - Component for hosting MCP Apps in a sandboxed iframe
 * 
 * This component creates a sandboxed proxy iframe that hosts MCP Apps.
 * It handles the SEP-1865 protocol communication with the embedded app.
 */

import React, { useRef, useEffect, useCallback, useState, type CSSProperties } from 'react';
import type {
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcId,
  AppInfo,
  HostCapabilities,
  HostContext,
  UiInitializeParams,
  ToolInputPartialParams,
  ToolInputParams,
  ToolResultParams,
  MessageContent,
} from '../protocol/types';
import { McpMethods } from '../protocol/types';

// =============================================================================
// Types
// =============================================================================

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface McpProxyHostProps {
  /** URL of the proxy server that serves the sandbox iframe */
  proxyUrl: string;
  /** URL of the MCP App to host */
  appUrl: string;
  /** App info to send during initialization */
  appInfo?: AppInfo;
  /** Host capabilities */
  hostCapabilities?: HostCapabilities;
  /** Initial host context */
  hostContext?: HostContext;
  /** Sandbox permissions (default: allow-scripts allow-forms) */
  sandboxPermissions?: string[];
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
  /** Iframe styles */
  iframeStyle?: CSSProperties;
  /** Width (default: 100%) */
  width?: string | number;
  /** Height (default: auto) */
  height?: string | number;
  /** Enable debug logging */
  debug?: boolean;
  
  // Event callbacks
  /** Called when app is initialized */
  onInitialized?: () => void;
  /** Called when app reports size change */
  onSizeChange?: (size: { width: number; height: number }) => void;
  /** Called when app sends a message */
  onMessage?: (params: { content: MessageContent[] }) => void | Promise<void>;
  /** Called when app requests to open a link */
  onOpenLink?: (url: string) => void;
  /** Called when app calls a tool */
  onToolCall?: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  /** Called on error */
  onError?: (error: Error) => void;
}

export interface McpProxyHostRef {
  /** Send tool input partial notification */
  sendToolInputPartial: (params: ToolInputPartialParams) => void;
  /** Send tool input notification */
  sendToolInput: (params: ToolInputParams) => void;
  /** Send tool result notification */
  sendToolResult: (params: ToolResultParams) => void;
  /** Send host context changed notification */
  sendHostContextChanged: (context: HostContext) => void;
  /** Send resource teardown notification */
  sendResourceTeardown: () => void;
  /** Get the iframe element */
  getIframe: () => HTMLIFrameElement | null;
  /** Check if initialized */
  isInitialized: () => boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * McpProxyHost - Hosts MCP Apps in a sandboxed iframe
 * 
 * @example
 * ```tsx
 * function MyHost() {
 *   const hostRef = useRef<McpProxyHostRef>(null);
 *   
 *   const handleMessage = async (params) => {
 *     console.log('Message from app:', params.content);
 *   };
 *   
 *   const handleToolCall = async (name, args) => {
 *     // Handle tool calls from the app
 *     return { result: 'success' };
 *   };
 *   
 *   // Send tool updates
 *   useEffect(() => {
 *     hostRef.current?.sendToolInput({
 *       tool: { name: 'myTool' },
 *       arguments: { step: 1 },
 *     });
 *   }, []);
 *   
 *   return (
 *     <McpProxyHost
 *       ref={hostRef}
 *       proxyUrl="https://proxy.example.com"
 *       appUrl="https://app.example.com"
 *       onMessage={handleMessage}
 *       onToolCall={handleToolCall}
 *     />
 *   );
 * }
 * ```
 */
export const McpProxyHost = React.forwardRef<McpProxyHostRef, McpProxyHostProps>(
  function McpProxyHost(
    {
      proxyUrl,
      appUrl,
      appInfo = { name: 'MCP Host', version: '1.0.0' },
      hostCapabilities = { openLinks: {} },
      hostContext = {},
      sandboxPermissions = ['allow-scripts', 'allow-forms'],
      className,
      style,
      iframeStyle,
      width = '100%',
      height = 'auto',
      debug = false,
      onInitialized,
      onSizeChange,
      onMessage,
      onOpenLink,
      onToolCall,
      onError,
    },
    ref
  ) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [iframeSize, setIframeSize] = useState<{ width: number; height: number } | null>(null);
    
    // Pending requests for request-response pattern
    const pendingRequests = useRef<Map<JsonRpcId, PendingRequest>>(new Map());
    const nextRequestId = useRef(0);
    const initializeRetries = useRef(0);
    const initializeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const targetOrigin = useRef<string>('*');
    
    // Logging helper
    const log = useCallback((message: string, data?: unknown) => {
      if (debug) {
        if (data !== undefined) {
          console.log(`[McpProxyHost] ${message}`, data);
        } else {
          console.log(`[McpProxyHost] ${message}`);
        }
      }
    }, [debug]);
    
    // Send JSON-RPC message
    const send = useCallback((message: JsonRpcMessage) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) {
        log('Cannot send: iframe not ready');
        return;
      }
      
      log(`Sending: ${(message as JsonRpcRequest).method ?? 'response'}`, message);
      iframe.contentWindow.postMessage(message, targetOrigin.current);
    }, [log]);
    
    // Send request and wait for response
    const sendRequest = useCallback((method: string, params?: unknown, timeoutMs = 5000): Promise<unknown> => {
      const id = `host-${++nextRequestId.current}`;
      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequests.current.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }, timeoutMs);
        
        pendingRequests.current.set(id, { resolve, reject, timer });
        send(request);
      });
    }, [send]);
    
    // Send notification
    const sendNotification = useCallback((method: string, params?: unknown) => {
      send({ jsonrpc: '2.0', method, params });
    }, [send]);
    
    // Send response
    const sendResponse = useCallback((id: JsonRpcId, result: unknown) => {
      send({ jsonrpc: '2.0', id, result });
    }, [send]);
    
    // Send error response
    const sendError = useCallback((id: JsonRpcId, code: number, message: string, data?: unknown) => {
      send({ jsonrpc: '2.0', id, error: { code, message, data } });
    }, [send]);
    
    // Send initialization
    const sendInitialize = useCallback(() => {
      const params: UiInitializeParams = {
        protocolVersion: 'mcp-apps/0.1',
        appInfo,
        hostCapabilities,
        hostContext,
      };
      
      log('Sending ui/initialize', params);
      sendRequest(McpMethods.INITIALIZE, params, 2000).catch(() => {
        // Retry if not initialized
        if (!isInitialized && initializeRetries.current < 5) {
          initializeRetries.current++;
          initializeTimer.current = setTimeout(sendInitialize, 300);
        }
      });
    }, [appInfo, hostCapabilities, hostContext, sendRequest, isInitialized, log]);
    
    // Handle incoming messages
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== 'object' || data.jsonrpc !== '2.0') return;
        
        // Learn origin
        if (targetOrigin.current === '*' && event.origin) {
          targetOrigin.current = event.origin;
          log(`Learned target origin: ${targetOrigin.current}`);
        }
        
        // Handle response to our request
        if ('id' in data && !('method' in data)) {
          const pending = pendingRequests.current.get(data.id as JsonRpcId);
          if (pending) {
            if (pending.timer) clearTimeout(pending.timer);
            pendingRequests.current.delete(data.id as JsonRpcId);
            
            if ('error' in data) {
              pending.reject(data.error);
            } else {
              pending.resolve(data.result);
            }
          }
          return;
        }
        
        // Handle requests/notifications from app
        const { method, params, id } = data as JsonRpcRequest;
        if (!method) return;
        
        log(`Received: ${method}`, params);
        
        const handleAsync = async () => {
          try {
            switch (method) {
              case McpMethods.INITIALIZED:
                setIsInitialized(true);
                initializeRetries.current = 0;
                if (initializeTimer.current) {
                  clearTimeout(initializeTimer.current);
                  initializeTimer.current = null;
                }
                onInitialized?.();
                break;
              
              case McpMethods.SIZE_CHANGE:
                const sizeParams = params as { width: number; height: number };
                setIframeSize(sizeParams);
                onSizeChange?.(sizeParams);
                break;
              
              case McpMethods.OPEN_LINK:
                const linkParams = params as { url: string };
                onOpenLink?.(linkParams.url);
                if (id !== undefined) sendResponse(id, { ok: true });
                break;
              
              case McpMethods.MESSAGE:
                const msgParams = params as { content: MessageContent[] };
                await onMessage?.(msgParams);
                if (id !== undefined) sendResponse(id, { ok: true });
                break;
              
              case McpMethods.TOOLS_CALL:
                const toolParams = params as { name: string; arguments?: Record<string, unknown> };
                if (onToolCall) {
                  const result = await onToolCall(toolParams.name, toolParams.arguments);
                  if (id !== undefined) sendResponse(id, result);
                } else {
                  if (id !== undefined) sendError(id, -32601, 'Tool call handler not configured');
                }
                break;
              
              default:
                // Unknown method - acknowledge if request
                if (id !== undefined) {
                  sendResponse(id, { ok: true, ignored: true });
                }
            }
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            log(`Error handling ${method}:`, error);
            onError?.(error);
            if (id !== undefined) {
              sendError(id, -32000, error.message);
            }
          }
        };
        
        handleAsync();
      };
      
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [log, sendResponse, sendError, onInitialized, onSizeChange, onOpenLink, onMessage, onToolCall, onError]);
    
    // Initialize on iframe load
    const handleIframeLoad = useCallback(() => {
      log('Iframe loaded, sending initialize');
      initializeRetries.current = 0;
      sendInitialize();
    }, [sendInitialize, log]);
    
    // Cleanup
    useEffect(() => {
      return () => {
        if (initializeTimer.current) {
          clearTimeout(initializeTimer.current);
        }
        pendingRequests.current.forEach(({ timer }) => {
          if (timer) clearTimeout(timer);
        });
        pendingRequests.current.clear();
      };
    }, []);
    
    // Build iframe src URL
    const iframeSrc = `${proxyUrl}?app=${encodeURIComponent(appUrl)}`;
    
    // Expose ref methods
    React.useImperativeHandle(ref, () => ({
      sendToolInputPartial: (params: ToolInputPartialParams) => {
        sendNotification(McpMethods.TOOL_INPUT_PARTIAL, params);
      },
      sendToolInput: (params: ToolInputParams) => {
        sendNotification(McpMethods.TOOL_INPUT, params);
      },
      sendToolResult: (params: ToolResultParams) => {
        sendNotification(McpMethods.TOOL_RESULT, params);
      },
      sendHostContextChanged: (context: HostContext) => {
        sendNotification(McpMethods.HOST_CONTEXT_CHANGED, context);
      },
      sendResourceTeardown: () => {
        sendNotification(McpMethods.RESOURCE_TEARDOWN, {});
      },
      getIframe: () => iframeRef.current,
      isInitialized: () => isInitialized,
    }), [sendNotification, isInitialized]);
    
    // Calculate height
    const computedHeight = height === 'auto' && iframeSize 
      ? `${iframeSize.height}px` 
      : height;
    
    return (
      <div 
        className={className} 
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: computedHeight === 'auto' ? undefined : (typeof computedHeight === 'number' ? `${computedHeight}px` : computedHeight),
          ...style,
        }}
      >
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          sandbox={sandboxPermissions.join(' ')}
          onLoad={handleIframeLoad}
          style={{
            width: '100%',
            height: computedHeight === 'auto' ? (iframeSize ? `${iframeSize.height}px` : '100%') : '100%',
            border: 'none',
            ...iframeStyle,
          }}
          title="MCP App"
        />
      </div>
    );
  }
);

