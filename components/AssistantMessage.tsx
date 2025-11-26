import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Brain, Wrench, Copy, Info } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type EventType = 
  | 'start' 
  | 'finish' 
  | 'chunk-text' 
  | 'chunk-sub-agent-text' 
  | 'tool-call-start' 
  | 'tool-result' 
  | 'chunk-table' 
  | 'chunk-code' 
  | 'chunk-chart';

interface StreamEvent {
  type: EventType;
  runId: string;
  parentId: string | null;
  toolCallId: string | null;
  agentId?: string | null;
  timestamp: string;
  payload?: {
    messageId?: string;
    type?: string;
    thinking?: string;
    content?: any;
    finalAnswer?: string;
    suggestion?: string;
    toolCallId?: string;
    toolName?: string;
    args?: any;
    toolResult?: any;
    [key: string]: any;
  };
}

interface AssistantMessageProps {
  event: StreamEvent | null;
  isStreaming?: boolean;
}

interface ToolCallNode {
  toolCallId: string;
  toolName: string;
  startEvent: StreamEvent;
  resultEvent: StreamEvent | null;
  childAgent: ExecutionNode | null;
}

interface ExecutionNode {
  runId: string;
  parentId: string | null;
  toolCallId: string | null;
  agentId: string | null;
  events: StreamEvent[];
  toolCalls: Map<string, ToolCallNode>;
  startTime: string | null;
  endTime: string | null;
}

interface ExecutionTree {
  [key: string]: ExecutionNode;
}

interface ContentChunkProps {
  event: StreamEvent;
  messageId: string;
  thinking: string;
  textContent: string;           // For text chunks
  finalAnswer: string;            // For structured chunks
  structuredContent?: any;        // For structured chunks
  suggestion: string;
  isExpanded: boolean;
  onToggle: () => void;
}

interface ToolCallComponentProps {
  toolCall: ToolCallNode;
  tree: ExecutionTree;
  depth: number;
  autoExpand: boolean;
  autoCollapse: boolean;
}

interface ExecutionNodeProps {
  node: ExecutionNode;
  tree: ExecutionTree;
  depth: number;
  indentSize: number;
  autoExpand: boolean;
  autoCollapse: boolean;
}

