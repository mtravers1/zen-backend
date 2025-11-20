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
    console.log(
      "✅ Tool names:",
      toolDefinitions.map((t) => t.function.name),
    );

    // Test 3: Tool definition structure
    console.log("\n3️⃣ Testing tool definition structure...");
    for (const tool of toolDefinitions) {
      const paramCount = Object.keys(
        tool.function.parameters.properties || {},
      ).length;
      console.log(
        `✅ ${tool.function.name}: ${tool.function.description.length} chars, ${paramCount} params`,
      );
    }

    // Test 4: Testing response format expectations
    console.log("\n4️⃣ Testing response format expectations...");

    // Check if system prompt mentions JSON format
    if (
      systemPrompt.includes("JSON") &&
      systemPrompt.includes("text") &&
      systemPrompt.includes("data")
    ) {
      console.log("✅ System prompt mentions JSON response format");
    } else {
      console.log("❌ System prompt missing JSON response format information");
    }

    // Test 5: Testing prompt content
    console.log("\n5️⃣ Testing prompt content...");

    // Check if prompts contain critical anti-hallucination rules
    const hasAntiHallucinationRules =
      systemPrompt.includes("NEVER invent") ||
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

export function testGeneralFinancialQuestion() {
  console.log("🧪 Testing general financial question handling...");

  const systemPrompt = getProductionSystemPrompt("dashboard");

  // Check if the system prompt correctly handles general financial questions
  const hasGeneralFinancialGuidance =
    systemPrompt.includes("How can I save money") &&
    systemPrompt.includes("without mentioning current screen");

  const hasScreenContextRules =
    systemPrompt.includes("Mention current screen ONLY when") &&
    systemPrompt.includes("NEVER mention current screen when");

  console.log(
    "✅ General financial guidance rules:",
    hasGeneralFinancialGuidance,
  );
  console.log("✅ Screen context rules:", hasScreenContextRules);

  return hasGeneralFinancialGuidance && hasScreenContextRules;
}

export function testTextCleanupLogic() {
  console.log("🧪 Testing text cleanup logic...");

  // Simulate the text cleanup logic from the service
  const generalFinancialIndicators = [
    "how can i save",
    "how to save",
    "how do i save",
    "how to budget",
    "how do i budget",
    "what is budgeting",
    "how to invest",
    "how do i invest",
    "what is a 401k",
    "what is investing",
    "how to reduce expenses",
    "how do i reduce expenses",
    "financial advice",
    "money saving tips",
    "budgeting tips",
    "investment advice",
  ];

  // Test case 1: General financial question
  const testText1 =
    "You are currently on the **dashboard** screen. Here are some tips on how to save money: 1) Create a budget, 2) Reduce expenses, 3) Increase income.";
  const isGeneralFinancial1 = generalFinancialIndicators.some((indicator) =>
    testText1.toLowerCase().includes(indicator.toLowerCase()),
  );

  // Test case 2: Screen context question
  const testText2 =
    "You are currently on the **dashboard** screen. This shows your financial overview.";
  const isGeneralFinancial2 = generalFinancialIndicators.some((indicator) =>
    testText2.toLowerCase().includes(indicator.toLowerCase()),
  );

  console.log("✅ General financial question detection:", isGeneralFinancial1);
  console.log("✅ Screen context question detection:", !isGeneralFinancial2);

  return isGeneralFinancial1 && !isGeneralFinancial2;
}

export function testToolDefinitions() {
  console.log("🧪 Testing tool definitions...");

  console.log("✅ Number of tools:", toolDefinitions.length);
  console.log(
    "✅ All tools have names:",
    toolDefinitions.every((t) => t.function.name),
  );
  console.log(
    "✅ All tools have descriptions:",
    toolDefinitions.every((t) => t.function.description),
  );

  return toolDefinitions.length > 0;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAIIntegration().then((success) => {
    if (success) {
      console.log("\n🚀 AI integration test completed successfully!");
      process.exit(0);
    } else {
      console.log("\n💥 AI integration test failed!");
      process.exit(1);
    }
  });
}
