// Zentavos AI LLM Client Module
// Handles integration with the LLM provider (Groq/vLLM), including streaming, tool calls, and response assembly.

import Groq from "groq-sdk";
import { formatFinancialResponse } from "./responseFormatter.js";

// Configuration constants for robustness
const MAX_RETRIES = 3;
const JSON_CLEANUP_TIMEOUT = 5000; // 5 seconds
const HALLUCINATION_CHECK_TIMEOUT = 10000; // 10 seconds

/**
 * Attempts to clean and parse malformed JSON responses
 * @param {string} response - The potentially malformed JSON response
 * @returns {object|null} Parsed JSON object or null if cleaning fails
 */
function cleanAndParseJSON(response) {
  if (!response || typeof response !== 'string') {
    return null;
  }

  try {
    // First attempt: direct parsing
    return JSON.parse(response);
  } catch (firstError) {
    console.warn('[AI][cleanAndParseJSON] First parsing attempt failed:', firstError.message);
  }

  try {
    // Second attempt: remove trailing characters after last }
    let cleaned = response;
    const lastBraceIndex = cleaned.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
      cleaned = cleaned.substring(0, lastBraceIndex + 1);
    }
    
    // Remove leading characters before first {
    const firstBraceIndex = cleaned.indexOf('{');
    if (firstBraceIndex !== -1) {
      cleaned = cleaned.substring(firstBraceIndex);
    }
    
    return JSON.parse(cleaned);
  } catch (secondError) {
    console.warn('[AI][cleanAndParseJSON] Second parsing attempt failed:', secondError.message);
  }

  try {
    // Third attempt: find JSON-like content between braces
    const braceMatches = response.match(/\{.*\}/gs);
    if (braceMatches && braceMatches.length > 0) {
      // Try the longest match first
      const sortedMatches = braceMatches.sort((a, b) => b.length - a.length);
      for (const match of sortedMatches) {
        try {
          return JSON.parse(match);
        } catch (parseError) {
          continue;
        }
      }
    }
  } catch (thirdError) {
    console.warn('[AI][cleanAndParseJSON] Third parsing attempt failed:', thirdError.message);
  }

  try {
    // Fourth attempt: aggressive cleaning for control characters
    let cleaned = response;
    
    // Remove common control characters that break JSON
    cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    // Remove any trailing text after the last complete JSON object
    const jsonObjects = [];
    let braceCount = 0;
    let startIndex = -1;
    
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (braceCount === 0) {
          startIndex = i;
        }
        braceCount++;
      } else if (cleaned[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          const jsonCandidate = cleaned.substring(startIndex, i + 1);
          try {
            const parsed = JSON.parse(jsonCandidate);
            jsonObjects.push(parsed);
          } catch (e) {
            // Skip invalid JSON
          }
          startIndex = -1;
        }
      }
    }
    
    // Return the last valid JSON object found
    if (jsonObjects.length > 0) {
      console.log('[AI][cleanAndParseJSON] Found valid JSON after aggressive cleaning');
      return jsonObjects[jsonObjects.length - 1];
    }
    
  } catch (fourthError) {
    console.warn('[AI][cleanAndParseJSON] Fourth parsing attempt failed:', fourthError.message);
  }

  return null;
}

/**
 * Validates if LLM response matches tool results to prevent hallucinations
 * @param {string|object} llmResponse - The LLM response to validate
 * @param {Array} toolResults - Array of tool results to validate against
 * @returns {object} Validation result with isValid and reason
 */
