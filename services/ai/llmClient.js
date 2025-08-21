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
    // No tool results = valid generic response
    if (!toolResults || toolResults.length === 0) {
      return { 
        isValid: true, 
        reason: "No tool results - generic response allowed",
        response: {
          text: llmResponse,
          data: null,
          error: false,
          errorMessage: null
        }
      };
    }

    // No LLM response = error
    if (!llmResponse) {
      return { 
        isValid: false, 
        reason: "No LLM response provided"
      };
    }

    // Basic validation passed
    return { isValid: true, reason: "Response validated" };
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
  // Debug: Log received parameters
  console.log('[LLM Client] Received parameters:', {
    hasApiKey: !!apiKey,
    hasModel: !!model,
    hasMessages: !!messages,
    hasTools: !!tools,
    hasToolFunctions: !!toolFunctions,
    hasUid: !!uid,
    hasAiController: !!aiController,
    toolFunctionsType: typeof toolFunctions,
    toolFunctionsKeys: toolFunctions ? Object.keys(toolFunctions) : 'null'
  });
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
    // Debug: Log function call
    console.log('[LLM Client] runToolWithTimeout called:', {
      fn,
      fnType: typeof fn,
      args,
      timeoutMs
    });
    
    if (typeof fn !== 'function') {
      throw new Error(`Expected function but got ${typeof fn}`);
    }
    
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
          requestId,
          timestamp,
          userId: uid,
          model,
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
            requestId,
            timestamp,
            userId: uid,
            model,
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
            
            // Debug: Log before accessing toolFunctions
            console.log('[LLM Client] Before accessing toolFunctions:', {
              fnName,
              hasToolFunctions: !!toolFunctions,
              toolFunctionsType: typeof toolFunctions,
              availableKeys: toolFunctions ? Object.keys(toolFunctions) : 'null'
            });
            
            const fn = toolFunctions[fnName];
            
            // Debug: Log after accessing toolFunctions
            console.log('[LLM Client] After accessing toolFunctions:', {
              fnName,
              fn,
              fnType: typeof fn,
              isFunction: typeof fn === 'function'
            });
            
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
              // Debug: Log before calling function
              console.log('[LLM Client] Before calling function:', {
                fnName,
                args,
                fnType: typeof fn,
                isFunction: typeof fn === 'function'
              });
              
              result = await runToolWithTimeout(fn, args, 30000);
              const toolDuration = Date.now() - toolStartTime;
              
              // Debug: Log result
              console.log('[LLM Client] Tool execution result:', {
                result,
                resultType: typeof result,
                resultKeys: result && typeof result === 'object' ? Object.keys(result) : 'not object'
              });
              
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
            
            // Debug: Log lastToolResult assignment
            console.log('[LLM Client] lastToolResult assigned:', {
              lastToolResult,
              lastToolResultType: typeof lastToolResult,
              lastToolResultKeys: lastToolResult && typeof lastToolResult === 'object' ? Object.keys(lastToolResult) : 'not object'
            });
            
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
  
  // Debug: Log lastToolResult before post-processing
  console.log('[LLM Client] Before post-processing:', {
    lastToolResult,
    lastToolResultType: typeof lastToolResult,
    lastToolResultKeys: lastToolResult && typeof lastToolResult === 'object' ? Object.keys(lastToolResult) : 'not object',
    completeResponseType: typeof completeResponse,
    completeResponseLength: completeResponse ? completeResponse.length : 0
  });
  
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
      
      // Debug: Log before tool result check
      console.log('[LLM Client] Before tool result check:', {
        hasLastToolResult: !!lastToolResult,
        lastToolResultType: typeof lastToolResult,
        hasParsed: !!parsed,
        parsedType: typeof parsed,
        isParsedObject: parsed && typeof parsed === 'object'
      });
      
      // If we have tool results, prioritize them
      if (lastToolResult && parsed && typeof parsed === 'object') {
        console.log('[AI][callLLM] Using real tool data with LLM response');
        
        const responseText = parsed.response || parsed.text || formatFinancialResponse(lastToolResult);
        
        return JSON.stringify({
          response: responseText,
          data: lastToolResult,
          source: 'tool_result',
          error: false
        });
        
      } else if (lastToolResult) {
        console.log('[AI][callLLM] Using tool results only (no valid LLM response)');
        
        return JSON.stringify({
          response: formatFinancialResponse(lastToolResult),
          data: lastToolResult,
          source: 'tool_result',
          error: false
        });
      }
      
      // No tool results - return LLM response
      if (parsed && (parsed.response || parsed.text)) {
        return JSON.stringify({
          response: parsed.response || parsed.text,
          data: parsed.data || null,
          source: 'general_response',
          error: false
        });
      }
      
      // Fallback
      return JSON.stringify({
        response: 'I encountered an issue processing your request. Please try again.',
        data: null,
        error: true,
        source: 'fallback'
      });
      
    } else {
      console.log('[AI][callLLM] Response is not JSON format');
      
      // Return as plain text response
      return JSON.stringify({
        response: completeResponse,
        data: lastToolResult || null,
        source: lastToolResult ? 'tool_result_text' : 'general_response',
        error: false
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
    
    // Debug: Log error fallback
    console.log('[LLM Client] Error fallback:', {
      error: e.message,
      lastToolResult,
      lastToolResultType: typeof lastToolResult
    });
    
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