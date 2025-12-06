/**
 * mcp-app-view
 * 
 * Build and embed MCP Apps (SEP-1865)
 * Framework-agnostic with optional React support
 * 
 * Built by BotDojo (https://botdojo.com)
 * 
 * @see https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx
 * 
 * @example Framework-agnostic usage
 * ```ts
 * import { McpAppClient } from 'mcp-app-view';
 * 
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
 * 
 * @example React usage
 * ```tsx
 * import { useMcpApp } from 'mcp-app-view/react';
 * 
 * function MyApp() {
 *   const { isInitialized, state, saveState, tool, sendMessage } = useMcpApp();
 *   
 *   if (!isInitialized) return <div>Loading...</div>;
 *   if (tool.isStreaming) return <div>Processing...</div>;
 *   
 *   const counter = state?.counter ?? 0;
 *   
 *   return (
 *     <div>
 *       <h1>{counter}</h1>
 *       <button onClick={() => saveState({ counter: counter + 1 })}>+</button>
 *     </div>
 *   );
 * }
 * ```
 */

// Protocol (framework-agnostic)
export {
  // Client
  McpAppClient,
  type McpAppClientOptions,
  type McpAppClientState,
} from './protocol/client';

export {
  // Transport
  McpTransport,
  type TransportOptions,
  type MessageHandler,
  type PendingRequest,
} from './protocol/transport';

export {
  // Types
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type JsonRpcSuccess,
  type JsonRpcError,
  type JsonRpcMessage,
  type AppInfo,
  type HostCapabilities,
  type HostContext,
  type UiInitializeParams,
  type ToolInputPartialParams,
  type ToolInputParams,
  type ToolResultParams,
  type SizeChangeParams,
  type OpenLinkParams,
  type MessageContent,
  type UiMessageParams,
  type ToolsCallParams,
  type McpEventMap,
  type McpEventType,
  McpMethods,
} from './protocol/types';
