/**
 * SEP-1865 MCP Apps Protocol Types
 * @see https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx
 */

// =============================================================================
// JSON-RPC 2.0 Base Types
// =============================================================================

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcSuccess | JsonRpcError;

// =============================================================================
// SEP-1865 Core Types
// =============================================================================

/**
 * Application information sent by the host during initialization
 */
export interface AppInfo {
  name: string;
  version?: string;
}

/**
 * Host capabilities advertised during initialization
 */
export interface HostCapabilities {
  /** Host supports opening external links */
  openLinks?: Record<string, never>;
  /** Extension capabilities */
  [key: string]: unknown;
}

/**
 * SEP-1865 spec-compliant Tool schema
 */
export interface Tool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * SEP-1865 spec-compliant toolInfo
 * @see https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx#host-context-in-mcpuiinitializeresult
 */
export interface ToolInfo {
  /** JSON-RPC id of the tools/call request */
  id?: string | number;
  /** Tool schema (name, description, inputSchema) */
  tool: Tool;
  /** Tool arguments (BotDojo extension for hydration) */
  arguments?: Record<string, unknown>;
  /** Tool result (BotDojo extension for hydration) */
  result?: unknown;
}

/**
 * Host context passed to the UI during initialization and updates
 */
export interface HostContext {
  /** Current theme preference */
  theme?: 'light' | 'dark';
  /** Viewport dimensions */
  viewport?: {
    width: number;
    height: number;
  };
  /** Locale preference */
  locale?: string;
  /**
   * SEP-1865 spec-compliant tool metadata
   * Contains the tool schema (name, description, inputSchema) and request id.
   * Tool arguments/results come via ui/notifications/tool-input and tool-result.
   */
  toolInfo?: ToolInfo;
  /** UI state persisted by the host (BotDojo extension, not in spec) */
  state?: unknown;
  /** Extension context fields */
  [key: string]: unknown;
}

// =============================================================================
// SEP-1865 Host → UI Messages
// =============================================================================

/**
 * ui/initialize - Host initializes the UI
 */
export interface UiInitializeParams {
  protocolVersion: string;
  appInfo: AppInfo;
  hostCapabilities: HostCapabilities;
  hostContext: HostContext;
}

/**
 * ui/notifications/tool-input-partial - Streaming tool arguments or progress
 */
export interface ToolInputPartialParams {
  tool: { name: string };
  arguments: Record<string, unknown>;
}

/**
 * ui/notifications/tool-input - Final tool arguments
 */
export interface ToolInputParams {
  tool: { name: string };
  arguments: Record<string, unknown>;
}

/**
 * ui/notifications/tool-result - Tool execution result
 */
export interface ToolResultParams {
  tool: { name: string };
  result: unknown;
}

/**
 * ui/notifications/host-context-changed - Host context update
 */
export type HostContextChangedParams = HostContext;

// =============================================================================
// SEP-1865 UI → Host Messages
// =============================================================================

/**
 * ui/notifications/size-change - UI reports size change
 */
export interface SizeChangeParams {
  width: number;
  height: number;
}

/**
 * ui/open-link - UI requests host open a URL
 */
export interface OpenLinkParams {
  url: string;
}

/**
 * ui/message - UI sends message to host
 */
export interface MessageContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface UiMessageParams {
  content: MessageContent[];
}

/**
 * tools/call - UI calls a tool on the host
 */
export interface ToolsCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

// =============================================================================
// Protocol Method Constants
// =============================================================================

export const McpMethods = {
  // Host → UI
  INITIALIZE: 'ui/initialize',
  TOOL_INPUT_PARTIAL: 'ui/notifications/tool-input-partial',
  TOOL_INPUT: 'ui/notifications/tool-input',
  TOOL_RESULT: 'ui/notifications/tool-result',
  TOOL_CANCELLED: 'ui/tool-cancelled',
  HOST_CONTEXT_CHANGED: 'ui/notifications/host-context-changed',
  RESOURCE_TEARDOWN: 'ui/resource-teardown',
  
  // UI → Host
  INITIALIZED: 'ui/notifications/initialized',
  SIZE_CHANGE: 'ui/notifications/size-change',
  OPEN_LINK: 'ui/open-link',
  MESSAGE: 'ui/message',
  TOOLS_CALL: 'tools/call',
} as const;

// =============================================================================
// Event Types
// =============================================================================

export type McpEventMap = {
  'initialize': UiInitializeParams;
  'initialized': void;
  'toolInputPartial': ToolInputPartialParams;
  'toolInput': ToolInputParams;
  'toolResult': ToolResultParams;
  'hostContextChanged': HostContextChangedParams;
  'resourceTeardown': void;
  'sizeChange': SizeChangeParams;
  'error': Error;
};

export type McpEventType = keyof McpEventMap;

