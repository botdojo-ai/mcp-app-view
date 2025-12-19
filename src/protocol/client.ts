/**
 * MCP App Client - Framework-agnostic client for MCP Apps
 * Implements SEP-1865 protocol
 */

import { McpTransport, type TransportOptions } from './transport';
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
  type McpEventMap,
  type McpEventType,
} from './types';

// =============================================================================
// Event Emitter
// =============================================================================

type EventListener<T> = (data: T) => void;

class EventEmitter<TEvents extends Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, Set<EventListener<unknown>>>();
  
  on<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as EventListener<unknown>);
    
    return () => {
      this.listeners.get(event)?.delete(listener as EventListener<unknown>);
    };
  }
  
  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(data);
      } catch (err) {
        console.error(`[McpAppClient] Event handler error:`, err);
      }
    });
  }
  
  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// =============================================================================
// MCP App Client
// =============================================================================

export interface McpAppClientOptions extends TransportOptions {
  /** Auto-acknowledge initialization (default: true) */
  autoAcknowledge?: boolean;
}

export interface McpAppClientState {
  isInitialized: boolean;
  appInfo: AppInfo | null;
  hostCapabilities: HostCapabilities | null;
  hostContext: HostContext | null;
  tool: {
    name: string | null;
    arguments: Record<string, unknown> | null;
    result: unknown | null;
    isStreaming: boolean;
  };
}

/**
 * MCP App Client - Framework-agnostic implementation
 * 
 * @example
 * ```ts
 * const client = new McpAppClient({ debug: true });
 * 
 * client.on('initialize', (params) => {
 *   console.log('Initialized:', params.appInfo);
 * });
 * 
 * client.on('toolInput', (params) => {
 *   console.log('Tool:', params.tool.name, params.arguments);
 * });
 * 
 * client.start();
 * 
 * // Send messages
 * await client.sendMessage([{ type: 'text', text: 'Hello!' }]);
 * await client.callTool('myTool', { arg: 'value' });
 * ```
 */
export class McpAppClient {
  private transport: McpTransport;
  private emitter = new EventEmitter<McpEventMap>();
  private autoAcknowledge: boolean;
  private _state: McpAppClientState = {
    isInitialized: false,
    appInfo: null,
    hostCapabilities: null,
    hostContext: null,
    tool: {
      name: null,
      arguments: null,
      result: null,
      isStreaming: false,
    },
  };
  
  constructor(options: McpAppClientOptions = {}) {
    this.transport = new McpTransport(options);
    this.autoAcknowledge = options.autoAcknowledge ?? true;
  }
  
  // ===========================================================================
  // Lifecycle
  // ===========================================================================
  
  /**
   * Start the client and begin listening for messages
   */
  start(): void {
    this.transport.start(this.handleMessage.bind(this));
    // Signal to proxy/host that we're ready to receive messages
    // This allows the proxy to queue messages until the client is listening
    this.transport.sendNotification('ui/notifications/client-ready', {});
  }
  
  /**
   * Stop the client and cleanup
   */
  stop(): void {
    this.transport.stop();
    this.emitter.removeAllListeners();
    this._state = {
      isInitialized: false,
      appInfo: null,
      hostCapabilities: null,
      hostContext: null,
      tool: {
        name: null,
        arguments: null,
        result: null,
        isStreaming: false,
      },
    };
  }
  
  // ===========================================================================
  // State
  // ===========================================================================
  
  /**
   * Get current client state
   */
  get state(): Readonly<McpAppClientState> {
    return this._state;
  }
  
  /**
   * Check if client is initialized
   */
  get isInitialized(): boolean {
    return this._state.isInitialized;
  }
  
  // ===========================================================================
  // Event Subscriptions
  // ===========================================================================
  
  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on<K extends McpEventType>(event: K, listener: EventListener<McpEventMap[K]>): () => void {
    return this.emitter.on(event, listener);
  }
  
  // ===========================================================================
  // UI → Host Actions (SEP-1865)
  // ===========================================================================
  
  /**
   * Send ui/message to the host
   */
  async sendMessage(content: MessageContent[]): Promise<void> {
    await this.transport.sendRequest(McpMethods.MESSAGE, { content });
  }
  
  /**
   * Send ui/open-link to the host
   */
  async openLink(url: string): Promise<void> {
    await this.transport.sendRequest(McpMethods.OPEN_LINK, { url });
  }
  
  /**
   * Send ui/notifications/size-change to the host
   */
  reportSize(width: number, height: number): void {
    this.transport.sendNotification(McpMethods.SIZE_CHANGE, { width, height });
    this.emitter.emit('sizeChange', { width, height });
  }
  
