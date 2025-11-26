import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

// Content script loaded

// Helper to get polaris config from localStorage
const getPolarisConfig = () => {
  try {
    const configStr = localStorage.getItem('polaris-global-config')
    if (!configStr) return null
    
    const config = JSON.parse(configStr)
    return config.state?.config
  } catch (error) {
    return null
  }
}

// Helper to get auth headers from polaris config
const getAuthHeaders = () => {
  const headers: Record<string, string> = {}
  const config = getPolarisConfig()
  
  if (config?.apiConfig?.defaultHeaders) {
    const { authtoken, organization_uid } = config.apiConfig.defaultHeaders
    
    if (authtoken) {
      headers['authtoken'] = authtoken
    }
    if (organization_uid) {
      headers['organization_uid'] = organization_uid
    }
  }
  
  return headers
}

// Helper to get global context from polaris config
const getGlobalContext = () => {
  const config = getPolarisConfig()
  return config?.globalContext || null
}

// Expose test function to verify content script is working
(window as any).__polarisContentScriptTest = () => {
  return {
    ready: true,
    authHeaders: getAuthHeaders(),
    globalContext: getGlobalContext()
  }
}

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Respond to ping requests
  if (request.type === 'PING') {
    sendResponse({ ready: true })
    return
  }
  
  if (request.type === 'FETCH_FROM_TAB') {
    const { url, options } = request.payload
    
    // Auto-populate auth headers from tab context
    const authHeaders = getAuthHeaders()
    
    options.headers = {
      ...options.headers,
      ...authHeaders
    }
    
    // Get global context and add to request body
    const globalContext = getGlobalContext()
    if (globalContext && options.body) {
      try {
        const bodyData = JSON.parse(options.body)
        bodyData.globalContext = globalContext
        options.body = JSON.stringify(bodyData)
      } catch (error) {
        console.error("Failed to add globalContext:", error)
      }
    }
    
    // Make fetch call from tab's context
    fetch(url, options)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        // Handle streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error("No response body")
        }

        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            chrome.runtime.sendMessage({
              type: 'STREAM_COMPLETE',
              requestId: request.requestId
            })
            break
          }
          
          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          
          // Parse SSE stream events
          const lines = buffer.split('\n')
          buffer = lines.pop() || ""
          
          for (const line of lines) {
            if (line.trim() === "" || !line.startsWith('data:')) continue
            
            try {
              const jsonStr = line.slice(5).trim()
              const event = JSON.parse(jsonStr)
              
              // Send each event back to sidepanel
              chrome.runtime.sendMessage({
                type: 'STREAM_EVENT',
                requestId: request.requestId,
                event: event
              })
            } catch (e) {
              console.error('Failed to parse stream event:', e)
            }
          }
        }
      })
      .catch((error) => {
        chrome.runtime.sendMessage({
          type: 'STREAM_ERROR',
          requestId: request.requestId,
          error: error.message
        })
      })

    // Don't return true - we use chrome.runtime.sendMessage for responses
  }
})

