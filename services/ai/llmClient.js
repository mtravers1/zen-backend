// Zentavos AI LLM Client Module
// Handles integration with the LLM provider (Groq/vLLM), including streaming, tool calls, and response assembly.

import Groq from "groq-sdk";

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
            try {
              result = await runToolWithTimeout(fn, args, 15000); // 15s timeout
            } catch (timeoutErr) {
              console.warn(`[AI][callLLM] Tool call for ${fnName} timed out.`);
              if (aiController && uid) {
                aiController.sendToUser(uid, { text: `Sorry, the request for ${fnName} took too long and was cancelled. Please try again.`, data: {}, error: true });
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
    // Fallback: return a clear error to the frontend
    return JSON.stringify({ error: "LLM did not return a valid response in content field after tool calls.", details: "No delta.content received. Check model and prompt." });
  }
  if (iteration >= MAX_ITER) {
    console.error("[AI][callLLM] Max iterations reached. Possible infinite tool call loop.");
  }
  console.log("[AI][callLLM] Complete LLM response:", completeResponse);

  // --- POST-PROCESSING: Prevent hallucinations by validating the LLM's output against the tool result ---
  try {
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
  } catch (e) {
    console.error('[AI][callLLM] Error in post-processing hallucination check:', e);
  }
  // Send [DONE] only after the final answer is sent
  return completeResponse;
} 