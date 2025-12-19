/**
 * useMcpToolStream - Hook for tracking tool streaming state
 */

import { useState, useEffect, useCallback } from 'react';
import type { ToolInputPartialParams, ToolInputParams, ToolResultParams } from '../protocol/types';

export type ToolStatus = 'idle' | 'streaming' | 'complete' | 'error' | 'teardown';

export interface ToolStreamState {
  /** Current tool name */
  name: string | null;
  /** Final or accumulated arguments */
  arguments: Record<string, unknown> | null;
  /** Partial arguments (during streaming) */
  partialArguments: Record<string, unknown> | null;
  /** Tool result */
  result: unknown | null;
  /** Current status */
  status: ToolStatus;
  /** Whether currently streaming */
  isStreaming: boolean;
}

export interface UseMcpToolStreamReturn extends ToolStreamState {
  /** Get a specific argument value with type safety */
  getArgumentValue: <T>(key: string, fallback?: T) => T | undefined;
  
  /** Manually update tool state (for external control) */
  handleToolInputPartial: (params: ToolInputPartialParams) => void;
  handleToolInput: (params: ToolInputParams) => void;
  handleToolResult: (params: ToolResultParams) => void;
  handleTeardown: () => void;
  
  /** Reset to idle state */
  reset: () => void;
}

const initialState: ToolStreamState = {
  name: null,
  arguments: null,
  partialArguments: null,
  result: null,
  status: 'idle',
  isStreaming: false,
};

/**
 * Hook for tracking tool streaming state
 * Use with useMcpProtocol for full control, or standalone with manual handlers
 * 
 * @example
 * ```tsx
 * function MyApp() {
 *   const protocol = useMcpProtocol();
 *   const tool = useMcpToolStream();
 *   
 *   useEffect(() => {
 *     const unsub1 = protocol.onToolInputPartial(tool.handleToolInputPartial);
 *     const unsub2 = protocol.onToolInput(tool.handleToolInput);
 *     const unsub3 = protocol.onToolResult(tool.handleToolResult);
 *     const unsub4 = protocol.onResourceTeardown(tool.handleTeardown);
 *     return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
 *   }, [protocol, tool]);
 *   
 *   if (tool.isStreaming) {
 *     return <Loading step={tool.getArgumentValue('stepId')} />;
 *   }
 *   
 *   if (tool.status === 'complete') {
 *     return <Result data={tool.result} />;
 *   }
 *   
 *   return <Waiting />;
 * }
 * ```
 */
export function useMcpToolStream(): UseMcpToolStreamReturn {
  const [state, setState] = useState<ToolStreamState>(initialState);
  
  const handleToolInputPartial = useCallback((params: ToolInputPartialParams) => {
    setState(prev => ({
      ...prev,
      name: params.tool.name,
      partialArguments: { ...prev.partialArguments, ...params.arguments },
      arguments: { ...prev.arguments, ...params.arguments },
      status: 'streaming',
      isStreaming: true,
    }));
  }, []);
  
  const handleToolInput = useCallback((params: ToolInputParams) => {
    setState(prev => ({
      ...prev,
      name: params.tool.name,
      arguments: params.arguments,
      partialArguments: params.arguments,
      status: 'streaming',
      isStreaming: true,
    }));
  }, []);
  
  const handleToolResult = useCallback((params: ToolResultParams) => {
    setState(prev => ({
      ...prev,
      name: params.tool.name,
      result: params.result,
      status: 'complete',
      isStreaming: false,
    }));
  }, []);
  
  const handleTeardown = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: 'teardown',
      isStreaming: false,
    }));
  }, []);
  
  const reset = useCallback(() => {
    setState(initialState);
  }, []);
  
  const getArgumentValue = useCallback(<T,>(key: string, fallback?: T): T | undefined => {
    const value = state.arguments?.[key] ?? state.partialArguments?.[key];
    return (value as T | undefined) ?? fallback;
  }, [state.arguments, state.partialArguments]);
  
  return {
    ...state,
    getArgumentValue,
    handleToolInputPartial,
    handleToolInput,
    handleToolResult,
    handleTeardown,
    reset,
  };
}