  /**
   * Send tools/call to the host
   */
  async callTool<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const result = await this.transport.sendRequest(McpMethods.TOOLS_CALL, {
      name,
      arguments: args,
    });
    return result as T;
  }
  
  // ===========================================================================
  // Raw Protocol Access
  // ===========================================================================
  
  /**
   * Send a raw JSON-RPC request
   */
  sendRequest(method: string, params?: unknown): Promise<unknown> {
    return this.transport.sendRequest(method, params);
  }
  
  /**
   * Send a raw JSON-RPC notification
   */
  sendNotification(method: string, params?: unknown): void {
    this.transport.sendNotification(method, params);
  }
  
  /**
   * Get the learned parent origin
   */
  getOrigin(): string {
    return this.transport.getOrigin();
  }
  
  // ===========================================================================
  // Internal Message Handling
  // ===========================================================================
  
  private handleMessage(message: JsonRpcMessage): void {
    // Only handle requests and notifications (not responses)
    if (!('method' in message)) return;
    
    const { method, params, id } = message as JsonRpcRequest;
    
    switch (method) {
      case McpMethods.INITIALIZE:
        this.handleInitialize(params as UiInitializeParams, id);
        break;
        
      case McpMethods.TOOL_INPUT_PARTIAL:
        this.handleToolInputPartial(params as ToolInputPartialParams);
        break;
        
      case McpMethods.TOOL_INPUT:
        this.handleToolInput(params as ToolInputParams);
        break;
        
      case McpMethods.TOOL_RESULT:
        this.handleToolResult(params as ToolResultParams);
        break;
        
      case McpMethods.HOST_CONTEXT_CHANGED:
        this.handleHostContextChanged(params as HostContext);
        break;
        
      case McpMethods.RESOURCE_TEARDOWN:
        this.handleResourceTeardown(id);
        break;
        
      default:
        // Unknown method - send acknowledgment if request
        if (id !== undefined) {
          this.transport.sendResponse(id, { ok: true, ignored: true });
        }
    }
  }
  
  private handleInitialize(params: UiInitializeParams, id?: string | number): void {
    this._state = {
      ...this._state,
      isInitialized: true,
      appInfo: params.appInfo,
      hostCapabilities: params.hostCapabilities,
      hostContext: params.hostContext,
    };
    
    // Respond to request
    if (id !== undefined) {
      this.transport.sendResponse(id, { ok: true });
    }
    
    // Auto-send initialized notification
    if (this.autoAcknowledge) {
      this.transport.sendNotification(McpMethods.INITIALIZED, {});
    }
    
    this.emitter.emit('initialize', params);
    this.emitter.emit('initialized', undefined);
  }
  
  private handleToolInputPartial(params: ToolInputPartialParams): void {
    // Validate arguments - must be an object, not empty string
    // Cast to unknown first since runtime data may not match types
    const args = params.arguments as unknown;
    if (args === '' || args === null || typeof args !== 'object') {
      // Skip invalid arguments - server may send empty string during streaming
      return;
    }
    const validArgs = args as Record<string, unknown>;
    
    this._state = {
      ...this._state,
      tool: {
        name: params.tool.name,
        arguments: { ...this._state.tool.arguments, ...validArgs },
        result: null,
        isStreaming: true,
      },
    };
    
    this.emitter.emit('toolInputPartial', params);
  }
  
  private handleToolInput(params: ToolInputParams): void {
    // Validate arguments - must be an object, not empty string
    // Cast to unknown first since runtime data may not match types
    const args = params.arguments as unknown;
    if (args === '' || args === null || typeof args !== 'object') {
      // Skip invalid arguments - server may send empty string during streaming
      return;
    }
    const validArgs = args as Record<string, unknown>;
    
    this._state = {
      ...this._state,
      tool: {
        name: params.tool.name,
        arguments: validArgs,
        result: null,
        isStreaming: true,
      },
    };
    
    this.emitter.emit('toolInput', params);
  }
  
  private handleToolResult(params: ToolResultParams): void {
    // Validate result - skip if empty string (server may send empty string during streaming)
    const result = params.result;
    if (result === '' || result === undefined) {
      // Skip invalid result
      return;
    }
    
    this._state = {
      ...this._state,
      tool: {
        ...this._state.tool,
        name: params.tool.name,
        result: result,
        isStreaming: false,
      },
    };
    
    this.emitter.emit('toolResult', params);
  }
  
  private handleHostContextChanged(params: HostContext): void {
    this._state = {
      ...this._state,
      hostContext: { ...this._state.hostContext, ...params },
    };
    
    this.emitter.emit('hostContextChanged', params);
  }
  
  private handleResourceTeardown(id?: string | number): void {
    // Respond to request if needed
    if (id !== undefined) {
      this.transport.sendResponse(id, { ok: true });
    }
    
    this.emitter.emit('resourceTeardown', undefined);
  }
}