// ContentChunkComponent - Renders different types of content chunks
const ContentChunkComponent: React.FC<ContentChunkProps> = React.memo(({ 
  event, 
  messageId,
  thinking, 
  textContent,
  finalAnswer,
  structuredContent,
  suggestion,
  isExpanded, 
  onToggle 
}) => {
  const hasThinking = Boolean(thinking);
  const hasSuggestion = Boolean(suggestion);
  const eventType = event.type;
  const isTextChunk = eventType === 'chunk-text' || eventType === 'chunk-sub-agent-text';
  
  const renderContent = () => {
    // Text chunks: render textContent directly
    if (isTextChunk) {
      if (textContent) {
        return (
          <span className="text-sm text-black">
            {textContent}
          </span>
        );
      }
      return <span className="text-sm text-black italic animate-pulse">thinking...</span>;
    }
    
    // Structured chunks: render with shadcn components
    if (eventType === 'chunk-table') {
      const tableData = structuredContent || {};
      const hasData = tableData.headers && tableData.rows;
      
      return (
        <Card className="my-2 overflow-hidden border border-gray-300 shadow-sm">
          {tableData.title && (
            <CardHeader className="py-2.5 px-3 bg-gray-50 border-b border-gray-300">
              <CardTitle className="text-xs font-semibold text-gray-800">📊 {tableData.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className="p-0">
            {hasData ? (
              <div className="border border-gray-300 m-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableData.headers.map((header: string, i: number) => (
                        <TableHead key={i}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.rows.map((row: any[], i: number) => (
                      <TableRow key={i}>
                        {row.map((cell: any, j: number) => (
                          <TableCell key={j}>{String(cell)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic p-3">Loading table data...</div>
            )}
            {finalAnswer && (
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-300">
                <CardDescription className="text-xs text-gray-700">{finalAnswer}</CardDescription>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }
    
    if (eventType === 'chunk-code') {
      const codeData = structuredContent || {};
      const [copied, setCopied] = React.useState(false);
      
      const handleCopy = () => {
        if (codeData.code) {
          navigator.clipboard.writeText(codeData.code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      };
      
      return (
        <Card className="my-2 bg-gray-900 border-gray-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-gray-200">
                💻 {codeData.title || 'Code'}
                {codeData.language && (
                  <span className="ml-2 text-xs text-gray-400">({codeData.language})</span>
                )}
              </CardTitle>
              {codeData.code && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {codeData.code ? (
              <pre className="text-xs text-green-400 overflow-auto">
                <code>{codeData.code}</code>
              </pre>
            ) : (
              <div className="text-sm text-gray-500 italic">Loading code...</div>
            )}
            {finalAnswer && (
              <CardDescription className="mt-3 text-gray-400">{finalAnswer}</CardDescription>
            )}
          </CardContent>
        </Card>
      );
    }
    
    if (eventType === 'chunk-chart') {
      const chartData = structuredContent || {};
      
      return (
        <Card className="my-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">📈 {chartData.title || 'Chart'}</CardTitle>
            {chartData.chartType && (
              <CardDescription className="text-xs capitalize">{chartData.chartType} chart</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {chartData.data ? (
              <div className="text-sm text-gray-600">
                <div className="italic mb-2">Chart visualization coming soon...</div>
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                  {JSON.stringify(chartData.data, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">Loading chart data...</div>
            )}
            {finalAnswer && (
              <CardDescription className="mt-3">{finalAnswer}</CardDescription>
            )}
          </CardContent>
        </Card>
      );
    }
    
    return null;
  };
  
  return (
    <div key={messageId}>
      <div className="flex items-center gap-1.5 py-1">
        {hasThinking && (
          <button
            onClick={onToggle}
            className="cursor-pointer p-0 border-0 bg-transparent flex items-center justify-center"
          >
            {isExpanded ? 
              <ChevronDown className="w-3 h-3 text-gray-500" /> : 
              <ChevronRight className="w-3 h-3 text-gray-500" />
            }
          </button>
        )}
        
        {renderContent()}
      </div>
      
      {isExpanded && hasThinking && (
        <div className="ml-7 mt-1 text-sm text-gray-800 italic">
          {thinking}
        </div>
      )}
      
      {hasSuggestion && (
        <div className="ml-6 mt-3 p-4 rounded-lg border-l-4" style={{ 
          borderLeftColor: '#6c5ce7',
          backgroundColor: '#f5f3ff'
        }}>
          <div className="flex items-start gap-2">
            <span className="text-lg">✨</span>
            <div>
              <div className="text-xs font-semibold mb-1.5" style={{ color: '#6c5ce7' }}>Suggestion</div>
              <div className="text-sm text-gray-700 leading-relaxed">{suggestion}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

ContentChunkComponent.displayName = 'ContentChunkComponent';

// ToolCallComponent - Renders a tool call with optional nested sub-agent
const ToolCallComponent: React.FC<ToolCallComponentProps> = React.memo(({ 
  toolCall, 
  tree,
  depth,
  autoExpand, 
  autoCollapse 
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isResultExpanded, setIsResultExpanded] = useState(false);
  const hasChildAgent = Boolean(toolCall.childAgent);
  
  // Dynamic indentation based on depth - each level adds more indentation
  const baseIndent = 20; // base pixels for first level
  const indentIncrement = 16; // additional pixels per level
  const marginLeft = baseIndent + (depth * indentIncrement);
  const paddingLeft = 12;
  
  return (
    <div className="my-1">
      <div className="flex items-center gap-1.5 py-1">
        {hasChildAgent && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="cursor-pointer p-0 border-0 bg-transparent flex items-center justify-center"
          >
            {isExpanded ? 
              <ChevronDown className="w-3 h-3 text-gray-500" /> : 
              <ChevronRight className="w-3 h-3 text-gray-500" />
            }
          </button>
        )}
        
        <Wrench className="w-3 h-3 flex-shrink-0" style={{ color: '#6c5ce7' }} />
        <span className="font-bold text-sm leading-none" style={{ color: '#6c5ce7' }}>
          {toolCall.toolName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      </div>
      
      {isExpanded && hasChildAgent && toolCall.childAgent && (
        <div 
          className="border-l-2 my-2"
          style={{ 
            borderLeftColor: '#6c5ce7',
            marginLeft: `${marginLeft}px`,
            paddingLeft: `${paddingLeft}px`
          }}
        >
          <ExecutionNodeComponent 
            node={toolCall.childAgent}
            tree={tree}
            depth={depth + 1}
            indentSize={baseIndent}
            autoExpand={autoExpand}
            autoCollapse={autoCollapse}
          />
        </div>
      )}
      
      {toolCall.resultEvent && (
        <div style={{ marginLeft: `${marginLeft + paddingLeft}px` }} className="mt-1">
          <button
            onClick={() => setIsResultExpanded(!isResultExpanded)}
            className="flex items-center gap-1.5 cursor-pointer p-0 border-0 bg-transparent text-xs text-gray-500 hover:text-gray-700"
          >
            {isResultExpanded ? 
              <ChevronDown className="w-3 h-3" /> : 
              <ChevronRight className="w-3 h-3" />
            }
            <Info className="w-3 h-3" />
            <span>Tool Details</span>
          </button>
          
          {isResultExpanded && (
            <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200 text-xs">
              {toolCall.resultEvent.payload?.args && (
                <div className="mb-3">
                  <div className="font-semibold text-gray-700 mb-1">Arguments:</div>
                  <pre className="bg-white p-2 rounded border border-gray-200 overflow-x-auto text-xs">
                    {JSON.stringify(toolCall.resultEvent.payload.args, null, 2)}
                  </pre>
                </div>
              )}
              
              {toolCall.resultEvent.payload?.toolResult && (
                <div>
                  <div className="font-semibold text-gray-700 mb-1">Result:</div>
                  <pre className="bg-white p-2 rounded border border-gray-200 overflow-x-auto text-xs">
                    {JSON.stringify(toolCall.resultEvent.payload.toolResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ToolCallComponent.displayName = 'ToolCallComponent';

// ExecutionNodeComponent - Renders a single agent's execution
const ExecutionNodeComponent: React.FC<ExecutionNodeProps> = React.memo(({ 
  node, 
  tree, 
  depth, 
  indentSize, 
  autoExpand, 
  autoCollapse 
}) => {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const prevEventsRef = useRef<StreamEvent[]>([]);
  
  const toggleItemExpand = useCallback((id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }, []);
  
  // Process events into a consolidated message map and create ordered items list
  const processedData = useMemo(() => {
    const messageMap = new Map<string, {
      messageId: string;
      event: StreamEvent;
      thinking: string;
      textContent: string;        // For text chunks: the actual text
      finalAnswer: string;         // For structured chunks: summary text
      structuredContent?: any;     // For structured chunks: the structured data
      suggestion: string;
      orderIndex: number;
    }>();
    
    const toolCallMap = new Map<string, number>(); // toolCallId -> orderIndex
    
    node.events.forEach((e, idx) => {
      if (!e) return;
      
      // Handle chunk events that accumulate into messages
      if ((e.type === 'chunk-text' || 
           e.type === 'chunk-sub-agent-text' || 
           e.type === 'chunk-table' || 
           e.type === 'chunk-code' ||
           e.type === 'chunk-chart') && e.payload?.messageId) {
        
        const msgId = e.payload.messageId;
        const isTextChunk = e.type === 'chunk-text' || e.type === 'chunk-sub-agent-text';
        const isStructuredChunk = e.type === 'chunk-table' || e.type === 'chunk-code' || e.type === 'chunk-chart';
        
        if (!messageMap.has(msgId)) {
          // Create new message entry
          messageMap.set(msgId, {
            messageId: msgId,
            event: e,
            thinking: e.payload.thinking || '',
            textContent: isTextChunk ? (e.payload.content || '') : '',
            finalAnswer: e.payload.finalAnswer || '',
            structuredContent: isStructuredChunk ? e.payload.content : undefined,
            suggestion: e.payload.suggestion || '',
            orderIndex: idx
          });
        } else {
          // Update existing message entry
          const item = messageMap.get(msgId)!;
          
          // Update thinking if present
          if (e.payload.thinking) {
            item.thinking = e.payload.thinking;
          }
          
          // Update content based on chunk type
          if (isTextChunk && e.payload.content) {
            item.textContent = e.payload.content;
          } else if (isStructuredChunk && e.payload.content) {
            item.structuredContent = e.payload.content;
          }
          
          // Update finalAnswer (summary text for structured chunks)
          if (e.payload.finalAnswer) {
            item.finalAnswer = e.payload.finalAnswer;
          }
          
          // Update suggestion if present
          if (e.payload.suggestion) {
            item.suggestion = e.payload.suggestion;
          }
        }
      }
      
      // Track tool call order with index
      if (e.type === 'tool-call-start' && e.payload?.toolCallId) {
        toolCallMap.set(e.payload.toolCallId, idx);
      }
    });
    
    // Create ordered list of items (messages and tool calls interleaved)
    type OrderedItem = 
      | { type: 'message'; messageId: string; data: typeof messageMap extends Map<string, infer T> ? T : never; orderIndex: number }
      | { type: 'toolCall'; toolCallId: string; orderIndex: number };
    
    const orderedItems: OrderedItem[] = [];
    
    // Add all messages
    messageMap.forEach((data, messageId) => {
      orderedItems.push({
        type: 'message',
        messageId,
        data,
        orderIndex: data.orderIndex
      });
    });
    
    // Add all tool calls
    toolCallMap.forEach((orderIndex, toolCallId) => {
      orderedItems.push({
        type: 'toolCall',
        toolCallId,
        orderIndex
      });
    });
    
    // Sort by orderIndex to interleave them
    orderedItems.sort((a, b) => a.orderIndex - b.orderIndex);
    
    return { orderedItems };
  }, [node.events]);

  // Auto-expand/collapse logic
  useEffect(() => {
    if (!autoExpand && !autoCollapse) return;
    
    setExpandedItems(prev => {
      const newExpandedState = { ...prev };
      let hasChanges = false;
      
      processedData.orderedItems.forEach(item => {
        if (item.type === 'message') {
          const msgId = item.messageId;
          const prevEvents = prevEventsRef.current;
          const prevItem = prevEvents.find(e => e.payload?.messageId === msgId);
          
          const hasContent = item.data.textContent || item.data.finalAnswer || item.data.structuredContent;
          
          // New item with only thinking - expand it
          if (autoExpand && !prevItem && item.data.thinking && !hasContent && newExpandedState[msgId] === undefined) {
            newExpandedState[msgId] = true;
            hasChanges = true;
          }
          
          // Content just arrived - collapse it
          if (autoCollapse && prevItem && !prevItem.payload?.content && hasContent) {
            newExpandedState[msgId] = false;
            hasChanges = true;
          }
        }
      });
      
      prevEventsRef.current = node.events;
      
      return hasChanges ? newExpandedState : prev;
    });
  }, [node.events, autoExpand, autoCollapse, processedData.orderedItems]);

  // Render the execution node with interleaved content and tool calls
  return (
    <div>
      {/* Render messages and tool calls in chronological order (interleaved) */}
      {processedData.orderedItems.map((item, idx) => {
        if (item.type === 'message') {
          const msgId = item.messageId;
          const isExpanded = expandedItems[msgId] !== false;
          return (
            <ContentChunkComponent
              key={`msg-${msgId}`}
              event={item.data.event}
              messageId={msgId}
              thinking={item.data.thinking}
              textContent={item.data.textContent}
              finalAnswer={item.data.finalAnswer}
              structuredContent={item.data.structuredContent}
              suggestion={item.data.suggestion}
              isExpanded={isExpanded}
              onToggle={() => toggleItemExpand(msgId)}
            />
          );
        } else if (item.type === 'toolCall') {
          const toolCallId = item.toolCallId;
          const toolCall = node.toolCalls.get(toolCallId);
          if (!toolCall) return null;
          
          return (
            <ToolCallComponent
              key={`tool-${toolCallId}`}
              toolCall={toolCall}
              tree={tree}
              depth={depth}
              autoExpand={autoExpand}
              autoCollapse={autoCollapse}
            />
          );
        }
        return null;
      })}
    </div>
  );
});

ExecutionNodeComponent.displayName = 'ExecutionNodeComponent';

const AssistantMessage: React.FC<AssistantMessageProps> = ({ 
  event,
  isStreaming 
}) => {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  
  // Process incoming event
  useEffect(() => {
    if (!event) return;
    
    // Add event only if it's new (prevent duplicates)
    setEvents(prev => {
      // Check if this exact event already exists
      const isDuplicate = prev.some(e => 
        e.runId === event.runId && 
        e.type === event.type && 
        e.timestamp === event.timestamp &&
        e.payload?.messageId === event.payload?.messageId
      );
      
      if (isDuplicate) {
        return prev;
      }
      
      return [...prev, event];
    });
  }, [event]);

  const buildExecutionTree = useCallback((events: StreamEvent[]): ExecutionTree => {
    const nodes: ExecutionTree = {};
    
    // Step 1: Group events by runId into execution nodes
    events.forEach(event => {
      if (!event?.runId) return;
      
      const runId = event.runId;
      if (!nodes[runId]) {
        nodes[runId] = {
          runId,
          parentId: event.parentId || null,
          toolCallId: event.toolCallId || null,
          agentId: event.agentId || null,
          events: [],
          toolCalls: new Map<string, ToolCallNode>(),
          startTime: null,
          endTime: null
        };
      }
      nodes[runId].events.push(event);
    });
    
    // Step 2: Set start and end times
    Object.values(nodes).forEach(node => {
      const startEvent = node.events.find((e: StreamEvent) => e.type === 'start');
      const finishEvent = node.events.find((e: StreamEvent) => e.type === 'finish');
      node.startTime = startEvent?.timestamp || node.events[0]?.timestamp || null;
      node.endTime = finishEvent?.timestamp || node.events[node.events?.length - 1]?.timestamp || null;
    });
    
    // Step 3: Extract tool calls and match with tool results
    Object.values(nodes).forEach(node => {
      node.events.forEach(event => {
        if (event.type === 'tool-call-start' && event.payload?.toolCallId) {
          const toolCallId = event.payload.toolCallId;
          node.toolCalls.set(toolCallId, {
            toolCallId,
            toolName: event.payload.toolName || 'unknown',
            startEvent: event,
            resultEvent: null,
            childAgent: null
          });
        } else if (event.type === 'tool-result' && event.payload?.toolCallId) {
          const toolCallId = event.payload.toolCallId;
          const toolCall = node.toolCalls.get(toolCallId);
          if (toolCall) {
            toolCall.resultEvent = event;
          }
        }
      });
    });
    
    // Step 4: Link sub-agents to their parent's tool calls using toolCallId
    Object.values(nodes).forEach(node => {
      if (node.parentId && node.toolCallId) {
        const parentNode = nodes[node.parentId];
        if (parentNode) {
          const toolCall = parentNode.toolCalls.get(node.toolCallId);
          if (toolCall) {
            toolCall.childAgent = node;
          }
        }
      }
    });
    
    return nodes;
  }, []);

  const tree = useMemo(() => buildExecutionTree(events), [events, buildExecutionTree]);
  const rootNodes = useMemo(() => Object.values(tree).filter(node => !node.parentId), [tree]);

  if (!events || events?.length === 0) {
    return <span className="streaming-cursor">▋</span>;
  }

  return (
    <div className="space-y-1">
      {rootNodes.map(node => (
        <ExecutionNodeComponent 
          key={node.runId} 
          node={node} 
          tree={tree}
          depth={0}
          indentSize={32}
          autoExpand={true}
          autoCollapse={true}
        />
      ))}
    </div>
  );
};

export default AssistantMessage;