export function validateResponseAgainstToolResults(llmResponse, toolResults) {
  try {
    // Special case: no tool results - this is valid for generic responses
    if (!toolResults || toolResults.length === 0) {
      return { 
        isValid: true, 
        reason: "No tool results to validate against - generic response allowed",
        response: {
          text: llmResponse,
          data: null,
          error: false,
          errorMessage: null
        }
      };
    }

    if (!llmResponse) {
      return { 
        isValid: false, 
        reason: "No LLM response provided",
        response: {
          text: "I encountered an issue processing your request. Please try again.",
          data: null,
          error: true,
          errorMessage: "No response received from AI service"
        }
      };
    }

    // Parse LLM response if it's a string
    let parsedResponse;
    if (typeof llmResponse === 'string') {
      try {
        // First try to parse as JSON
        parsedResponse = JSON.parse(llmResponse);
      } catch (e) {
        // If not JSON, treat as plain text response
        parsedResponse = {
          text: llmResponse,
          data: null
        };
      }
    } else {
      parsedResponse = llmResponse;
    }

    // Ensure we have a text field
    if (!parsedResponse.text && typeof parsedResponse !== 'string') {
      parsedResponse.text = "I processed your request but encountered an issue formatting the response.";
    }

    // If response is just a string, wrap it in proper structure
    if (typeof parsedResponse === 'string') {
      parsedResponse = {
        text: parsedResponse,
        data: null
      };
    }

    // CRITICAL: Strict validation to prevent hallucinations
    const llmData = parsedResponse.data;
    
    // Special case: if tool results exist but LLM data is empty, this is a hallucination
    if (toolResults.length > 0 && (llmData === null || llmData === undefined || 
        (Array.isArray(llmData) && llmData.length === 0) || 
        (typeof llmData === 'object' && Object.keys(llmData).length === 0))) {
      return { isValid: false, reason: "LLM response has empty data despite having tool results" };
    }

    // For each tool result, perform strict validation
    for (const toolResult of toolResults) {
      if (toolResult && typeof toolResult === 'object') {
        
        // Case 1: Tool result is an array
        if (Array.isArray(toolResult)) {
          if (!Array.isArray(llmData)) {
            return { isValid: false, reason: "Tool result is array but LLM response data is not array" };
          }
          
          // Check if all tool result items are present in LLM response
          for (const toolItem of toolResult) {
            if (toolItem && typeof toolItem === 'object') {
              const found = llmData.some(llmItem => {
                if (!llmItem || typeof llmItem !== 'object') return false;
                
                // Check if key values match exactly
                for (const [key, value] of Object.entries(toolItem)) {
                  if (llmItem[key] !== value) {
                    return false;
                  }
                }
                return true;
              });
              
              if (!found) {
                return { 
                  isValid: false, 
                  reason: `Tool result item not found in LLM response: ${JSON.stringify(toolItem).substring(0, 100)}...` 
                };
              }
            }
          }
          
          // CRITICAL: Check if LLM response contains extra items not in tool results
          if (llmData.length > toolResult.length) {
            return { 
              isValid: false, 
              reason: `LLM response contains ${llmData.length} items but tool results only have ${toolResult.length} items - possible hallucination` 
            };
          }
          
          // CRITICAL: Check if any LLM item is not in tool results (prevents partial hallucinations)
          for (const llmItem of llmData) {
            if (llmItem && typeof llmItem === 'object') {
              const foundInToolResults = toolResult.some(toolItem => {
                if (!toolItem || typeof toolItem !== 'object') return false;
                
                // Check if all key-value pairs match
                for (const [key, value] of Object.entries(toolItem)) {
                  if (llmItem[key] !== value) {
                    return false;
                  }
                }
                return true;
              });
              
              if (!foundInToolResults) {
                return { 
                  isValid: false, 
                  reason: `LLM response contains item not in tool results: ${JSON.stringify(llmItem).substring(0, 100)}... - possible hallucination` 
                };
              }
            }
          }
        }
        // Case 2: Tool result is an object
        else {
          if (Array.isArray(llmData)) {
            // Check if tool result object is contained in any array item
            const found = llmData.some(llmItem => {
              if (!llmItem || typeof llmItem !== 'object') return false;
              
              for (const [key, value] of Object.entries(toolResult)) {
                if (llmItem[key] !== value) {
                  return false;
                }
              }
              return true;
            });
            
            if (!found) {
              return { 
                isValid: false, 
                reason: `Tool result object not found in LLM response array` 
              };
            }
          } else if (typeof llmData === 'object') {
            // Check if tool result object matches LLM response data object
            for (const [key, value] of Object.entries(toolResult)) {
              if (llmData[key] !== value) {
                return { 
                  isValid: false, 
                  reason: `Tool result value mismatch: ${key}=${value} vs LLM ${key}=${llmData[key]}` 
                };
              }
            }
          } else {
            return { isValid: false, reason: "Tool result is object but LLM response data is not object" };
          }
        }
      }
    }

    // Additional check: ensure LLM response doesn't contain extra data that wasn't in tool results
    if (Array.isArray(llmData) && Array.isArray(toolResults[0])) {
      const toolResultKeys = new Set();
      const llmDataKeys = new Set();
      
      // Collect all unique keys from tool results
      for (const toolItem of toolResults[0]) {
        if (toolItem && typeof toolItem === 'object') {
          Object.keys(toolItem).forEach(key => toolResultKeys.add(key));
        }
      }
      
      // Collect all unique keys from LLM response
      for (const llmItem of llmData) {
        if (llmItem && typeof llmItem === 'object') {
          Object.keys(llmItem).forEach(key => llmDataKeys.add(key));
        }
      }
      
      // Check for suspicious extra keys that might indicate hallucination
      const suspiciousKeys = Array.from(llmDataKeys).filter(key => !toolResultKeys.has(key));
      if (suspiciousKeys.length > 0) {
        console.warn(`[Validation] Suspicious extra keys found: ${suspiciousKeys.join(', ')}`);
      }
    }

    return { isValid: true, reason: "Response validated against tool results" };
  } catch (error) {
    return { isValid: false, reason: `Validation error: ${error.message}` };
  }
}

