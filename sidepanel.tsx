import { useState, useEffect, useRef } from "react"
import AssistantMessage from "./components/AssistantMessage"
import "./style.css"

const generateThreadId = () => {
  return `thread_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

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

interface Message {
  role: "user" | "assistant"
  content: string
  currentEvent?: StreamEvent
  isStreaming?: boolean
}

function SidePanel() {
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId] = useState(generateThreadId())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentRequestIdRef = useRef<string | null>(null)
  const [contentScriptReady, setContentScriptReady] = useState<boolean | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Check if content script is ready on mount
  useEffect(() => {
    const checkContentScript = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab.id) {
          setContentScriptReady(false)
          return
        }
        
        await chrome.tabs.sendMessage(tab.id, { type: 'PING' })
        setContentScriptReady(true)
      } catch (error) {
        setContentScriptReady(false)
      }
    }
    
    checkContentScript()
    
    // Recheck every 2 seconds if not ready
    const interval = setInterval(() => {
      if (contentScriptReady === false) {
        checkContentScript()
      }
    }, 2000)
    
    return () => clearInterval(interval)
  }, [contentScriptReady])

  useEffect(() => {
    // Listen for messages from content script
    const messageListener = (request: any) => {
      if (request.requestId !== currentRequestIdRef.current) return

      if (request.type === 'STREAM_EVENT') {
        const event = request.event
        
        // Pass single event to the assistant message
        setMessages(prev => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.currentEvent = event
            // Keep streaming true - only STREAM_COMPLETE should end it
          }
          
          return updated
        })
      } else if (request.type === 'STREAM_ERROR') {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error: ${request.error}`,
            isStreaming: false
          }
          return updated
        })
        setIsLoading(false)
        currentRequestIdRef.current = null
      } else if (request.type === 'STREAM_COMPLETE') {
        // Stream has completely ended (fetch done)
        setMessages(prev => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.isStreaming = false
          }
          
          return updated
        })
        setIsLoading(false)
        currentRequestIdRef.current = null
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    return () => chrome.runtime.onMessage.removeListener(messageListener)
  }, [])

  const handleClose = () => {
    window.close()
  }

  const handleSendMessage = async () => {
    if (!message.trim()) return

    const userMessage = message.trim()
    setMessage("")
    setIsLoading(true)

    // Add user message to chat
    setMessages(prev => [...prev, { role: "user", content: userMessage }])

    // Add placeholder for assistant message
    setMessages(prev => [...prev, { role: "assistant", content: "", isStreaming: true }])

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      
      if (!tab.id) {
        throw new Error("No active tab found")
      }

      // Generate request ID
      const requestId = generateRequestId()
      currentRequestIdRef.current = requestId

      const apiUrl = "/agents-api/run/system-agent/dxp-agent?streamWithReasoning=true"
      
      // Check if content script is ready
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'PING' })
      } catch (pingError) {
        throw new Error("Content script not loaded. Please refresh the page and try again.")
      }
      
      // Send message to content script
      // Note: Content script will auto-populate:
      // - Auth headers (authtoken, organization_uid) from polaris-global-config
      // - Global context from polaris-global-config
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'FETCH_FROM_TAB',
          requestId: requestId,
          payload: {
            url: apiUrl,
            options: {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              credentials: "include",
              body: JSON.stringify({
                threadId: threadId,
                prompt: userMessage
              })
            }
          }
        })
      } catch (sendError) {
        throw new Error("Content script not loaded. Please refresh the page and try again.")
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      let userFriendlyMessage = errorMessage
      if (errorMessage.includes("Content script not loaded")) {
        userFriendlyMessage = "⚠️ Please refresh the page and try again.\n\nThe Polaris extension needs to initialize on this page first."
      }
      
      // Update the last message with error
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: "assistant",
          content: userFriendlyMessage,
          isStreaming: false
        }
        return updated
      })
      setIsLoading(false)
      currentRequestIdRef.current = null
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="polaris-container sidepanel">
      <div className="polaris-header">
        <div className="polaris-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12.7 6.705c.285-.716 1.315-.716 1.599 0l.026.074 1.026 3.37 3.37 1.026c.815.248.815 1.402 0 1.65l-3.37 1.026-1.026 3.37c-.248.815-1.402.815-1.65 0l-1.027-3.37-3.369-1.026c-.815-.248-.815-1.402 0-1.65l3.37-1.027 1.026-3.369.026-.074zm-.015 3.905a.863.863 0 01-.575.575L9.433 12l2.678.815c.241.073.436.247.537.474l.038.1.815 2.679.815-2.679.037-.1a.863.863 0 01.537-.474L17.568 12l-2.679-.815a.863.863 0 01-.574-.575L13.5 7.933l-.815 2.678z" fill="#6c8ef5"/>
            <path d="M7.357 3.433a.15.15 0 01.285 0l.577 1.753a.15.15 0 00.095.095l1.753.576a.15.15 0 010 .285l-1.753.577a.15.15 0 00-.095.095l-.577 1.753a.15.15 0 01-.285 0l-.576-1.753a.15.15 0 00-.095-.095l-1.753-.577a.15.15 0 010-.285l1.753-.576a.15.15 0 00.095-.095l.576-1.753z" fill="#6c8ef5"/>
            <path d="M7.357 15.433a.15.15 0 01.285 0l.577 1.753a.15.15 0 00.095.095l1.753.577a.15.15 0 010 .284l-1.753.577a.15.15 0 00-.095.095l-.577 1.753a.15.15 0 01-.285 0l-.576-1.753a.15.15 0 00-.095-.095l-1.753-.577a.15.15 0 010-.284l1.753-.577a.15.15 0 00.095-.095l.576-1.753z" fill="#6c8ef5"/>
          </svg>
        </div>
        <h1 className="polaris-title">Polaris</h1>
        {contentScriptReady !== null && (
          <div style={{ 
            fontSize: '11px', 
            marginLeft: 'auto', 
            marginRight: '8px',
            color: contentScriptReady ? '#10b981' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              backgroundColor: contentScriptReady ? '#10b981' : '#ef4444',
              display: 'inline-block'
            }} />
            {contentScriptReady ? 'Ready' : 'Not Ready'}
          </div>
        )}
        <button className="close-btn" onClick={handleClose}>×</button>
      </div>

      <div className="polaris-content">
        {messages.length === 0 ? (
          <div className="intro-section">
            <div className="intro-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12.7 6.705c.285-.716 1.315-.716 1.599 0l.026.074 1.026 3.37 3.37 1.026c.815.248.815 1.402 0 1.65l-3.37 1.026-1.026 3.37c-.248.815-1.402.815-1.65 0l-1.027-3.37-3.369-1.026c-.815-.248-.815-1.402 0-1.65l3.37-1.027 1.026-3.369.026-.074zm-.015 3.905a.863.863 0 01-.575.575L9.433 12l2.678.815c.241.073.436.247.537.474l.038.1.815 2.679.815-2.679.037-.1a.863.863 0 01.537-.474L17.568 12l-2.679-.815a.863.863 0 01-.574-.575L13.5 7.933l-.815 2.678z" fill="#6c8ef5"/>
                <path d="M7.357 3.433a.15.15 0 01.285 0l.577 1.753a.15.15 0 00.095.095l1.753.576a.15.15 0 010 .285l-1.753.577a.15.15 0 00-.095.095l-.577 1.753a.15.15 0 01-.285 0l-.576-1.753a.15.15 0 00-.095-.095l-1.753-.577a.15.15 0 010-.285l1.753-.576a.15.15 0 00.095-.095l.576-1.753z" fill="#6c8ef5"/>
                <path d="M7.357 15.433a.15.15 0 01.285 0l.577 1.753a.15.15 0 00.095.095l1.753.577a.15.15 0 010 .284l-1.753.577a.15.15 0 00-.095.095l-.577 1.753a.15.15 0 01-.285 0l-.576-1.753a.15.15 0 00-.095-.095l-1.753-.577a.15.15 0 010-.284l1.753-.577a.15.15 0 00.095-.095l.576-1.753z" fill="#6c8ef5"/>
              </svg>
            </div>
            <h2 className="intro-title">Introducing Polaris</h2>
            <p className="intro-subtitle">
              A virtual co-worker helping you get more done across Contentstack.
            </p>
            {contentScriptReady === false && (
              <div className="intro-alert">
                <div className="intro-alert-icon">⚠️</div>
                <div>
                  <div className="intro-alert-title">Please refresh the page</div>
                  <p className="intro-alert-text">
                    Polaris needs to initialize on this page first. Refresh the current tab and reopen the sidepanel.
                  </p>
                </div>
              </div>
            )}
            {contentScriptReady === true && (
              <p className="intro-suggestion">Try asking, "What can you do?"</p>
            )}
          </div>
        ) : (
          <div className="messages-container">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.role}`}>
                {msg.role === "assistant" && (
                  <div className="message-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12.7 6.705c.285-.716 1.315-.716 1.599 0l.026.074 1.026 3.37 3.37 1.026c.815.248.815 1.402 0 1.65l-3.37 1.026-1.026 3.37c-.248.815-1.402.815-1.65 0l-1.027-3.37-3.369-1.026c-.815-.248-.815-1.402 0-1.65l3.37-1.027 1.026-3.369.026-.074zm-.015 3.905a.863.863 0 01-.575.575L9.433 12l2.678.815c.241.073.436.247.537.474l.038.1.815 2.679.815-2.679.037-.1a.863.863 0 01.537-.474L17.568 12l-2.679-.815a.863.863 0 01-.574-.575L13.5 7.933l-.815 2.678z" fill="url(#paint0_linear)"/>
                      <path d="M7.357 3.433a.15.15 0 01.285 0l.577 1.753a.15.15 0 00.095.095l1.753.576a.15.15 0 010 .285l-1.753.577a.15.15 0 00-.095.095l-.577 1.753a.15.15 0 01-.285 0l-.576-1.753a.15.15 0 00-.095-.095l-1.753-.577a.15.15 0 010-.285l1.753-.576a.15.15 0 00.095-.095l.576-1.753z" fill="url(#paint1_linear)"/>
                      <path d="M7.357 15.433a.15.15 0 01.285 0l.577 1.753a.15.15 0 00.095.095l1.753.577a.15.15 0 010 .284l-1.753.577a.15.15 0 00-.095.095l-.577 1.753a.15.15 0 01-.285 0l-.576-1.753a.15.15 0 00-.095-.095l-1.753-.577a.15.15 0 010-.284l1.753-.577a.15.15 0 00.095-.095l.576-1.753z" fill="url(#paint2_linear)"/>
                      <defs>
                        <linearGradient id="paint0_linear" x1="3.541" y1="2.635" x2="25.745" y2="15.114" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#49A466"/>
                          <stop offset="0.5" stopColor="#6F83F2"/>
                          <stop offset="1" stopColor="#8A3DFF"/>
                        </linearGradient>
                        <linearGradient id="paint1_linear" x1="3.541" y1="2.635" x2="25.745" y2="15.114" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#49A466"/>
                          <stop offset="0.5" stopColor="#6F83F2"/>
                          <stop offset="1" stopColor="#8A3DFF"/>
                        </linearGradient>
                        <linearGradient id="paint2_linear" x1="3.541" y1="2.635" x2="25.745" y2="15.114" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#49A466"/>
                          <stop offset="0.5" stopColor="#6F83F2"/>
                          <stop offset="1" stopColor="#8A3DFF"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  )}
                  <div className="message-text">
                    {msg.role === "assistant" ? (
                      <AssistantMessage 
                        event={msg.currentEvent || null}
                        isStreaming={msg.isStreaming}
                      />
                    ) : (
                      <span className="text-white">{msg.content}</span>
                    )}
                  </div>
                  {msg.role === "user" && (
                  <div className="message-icon">
                    <svg width="20" height="20" viewBox="0 0 122.9 122.9" xmlns="http://www.w3.org/2000/svg">
                      <g>
                        <path d="M61.4,0c17,0,32.3,6.9,43.4,18c11.1,11.1,18,26.5,18,43.4c0,17-6.9,32.3-18,43.4c-11.1,11.1-26.5,18-43.4,18 s-32.3-6.9-43.4-18C6.9,93.8,0,78.4,0,61.4c0-17,6.9-32.3,18-43.4C29.1,6.9,44.5,0,61.4,0L61.4,0z M41.3,54.3c-1.1,0-2,0.3-2.5,0.7 c-0.3,0.2-0.6,0.5-0.7,0.8c-0.2,0.4-0.3,0.8-0.2,1.4c0,1.5,0.8,3.5,2.4,5.8l0,0l0,0l5,8c2,3.2,4.1,6.5,6.8,8.9 c2.5,2.3,5.6,3.9,9.6,3.9c4.4,0,7.6-1.6,10.2-4.1c2.7-2.5,4.9-6,7-9.5l5.7-9.3c1.1-2.4,1.4-4,1.2-5c-0.1-0.6-0.8-0.8-1.8-0.9 c-0.2,0-0.5,0-0.7,0c-0.3,0-0.5,0-0.8,0c-0.2,0-0.3,0-0.4,0c-0.5,0-1,0-1.6-0.1l1.9-8.6c-14.4,2.3-25.2-8.4-40.4-2.1L43,54.4 C42.4,54.4,41.8,54.4,41.3,54.3L41.3,54.3L41.3,54.3L41.3,54.3z M18.8,95.7c7.1-2.5,19.6-3.8,25.4-7.7c1-1.3,2.1-2.9,3.1-4.3 c0.6-0.9,1.1-1.7,1.6-2.3c0.1-0.1,0.2-0.2,0.3-0.3c-2.4-2.5-4.4-5.5-6.3-8.5l-5-8C36,61.8,35,59.3,35,57.3c0-1,0.1-1.9,0.5-2.6 c0.4-0.8,1-1.5,1.7-2c0.4-0.2,0.8-0.5,1.2-0.6c-0.3-4.3-0.4-9.8-0.2-14.4c0.1-1.1,0.3-2.2,0.6-3.3c1.3-4.6,4.5-8.3,8.5-10.8 c1.4-0.9,2.9-1.6,4.6-2.2c2.9-1.1,1.5-5.5,4.7-5.6c7.5-0.2,19.8,6.2,24.6,11.4c2.8,3,4.6,7,4.9,12.3l-0.3,13.1l0,0 c1.4,0.4,2.3,1.3,2.7,2.7c0.4,1.6,0,3.8-1.4,6.9l0,0c0,0.1-0.1,0.1-0.1,0.2l-5.7,9.4c-2.2,3.6-4.5,7.3-7.5,10.1L73.7,82l0,0 c0.4,0.5,0.8,1.1,1.2,1.7c0.8,1.1,1.6,2.4,2.5,3.6c5.3,4.5,19.3,5.9,26.7,8.6c7.6-9.4,12.1-21.4,12.1-34.4c0-15.1-6.1-28.8-16-38.7 c-9.9-9.9-23.6-16-38.7-16s-28.8,6.1-38.7,16c-9.9,9.9-16,23.6-16,38.7C6.7,74.4,11.2,86.3,18.8,95.7L18.8,95.7z M77,90.5 c-1.4-1.6-2.8-3.7-4.1-5.5c-0.4-0.5-0.7-1.1-1.1-1.5c-2.7,2-6,3.3-10.3,3.3c-4.5,0-8-1.6-10.9-4.1c0,0,0,0.1-0.1,0.1 c-0.5,0.7-1,1.4-1.6,2.3c-1.1,1.6-2.3,3.3-3.4,4.8C45.6,100,71.1,106,77,90.5L77,90.5z" fill="#6b7280"/>
                      </g>
                    </svg>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="polaris-footer">
        <div className="input-container">
          <input
            type="text"
            className="message-input"
            placeholder={contentScriptReady === false ? "Please refresh the page first..." : "Type your message..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading || contentScriptReady === false}
          />
          <button 
            className="send-btn" 
            onClick={handleSendMessage}
            disabled={isLoading || !message.trim() || contentScriptReady === false}
          >
            {isLoading ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="loading-spinner">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3" />
                <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 10L17 3L11 17L9 12L3 10Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
        <div className="footer-help">
          <span className="help-text">
            💡 <span style={{ fontStyle: 'italic' }}>Not sure what to ask?</span> <a href="#" className="help-link">See what I can do</a>
          </span>
          <span className="char-count">{message.length}/2000</span>
        </div>
      </div>
    </div>
  )
}

export default SidePanel

