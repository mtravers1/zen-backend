// Zentavos AI LLM Client Module
// Handles integration with the LLM provider (Groq/vLLM), including streaming, tool calls, and response assembly.

import Groq from "groq-sdk";

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
      return { isValid: true, reason: "No tool results to validate against - generic response allowed" };
    }

    if (!llmResponse) {
      return { isValid: false, reason: "No LLM response provided" };
    }

    // Parse LLM response
    let parsedResponse;
    if (typeof llmResponse === 'string') {
      try {
        parsedResponse = JSON.parse(llmResponse);
      } catch (e) {
        return { isValid: false, reason: "LLM response is not valid JSON" };
      }
    } else {
      parsedResponse = llmResponse;
    }

    // Check if LLM response has data field
    if (!parsedResponse.data) {
      return { isValid: false, reason: "LLM response missing data field" };
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
  const groqClient = new Groq({ apiKey });
  // Log the tools array/object being sent to the LLM for debugging
  console.log("[AI][callLLM] Tools passed to LLM:", JSON.stringify(tools, null, 2));
  let response = await groqClient.chat.completions.create({
    model,
    messages,
    temperature: 0.0,
    stream: true,
    tools,
  });

  let buffer = "";
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
    let started = false;
    let ended = false;
    iteration++;

    for await (const chunk of response) {
      const delta = chunk.choices?.[0]?.delta;
      const finishReason = chunk.choices?.[0]?.finish_reason;

      if (delta?.content) {
        completeResponse += delta.content;
        receivedContent = true;
        if (!started && delta.content.startsWith("¡")) {
          started = true;
          delta.content = delta.content.slice(1);
        }
        if (!ended && delta.content.endsWith("¡")) {
          ended = true;
          delta.content = delta.content.slice(0, -1);
        }
        // Não envie texto parcial para o frontend aqui!
        buffer += delta.content;
      }

      if (delta?.tool_calls) {
        toolCallsRemaining = true;
        console.log(`[AI][callLLM] Tool call(s) detected in LLM output:`, delta.tool_calls.map(tc => tc.function?.name));
        if (aiController && uid) {
          // Send a progress message to the user (marked as progress)
          aiController.sendToUser(uid, { text: 'Processing your request... (executing tool call)', progress: true });
        }
        for (const toolCall of delta.tool_calls) {
          try {
            if (!toolCall.function) continue;
            const fnName = toolCall.function?.name;
            if (!fnName) continue;
            let args = {};
            try {
              args = toolCall.function.arguments
                ? JSON.parse(toolCall.function.arguments)
                : {};
            } catch (e) {
              console.error(`[AI][callLLM] Error parsing tool arguments for ${fnName}:`, e);
              continue;
            }
            // Always use the backend-authenticated UID, never trust the UID from the LLM/tool call args
            args.uid = uid;
            console.log(`[AI][callLLM] Calling tool function: ${fnName} with args (forced UID):`, args);
            const fn = toolFunctions[fnName];
            if (!fn) {
              console.error(`[AI][callLLM] Tool function not found: ${fnName}`);
              continue;
            }
            // Run the tool function with a timeout to prevent hanging
            let result;
            const toolStartTime = Date.now();
            try {
              console.log(`[AI][callLLM] Starting tool function ${fnName} at ${new Date().toISOString()}`);
              result = await runToolWithTimeout(fn, args, 30000); // 30s timeout (increased from 15s)
              const toolDuration = Date.now() - toolStartTime;
              console.log(`[AI][callLLM] Tool function ${fnName} completed in ${toolDuration}ms`);
            } catch (timeoutErr) {
              const toolDuration = Date.now() - toolStartTime;
              console.error(`[AI][callLLM] Tool call for ${fnName} failed after ${toolDuration}ms:`, timeoutErr);
              
              // Log detailed error information
              if (timeoutErr.message.includes('timeout')) {
                console.warn(`[AI][callLLM] Tool call for ${fnName} timed out after ${toolDuration}ms`);
              } else {
                console.error(`[AI][callLLM] Tool call for ${fnName} failed with error:`, {
                  error: timeoutErr.message,
                  stack: timeoutErr.stack,
                  name: timeoutErr.name,
                  duration: toolDuration
                });
              }
              
              if (aiController && uid) {
                aiController.sendToUser(uid, { 
                  text: `Sorry, the request for ${fnName} failed: ${timeoutErr.message}. Please try again.`, 
                  data: {}, 
                  error: true 
                });
              }
              continue;
            }
            lastToolResult = result; // Save the last tool result for post-processing
            console.log(`[AI][callLLM] Tool function ${fnName} returned:`, result);
            finalMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: fnName,
              content: JSON.stringify(result),
            });
            console.log(`[AI][callLLM] Tool call executed: ${fnName} with args`, args);
          } catch (error) {
            finalMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: fnName,
              content: JSON.stringify({ error: error.message }),
            });
            console.error(`[AI][callLLM] Tool call error for ${fnName}:`, error);
          }
        }
      }
      if (delta?.content) {
        console.log(`[AI][callLLM] Received content chunk:`, delta.content);
      }
      if (finishReason === "stop") {
        console.log("[AI][callLLM] Finish reason: stop");
        break;
      }
    }
    console.log(`[AI][callLLM] End of LLM response iteration ${iteration}. toolCallsRemaining:`, toolCallsRemaining);
    if (toolCallsRemaining) {
      console.log("[AI][callLLM] Tool calls remaining, re-calling LLM with updated messages...");
      response = await groqClient.chat.completions.create({
        model,
        messages: finalMessages,
        temperature: 0.0,
        stream: true,
        tools,
        tool_choice: "auto",
      });
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
  console.log("[AI][callLLM] Complete LLM response:", completeResponse);

  // --- POST-PROCESSING: Prevent hallucinations by validating the LLM's output against the tool result ---
  console.log('[AI][callLLM] Response type check - starts with {:', completeResponse.trim().startsWith('{'));
  console.log('[AI][callLLM] Response type check - ends with }:', completeResponse.trim().endsWith('}'));
  console.log('[AI][callLLM] Response length:', completeResponse.length);
  console.log('[AI][callLLM] Response preview:', completeResponse.substring(0, 200));
  
  try {
    // Only attempt to parse if the response looks like it might be JSON
    if (completeResponse && completeResponse.trim().startsWith('{') && completeResponse.trim().endsWith('}')) {
      const parsed = JSON.parse(completeResponse);
      // Only check if we have a tool result and the LLM output is a valid object
      if (lastToolResult && parsed && typeof parsed === 'object') {
        // Compare the data field (shallow equality for arrays/objects)
        const llmData = JSON.stringify(parsed.data);
        const toolData = JSON.stringify(lastToolResult);
        if (llmData !== toolData) {
          console.warn('[AI][callLLM] LLM output does not match tool result. Overwriting with real data to prevent hallucination.');
          return JSON.stringify({
            text: 'Here is your real financial data based on your account records.',
            data: lastToolResult
          });
        }
      }
    } else {
      console.log('[AI][callLLM] Response is not JSON format, skipping hallucination check. Response:', completeResponse.substring(0, 100) + '...');
      
      // If we have tool results but the LLM didn't return JSON, provide a fallback response
      if (lastToolResult) {
        console.log('[AI][callLLM] Providing fallback response with tool results since LLM returned non-JSON');
        return JSON.stringify({
          text: 'Here is your financial information based on your account records.',
          data: lastToolResult
        });
      }
    }
  } catch (e) {
    console.error('[AI][callLLM] Error in post-processing hallucination check:', e);
    console.log('[AI][callLLM] Failed response content:', completeResponse);
  }
  // Send [DONE] only after the final answer is sent
  return completeResponse;
} 