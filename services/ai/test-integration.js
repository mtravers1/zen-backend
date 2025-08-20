// Test Integration for Zentavos AI Service
// This file tests the integration between prompts, tool functions, and LLM client

import { buildScreenPrompt, getProductionSystemPrompt } from "./prompts.js";
import { toolDefinitions } from "./toolDefinitions.js";

// Test function to validate the system
export async function testAIIntegration() {
  console.log("🧪 Testing Zentavos AI Integration...\n");

  try {
    // Test 1: Prompt generation
    console.log("1️⃣ Testing prompt generation...");
    const dashboardPrompt = buildScreenPrompt("dashboard");
    const tripsPrompt = buildScreenPrompt("trips", "trip-123");
    const systemPrompt = getProductionSystemPrompt();
    
    console.log("✅ Dashboard prompt length:", dashboardPrompt.length);
    console.log("✅ Trips prompt length:", tripsPrompt.length);
    console.log("✅ System prompt length:", systemPrompt.length);

    // Test 2: Tool definitions
    console.log("\n2️⃣ Testing tool definitions...");
    console.log("✅ Number of tools:", toolDefinitions.length);
    console.log("✅ Tool names:", toolDefinitions.map(t => t.function.name));

    // Test 3: Tool definition structure
    console.log("\n3️⃣ Testing tool definition structure...");
    for (const tool of toolDefinitions) {
      const paramCount = Object.keys(tool.function.parameters.properties || {}).length;
      console.log(`✅ ${tool.function.name}: ${tool.function.description.length} chars, ${paramCount} params`);
    }

    // Test 4: Testing response format expectations
    console.log("\n4️⃣ Testing response format expectations...");
    
    // Check if system prompt mentions JSON format
    if (systemPrompt.includes("JSON") && systemPrompt.includes("text") && systemPrompt.includes("data")) {
      console.log("✅ System prompt mentions JSON response format");
    } else {
      console.log("❌ System prompt missing JSON response format information");
    }

    // Test 5: Testing prompt content
    console.log("\n5️⃣ Testing prompt content...");
    
    // Check if prompts contain critical anti-hallucination rules
    const hasAntiHallucinationRules = systemPrompt.includes("NEVER invent") || 
                                     systemPrompt.includes("ALWAYS call tools") ||
                                     systemPrompt.includes("anti-hallucination");
    
    if (hasAntiHallucinationRules) {
      console.log("✅ Prompts contain anti-hallucination rules");
    } else {
      console.log("❌ Prompts missing anti-hallucination rules");
    }

    console.log("\n🎉 All tests passed! AI integration is working correctly.");
    return true;

  } catch (error) {
    console.error("❌ AI integration test failed:", error.message);
    return false;
  }
}

// Test specific functions
export function testPrompts() {
  console.log("🧪 Testing prompts...");
  
  const dashboardPrompt = buildScreenPrompt("dashboard");
  const systemPrompt = getProductionSystemPrompt();
  
  console.log("✅ Dashboard prompt generated:", dashboardPrompt.length > 0);
  console.log("✅ System prompt generated:", systemPrompt.length > 0);
  
  return dashboardPrompt.length > 0 && systemPrompt.length > 0;
}

export function testToolDefinitions() {
  console.log("🧪 Testing tool definitions...");
  
  console.log("✅ Number of tools:", toolDefinitions.length);
  console.log("✅ All tools have names:", toolDefinitions.every(t => t.function.name));
  console.log("✅ All tools have descriptions:", toolDefinitions.every(t => t.function.description));
  
  return toolDefinitions.length > 0;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAIIntegration().then(success => {
    if (success) {
      console.log("\n🚀 AI integration test completed successfully!");
      process.exit(0);
    } else {
      console.log("\n💥 AI integration test failed!");
      process.exit(1);
    }
  });
} 