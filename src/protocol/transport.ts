/**
 * PostMessage Transport for MCP Apps
 * Handles JSON-RPC 2.0 communication with the host via postMessage
 */

import type {
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcSuccess,
  JsonRpcError,
} from './types';

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface TransportOptions {
  /** Target window to send messages to (default: window.parent) */
  targetWindow?: Window;
  /** Target origin for postMessage (default: '*') */
  targetOrigin?: string;
  /** Timeout for requests in ms (default: 30000) */
  requestTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export type MessageHandler = (message: JsonRpcMessage) => void;

/**
 * PostMessage transport layer for MCP Apps
 * Handles sending/receiving JSON-RPC 2.0 messages via postMessage
 */
export class McpTransport {
  private targetWindow: Window | null = null;
  private targetOrigin: string = '*';
  private learnedOrigin: string | null = null;
  private requestTimeout: number;
  private debug: boolean;
  
  private pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private nextRequestId = 0;
  private messageHandler: MessageHandler | null = null;
  private boundHandleMessage: ((event: MessageEvent) => void) | null = null;
  private started = false;
  
  constructor(options: TransportOptions = {}) {
    this.targetOrigin = options.targetOrigin ?? '*';
    this.requestTimeout = options.requestTimeout ?? 30000;
    this.debug = options.debug ?? false;
    
    // Set target window (default to parent in browser)
    if (typeof window !== 'undefined') {
      this.targetWindow = options.targetWindow ?? window.parent;
    }
  }
  
  /**
   * Start listening for messages
   */
  start(handler: MessageHandler): void {
    if (this.started) return;
    if (typeof window === 'undefined') return;
    
    this.messageHandler = handler;
    this.boundHandleMessage = this.handleMessage.bind(this);
    window.addEventListener('message', this.boundHandleMessage);
    this.started = true;
    
    this.log('Transport started');
  }
  
  /**
   * Stop listening for messages
   */
  stop(): void {
    if (!this.started) return;
    if (typeof window === 'undefined') return;
    
    if (this.boundHandleMessage) {
      window.removeEventListener('message', this.boundHandleMessage);
    }
    
    // Clear pending requests
    this.pendingRequests.forEach(({ timer, reject }) => {
      if (timer) clearTimeout(timer);
      reject(new Error('Transport stopped'));
    });
    this.pendingRequests.clear();
    
    this.messageHandler = null;
    this.boundHandleMessage = null;
    this.started = false;
    
    this.log('Transport stopped');
  }
  
  /**
   * Send a JSON-RPC request and wait for response
   */
  sendRequest(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    const id = `mcp-${++this.nextRequestId}`;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    
    const timeout = timeoutMs ?? this.requestTimeout;
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);
      
      this.pendingRequests.set(id, { resolve, reject, timer });
      this.send(request);
    });
  }
  
  /**
   * Send a JSON-RPC notification (no response expected)
   */
  sendNotification(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.send(notification);
  }
  
  /**
   * Send a JSON-RPC success response
   */
  sendResponse(id: JsonRpcId, result: unknown): void {
    const response: JsonRpcSuccess = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.send(response);
  }
  
  /**
   * Send a JSON-RPC error response
   */
  sendError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
    const response: JsonRpcError = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    this.send(response);
  }
  
  /**
   * Get the learned parent origin
   */
  getOrigin(): string {
    return this.learnedOrigin ?? this.targetOrigin;
  }
  
  private send(message: JsonRpcMessage): void {
    if (!this.targetWindow) {
      this.log('Cannot send: no target window');
      return;
    }
    
    const origin = this.learnedOrigin ?? this.targetOrigin;
    this.log(`Sending: ${(message as JsonRpcRequest | JsonRpcNotification).method ?? 'response'}`, message);
    this.targetWindow.postMessage(message, origin);
  }
  
  private handleMessage(event: MessageEvent): void {
    const data = event.data;
    
    // Validate JSON-RPC message
    if (!data || typeof data !== 'object' || data.jsonrpc !== '2.0') {
      return;
    }
    
    // Learn origin from first valid message
    if (!this.learnedOrigin && event.origin) {
      this.learnedOrigin = event.origin;
      this.log(`Learned origin: ${this.learnedOrigin}`);
    }
    
    this.log(`Received: ${data.method ?? 'response'}`, data);
    
    // Handle response to our request
    if ('id' in data && !('method' in data)) {
      const pending = this.pendingRequests.get(data.id as JsonRpcId);
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingRequests.delete(data.id as JsonRpcId);
        
        if ('error' in data) {
          pending.reject((data as JsonRpcError).error);
        } else {
          pending.resolve((data as JsonRpcSuccess).result);
        }
      }
      return;
    }
    
    // Forward to message handler
    this.messageHandler?.(data as JsonRpcMessage);
  }
  
  private log(message: string, data?: unknown): void {
    if (this.debug) {
      if (data !== undefined) {
        console.log(`[McpTransport] ${message}`, data);
      } else {
        console.log(`[McpTransport] ${message}`);
      }
    }
  }
}