/**
 * Calls the LLM with the provided parameters and handles tool calls and streaming responses.
 * @param {object} params - LLM call parameters (apiKey, model, messages, tools, toolFunctions, uid, aiController).
 * @returns {Promise<string>} The complete LLM response as a string.
 */
export async function callLLM({
  apiKey,
  model,
  messages,
  tools,
  toolFunctions,
  uid,
  aiController,
}) {
  // Initialize logging context with safe defaults
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date().toISOString();
  
  // Safely calculate message stats
  const messageStats = (() => {
    try {
      // Ensure messages is an array
      const validMessages = Array.isArray(messages) ? messages : [];
      
      // Calculate total length of valid messages
      const totalLength = validMessages.reduce((total, msg) => {
        if (!msg || !msg.content) return total;
        return total + (typeof msg.content === 'string' ? msg.content.length : 0);
      }, 0);
      
      // Calculate average length
      const messagesWithContent = validMessages.filter(msg => msg && msg.content);
      const averageLength = messagesWithContent.length > 0 ? Math.round(totalLength / messagesWithContent.length) : 0;
      
      // Count message types
      const types = validMessages.reduce((acc, msg) => {
        if (msg && msg.role) {
          acc[msg.role] = (acc[msg.role] || 0) + 1;
        }
        return acc;
      }, {});
      
      return {
        total: validMessages.length,
        totalLength,
        averageLength,
        types
      };
    } catch (error) {
      console.error('Error calculating message stats:', error);
      return {
        total: 0,
        totalLength: 0,
        averageLength: 0,
        types: {}
      };
    }
  })();
  
  // Safely calculate tool stats
  const toolStats = (() => {
    try {
      // Ensure tools is an array
      const validTools = Array.isArray(tools) ? tools : [];
      
      // Extract valid tool names
      const validToolNames = validTools
        .filter(t => t && t.function && typeof t.function.name === 'string')
        .map(t => t.function.name);
      
      return {
        available: validTools.length,
        names: validToolNames,
        validCount: validToolNames.length
      };
    } catch (error) {
      console.error('Error calculating tool stats:', error);
      return {
        available: 0,
        names: [],
        validCount: 0
      };
    }
  })();
  
  // Create a logger function that includes context
  const logWithContext = (level, stage, message, details = {}) => {
    // Ensure all fields have default values
    const logData = {
      requestId: requestId || 'unknown',
      timestamp: timestamp || new Date().toISOString(),
      userId: uid || 'anonymous',
      model: model || 'unknown',
      stage: stage || 'unknown',
      messageStats: messageStats || {
        total: 0,
        totalLength: 0,
        averageLength: 0,
        types: {}
      },
      toolStats: toolStats || {
        available: 0,
        names: [],
        validCount: 0
      },
      ...details
    };

    switch (level) {
      case 'info':
        console.log(`\n🔵 [LLM Process] ====== ${message} ======`, logData);
        break;
      case 'warn':
        console.warn(`\n⚠️ [LLM Process] ====== ${message} ======`, logData);
        break;
      case 'error':
        console.error(`\n❌ [LLM Process] ====== ${message} ======`, logData);
        break;
      default:
        console.log(`\n[LLM Process] ====== ${message} ======`, logData);
    }
  };

  // Log request start
  logWithContext('info', 'start', 'REQUEST START', {
    latestMessage: messages[messages.length - 1]?.content?.substring(0, 100) + '...'
  });

  const groqClient = new Groq({ apiKey });
  
  // Log request configuration
  logWithContext('info', 'config', 'REQUEST CONFIG', {
    config: {
      model,
      temperature: 0.0,
      stream: true,
      maxTokens: 4096,
      requestTimeout: 120000
    },
    messagePreview: {
      first: messages[0]?.content?.substring(0, 200) + '...',
      last: messages[messages.length - 1]?.content?.substring(0, 200) + '...'
    }
  });

  // Log validation warnings for message length
  if (messageStats.totalLength > 32000) {
    logWithContext('warn', 'validation', 'VALIDATION WARNING', {
      warning: 'Total message length exceeds recommended limit',
      details: {
        currentLength: messageStats.totalLength,
        recommendedMax: 32000,
        overagePercent: Math.round((messageStats.totalLength / 32000 - 1) * 100),
        messageCount: messageStats.total,
        averageLength: messageStats.averageLength
      }
    });
  }
  
  let response;
  try {
    logWithContext('info', 'request', 'SENDING REQUEST TO GROQ');
    
    response = await groqClient.chat.completions.create({
      model,
      messages,
      temperature: 0.0,
      stream: true,
      tools,
      tool_choice: "auto",
    });
    
    logWithContext('info', 'response', 'GROQ RESPONSE RECEIVED', {
      status: 'success',
      hasResponse: !!response
    });
  } catch (apiError) {
    logWithContext('error', 'error', 'GROQ API ERROR', {
      error: {
        message: apiError.message,
        code: apiError.code,
        type: apiError.type,
        stack: apiError.stack
      }
    });
    
    // Check if it's a tool_use_failed error
    if (apiError.error?.code === 'tool_use_failed') {
      console.error('[LLM Process] Tool use failed error detected. This usually means the LLM is confused about the response format.');
      console.error('[LLM Process] Failed generation:', apiError.error.failed_generation);
      
      // Return a helpful error message
      return JSON.stringify({
        text: "I encountered an issue processing your request. The AI model got confused about how to respond. Please try rephrasing your question or contact support if the problem persists.",
        data: {},
        error: true,
        errorDetails: "Tool use failed - LLM response format confusion",
        source: 'groq_api_error'
      });
    }
    
    // Handle other API errors
    const errorMessage = apiError.error?.message || apiError.message || 'Unknown Groq API error';
    console.error('[LLM Process] Groq API error details:', errorMessage);
    
    return JSON.stringify({
      text: "I encountered a technical issue while processing your request. Please try again in a moment or contact support if the problem persists.",
      data: {},
      error: true,
      errorDetails: errorMessage,
      source: 'groq_api_error'
    });
  }

  let finalMessages = [...messages];
  let toolCallsRemaining = true;
  let completeResponse = "";
  let iteration = 0;
  const MAX_ITER = 30; // Permite mais iterações para modelos que fazem muitos raciocínios/tool calls
  let receivedContent = false;
  let lastToolResult = null; // Store the last tool result for post-processing

  // Helper: Run a tool function with a timeout to prevent hanging
  async function runToolWithTimeout(fn, args, timeoutMs = 15000) {
    return Promise.race([
      fn(args),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tool call timed out')), timeoutMs))
    ]);
  }

  while (toolCallsRemaining && iteration < MAX_ITER) {
    toolCallsRemaining = false;
    iteration++;
    
    console.log(`[AI][callLLM] Starting iteration ${iteration}`);

    for await (const chunk of response) {
      const delta = chunk.choices?.[0]?.delta;
      const finishReason = chunk.choices?.[0]?.finish_reason;
      
      // Log finish reason if present
      if (finishReason) {
        console.log(`[AI][callLLM] Finish reason detected:`, finishReason);
        console.log(`[AI][callLLM] Final response length:`, completeResponse.length);
        console.log(`[AI][callLLM] Final response preview:`, completeResponse.substring(0, 300) + '...');
      }

      // Handle content chunks - accumulate the complete response
      if (delta?.content) {
        // Check for malformed content that might cause issues
        const content = delta.content;
        if (content.includes('<tool-use>') || content.includes('</tool-use>')) {
          console.warn('[AI][callLLM] 🚨 MALFORMED CONTENT DETECTED - contains tool-use markers');
          console.warn('[AI][callLLM] Content with tool-use markers:', content);
          
          // Skip this content chunk as it's malformed
          continue;
        }
        
        completeResponse += content;
        receivedContent = true;
        console.log(`[AI][callLLM] Received content chunk:`, content.substring(0, 100) + '...');
        console.log(`[AI][callLLM] Content chunk length:`, content.length);
        console.log(`[AI][callLLM] Total accumulated response length:`, completeResponse.length);
      }

      // Handle tool calls
      if (delta?.tool_calls) {
        toolCallsRemaining = true;
        
        // Log tool call detection with context
        console.log('\n🔧 [LLM Process] ====== TOOL CALLS DETECTED ======', {
          ...logContext,
          stage: 'tool_calls',
          tools: delta.tool_calls.map(tc => ({
            name: tc.function?.name,
            argumentsLength: tc.function?.arguments?.length || 0
          }))
        });
        
        // Send progress message to user
        if (aiController && uid) {
          aiController.sendToUser(uid, { 
            text: 'Processing your request...', 
            progress: true 
          });
        }
        
        for (const toolCall of delta.tool_calls) {
          const toolContext = {
            ...logContext,
            stage: 'tool_execution',
            tool: {
              name: toolCall.function?.name,
              startTime: Date.now()
            }
          };
          
          try {
            if (!toolCall.function) {
              console.warn('\n⚠️ [LLM Process] ====== TOOL CALL WARNING ======', {
                ...toolContext,
                warning: 'Tool call missing function definition'
              });
              continue;
            }
            
            const fnName = toolCall.function?.name;
            if (!fnName) {
              console.warn('\n⚠️ [LLM Process] ====== TOOL CALL WARNING ======', {
                ...toolContext,
                warning: 'Tool call missing function name'
              });
              continue;
            }
            
            let args = {};
            try {
              args = toolCall.function.arguments
                ? JSON.parse(toolCall.function.arguments)
                : {};
                
              // Log successful argument parsing
              console.log('\n🔍 [LLM Process] ====== TOOL ARGS PARSED ======', {
                ...toolContext,
                args: {
                  parsed: true,
                  keys: Object.keys(args),
                  size: JSON.stringify(args).length
                }
              });
            } catch (e) {
              console.error('\n❌ [LLM Process] ====== TOOL ARGS ERROR ======', {
                ...toolContext,
                error: {
                  type: 'argument_parsing',
                  message: e.message,
                  raw: toolCall.function.arguments?.substring(0, 200) + '...'
                }
              });
              continue;
            }
            
            // Always use the backend-authenticated UID
            args.uid = uid;
            
            const fn = toolFunctions[fnName];
            if (!fn) {
              console.error('\n❌ [LLM Process] ====== TOOL NOT FOUND ======', {
                ...toolContext,
                error: {
                  type: 'missing_function',
                  availableTools: Object.keys(toolFunctions)
                }
              });
              continue;
            }
            
            // Execute tool with timeout
            let result;
            const toolStartTime = Date.now();
            try {
              result = await runToolWithTimeout(fn, args, 30000);
              const toolDuration = Date.now() - toolStartTime;
              
              // Log successful tool execution
              console.log('\n✅ [LLM Process] ====== TOOL SUCCESS ======', {
                ...toolContext,
                execution: {
                  duration: toolDuration,
                  resultSize: result ? JSON.stringify(result).length : 0,
                  resultType: result ? typeof result : 'null'
                }
              });
            } catch (timeoutErr) {
              const toolDuration = Date.now() - toolStartTime;
              
              // Log tool execution failure
              console.error('\n❌ [LLM Process] ====== TOOL FAILURE ======', {
                ...toolContext,
                error: {
                  type: 'execution_error',
                  duration: toolDuration,
                  message: timeoutErr.message,
                  stack: timeoutErr.stack
                }
              });
              
              if (aiController && uid) {
                aiController.sendToUser(uid, { 
                  text: `Sorry, there was an error retrieving your data. Please try again.`, 
                  data: {}, 
                  error: true 
                });
              }
              continue;
            }
            
            lastToolResult = result;
            console.log(`[AI][callLLM] Tool ${fnName} result:`, result);
            
            // Add tool result to messages
            finalMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: fnName,
              content: JSON.stringify(result),
            });
            
          } catch (error) {
            console.error(`[AI][callLLM] Tool call error for ${fnName}:`, error);
            finalMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: fnName,
              content: JSON.stringify({ error: error.message }),
            });
          }
        }
      }
      
      if (finishReason === "stop") {
        console.log("[AI][callLLM] Finish reason: stop");
        break;
      }
    }
    
    console.log(`[AI][callLLM] End of iteration ${iteration}. toolCallsRemaining:`, toolCallsRemaining);
    
    // If we have tool calls, continue with updated messages
    if (toolCallsRemaining) {
      console.log('\n🔄 [LLM Process] ====== CONTINUING WITH TOOL RESULTS ======');
      console.log("[AI][callLLM] Continuing with tool results...");
      console.log("[AI][callLLM] Final messages count:", finalMessages.length);
      console.log("[AI][callLLM] Last message role:", finalMessages[finalMessages.length - 1]?.role);
      console.log("[AI][callLLM] Last message content preview:", finalMessages[finalMessages.length - 1]?.content?.substring(0, 100) + '...');
      
      response = await groqClient.chat.completions.create({
        model,
        messages: finalMessages,
        temperature: 0.0,
        stream: true,
        tools,
        tool_choice: "auto",
      });
      
      console.log("[AI][callLLM] New response created for tool results continuation");
    }
  }
  // After all tool calls and LLM response is complete
  if (!receivedContent) {
    console.warn("[AI][callLLM] No chunk with delta.content received after tool calls. The LLM may not be responding correctly. Consider reinforcing in the prompt: 'The final answer MUST be sent in the content field, in strict JSON.'");
    
    // If we have a complete response but no content was flagged, still return it
    if (completeResponse && completeResponse.trim()) {
      console.log("[AI][callLLM] Returning complete response despite no content flag:", completeResponse.substring(0, 200));
      return completeResponse;
    }
    
    // Fallback: return a clear error to the frontend
    return JSON.stringify({ error: "LLM did not return a valid response in content field after tool calls.", details: "No delta.content received. Check model and prompt." });
  }
  if (iteration >= MAX_ITER) {
    console.error("[AI][callLLM] Max iterations reached. Possible infinite tool call loop.");
  }
  console.log('\n🎯 [LLM Process] ====== POST-PROCESSING ======');
  console.log("[AI][callLLM] Complete LLM response:", completeResponse);
  console.log('[LLM Process] Last tool result available:', !!lastToolResult);
  if (lastToolResult) {
    console.log('[LLM Process] Last tool result type:', typeof lastToolResult);
    console.log('[LLM Process] Last tool result preview:', JSON.stringify(lastToolResult).substring(0, 200) + '...');
  }

  // --- POST-PROCESSING: Prevent hallucinations and cut-off responses ---
  console.log('[AI][callLLM] Response type check - starts with {:', completeResponse.trim().startsWith('{'));
  console.log('[AI][callLLM] Response type check - ends with }:', completeResponse.trim().endsWith('}'));
  console.log('[AI][callLLM] Response length:', completeResponse.length);
  console.log('[AI][callLLM] Response preview:', completeResponse.substring(0, 200));
  
  // Check for malformed content that might contain tool-use markers or other problematic content
  if (completeResponse.includes('<tool-use>') || completeResponse.includes('</tool-use>')) {
    console.warn('[AI][callLLM] 🚨 MALFORMED RESPONSE DETECTED - contains tool-use markers');
    console.warn('[AI][callLLM] Malformed response:', completeResponse);
    
    // Try to clean the response by removing tool-use markers
    let cleanedResponse = completeResponse;
    cleanedResponse = cleanedResponse.replace(/<tool-use>.*?<\/tool-use>/gs, '');
    cleanedResponse = cleanedResponse.replace(/<tool-use>.*$/s, '');
    cleanedResponse = cleanedResponse.replace(/^.*<\/tool-use>/s, '');
    
    // Remove any remaining XML-like tags
    cleanedResponse = cleanedResponse.replace(/<[^>]*>/g, '');
    
    // Trim and check if we have usable content
    cleanedResponse = cleanedResponse.trim();
    
    if (cleanedResponse && cleanedResponse.length > 10) {
      console.log('[AI][callLLM] ✅ Cleaned malformed response:', cleanedResponse.substring(0, 200));
      completeResponse = cleanedResponse;
    } else {
      console.warn('[AI][callLLM] ⚠️ Could not clean malformed response, using fallback');
      
      // If we have tool results, provide a fallback response
      if (lastToolResult) {
        const responseText = formatFinancialResponse(lastToolResult);
        return JSON.stringify({
          text: responseText,
          data: lastToolResult,
          source: 'tool_result_fallback',
          warning: 'Response was malformed but tool results are available'
        });
      }
      
      // Return a safe fallback
      return JSON.stringify({
        text: 'I encountered an issue processing your request. Please try again.',
        data: {},
        error: true,
        source: 'malformed_response_fallback'
      });
    }
  }
  
  // Check for cut-off responses and fix them
  if (completeResponse.includes('cut off') || completeResponse.includes('response was cut') || completeResponse.includes('my response was cut')) {
    console.warn('[AI][callLLM] 🚨 CUT-OFF RESPONSE DETECTED - Attempting to fix');
    
    // Try to extract the useful part before the cut-off
    const usefulPart = completeResponse.split(/cut off|response was cut|my response was cut/i)[0].trim();
    
    if (usefulPart && usefulPart.length > 10) {
      console.log('[AI][callLLM] ✅ Extracted useful content:', usefulPart.substring(0, 100) + '...');
      
      // Create a complete response with the useful part
      completeResponse = usefulPart;
      
      // If it's JSON, try to make it complete
      if (completeResponse.startsWith('{') && !completeResponse.endsWith('}')) {
        // Find the last complete JSON object
        const lastBraceIndex = completeResponse.lastIndexOf('}');
        if (lastBraceIndex > 0) {
          completeResponse = completeResponse.substring(0, lastBraceIndex + 1);
          console.log('[AI][callLLM] ✅ Fixed incomplete JSON response');
        }
      }
    } else {
      console.warn('[AI][callLLM] ⚠️ Could not extract useful content from cut-off response');
    }
  }
  
  try {
    // Only attempt to parse if the response looks like it might be JSON
    if (completeResponse && completeResponse.trim().startsWith('{') && completeResponse.trim().endsWith('}')) {
      
      // Final check for any remaining malformed content
      if (completeResponse.includes('<tool-use>') || completeResponse.includes('</tool-use>')) {
        console.error('[AI][callLLM] 🚨 MALFORMED CONTENT STILL PRESENT after cleaning attempts');
        console.error('[AI][callLLM] This suggests the LLM is fundamentally confused about the response format');
        
        // If we have tool results, provide a fallback response
        if (lastToolResult) {
          const responseText = formatFinancialResponse(lastToolResult);
          return JSON.stringify({
            text: responseText,
            data: lastToolResult,
            source: 'tool_result_fallback',
            warning: 'LLM response format confusion detected'
          });
        }
        
        // Return a safe fallback
        return JSON.stringify({
          text: 'I encountered an issue processing your request. The AI model got confused about how to respond. Please try rephrasing your question.',
          data: {},
          error: true,
          source: 'llm_format_confusion'
        });
      }
      
      let parsed = cleanAndParseJSON(completeResponse);
      
      if (!parsed) {
        console.error('[AI][callLLM] Failed to parse JSON response even after cleaning attempts');
        
        // If we have tool results, provide a fallback response
        if (lastToolResult) {
          const responseText = formatFinancialResponse(lastToolResult);
          return JSON.stringify({
            text: responseText,
            data: lastToolResult
          });
        }
        
        // Return a safe fallback
        return JSON.stringify({
          text: 'I encountered an issue processing your request. Please try again.',
          data: {},
          error: true
        });
      }
      
      // Check if this is a general knowledge response (no tool result validation needed)
      if (parsed.data && parsed.data.type === 'general_knowledge') {
        console.log('[AI][callLLM] General knowledge response detected - skipping tool result validation');
        return completeResponse;
      }
      
      // Only check if we have a tool result and the LLM output is a valid object
      if (lastToolResult && parsed && typeof parsed === 'object') {
        
        // CRITICAL: Always use real tool data, never trust LLM output completely
        // Even if validation passes, we prioritize tool results over LLM interpretation
        
        console.log('\n✅ [LLM Process] ====== USING REAL TOOL DATA ======');
        console.log('[AI][callLLM] Tool results available - prioritizing real data over LLM interpretation');
        console.log('[AI][callLLM] Tool result:', JSON.stringify(lastToolResult, null, 2));
        console.log('[AI][callLLM] LLM response data:', JSON.stringify(parsed.data, null, 2));
        console.log('[LLM Process] LLM response text:', parsed.text);
        
        // Create a response that combines LLM text with real tool data
        let responseText = '';
        
        // Use LLM text if available and seems reasonable
        if (parsed.text && typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
          // Validate that LLM text doesn't contain obvious hallucinations
          const toolDataStr = JSON.stringify(lastToolResult);
          if (parsed.text.includes('I don\'t have access to') || 
              parsed.text.includes('I cannot provide') ||
              parsed.text.includes('I don\'t have the data') ||
              parsed.text.includes('I don\'t have information')) {
            // LLM is claiming it doesn't have data when we do - this is a hallucination
            console.warn('[AI][callLLM] LLM text indicates hallucination (claiming no data when data exists)');
            responseText = formatFinancialResponse(lastToolResult);
          } else {
            // Use LLM text but ensure it's combined with real data
            responseText = parsed.text;
          }
        } else {
          // No LLM text, create our own
          responseText = formatFinancialResponse(lastToolResult);
        }
        
        // ALWAYS return real tool data, never LLM data
        const finalResponse = {
          text: responseText,
          data: lastToolResult, // This is the REAL data from tools
          source: 'tool_result', // Indicate this is real data
          llm_interpretation: parsed.text || null // Keep LLM text for reference but don't trust it
        };
        
        console.log('\n🎉 [LLM Process] ====== FINAL RESPONSE WITH REAL DATA ======');
        console.log('[LLM Process] Final response text:', responseText);
        console.log('[LLM Process] Final response data keys:', Object.keys(lastToolResult || {}));
        console.log('[LLM Process] Final response source:', 'tool_result');
        
        return JSON.stringify(finalResponse);
        
      } else if (lastToolResult) {
        // We have tool results but no valid LLM response
        console.log('[AI][callLLM] No valid LLM response but tool results available - returning real data');
        
        const responseText = formatFinancialResponse(lastToolResult);
        return JSON.stringify({
          text: responseText,
          data: lastToolResult,
          source: 'tool_result',
          llm_interpretation: null
        });
      }
      
      // If no tool results, this might be a general knowledge question
      // But we still need to be careful about what we return
      if (parsed && parsed.text && typeof parsed.text === 'string') {
        // For general knowledge, we can return LLM text but mark it as such
        return JSON.stringify({
          text: parsed.text,
          data: {},
          source: 'llm_general_knowledge',
          warning: 'This response is based on general knowledge and may not be specific to your financial data'
        });
      }
      
      // Last resort - return safe fallback
      return JSON.stringify({
        text: 'I encountered an issue processing your request. Please try again.',
        data: {},
        error: true,
        source: 'fallback'
      });
      
    } else {
      console.log('[AI][callLLM] Response is not JSON format, skipping hallucination check. Response:', completeResponse.substring(0, 100) + '...');
      
      // If we have tool results but the LLM didn't return JSON, provide a fallback response
      if (lastToolResult) {
        console.log('[AI][callLLM] Providing fallback response with tool results since LLM returned non-JSON');
        
        // Create a proper, user-friendly response using the actual financial data
        const responseText = formatFinancialResponse(lastToolResult);
        
        return JSON.stringify({
          text: responseText,
          data: lastToolResult,
          source: 'tool_result_fallback',
          llm_interpretation: null
        });
      }
      
      // If no tool results and no valid JSON, return a safe fallback
      return JSON.stringify({
        text: 'I encountered an issue processing your request. Please try again.',
        data: {},
        error: true,
        source: 'fallback_no_tools'
      });
    }
  } catch (e) {
    console.error('[AI][callLLM] Error in post-processing hallucination check:', e);
    console.log('[AI][callLLM] Failed response content:', completeResponse);
    
    // CRITICAL: Even on error, prioritize real tool data over any LLM response
    if (lastToolResult) {
      console.log('[AI][callLLM] Error occurred but tool results available - returning real data');
      
      const responseText = formatFinancialResponse(lastToolResult);
      return JSON.stringify({
        text: responseText,
        data: lastToolResult,
        source: 'tool_result_error_fallback',
        error: true,
        errorDetails: e.message,
        llm_interpretation: null
      });
    }
    
    // If no tool results and error occurred, return safe fallback
    return JSON.stringify({
      text: 'I encountered an issue processing your request. Please try again.',
      data: {},
      error: true,
      source: 'error_fallback',
      errorDetails: e.message
    });
  }
} 