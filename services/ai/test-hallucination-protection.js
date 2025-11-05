// Test Hallucination Protection for Zentavos AI Service
// This file tests the critical anti-hallucination mechanisms

import { validateResponseAgainstToolResults } from "./llmClient.js";

// Mock test data - structure matches what the validation function expects
const mockToolResults = [
  [
    { name: "Checking", balance: 0, institution: "Chase" },
    { name: "Savings", balance: 100, institution: "Chase" },
  ],
];

const mockEmptyToolResults = [];

const mockNetWorthResult = [
  {
    netWorth: 0,
    totalCashBalance: 100,
    totalAssets: 0,
    totalLiabilities: 0,
  },
];

// Test scenarios
function testHallucinationProtection() {
  console.log("🧪 Testing Hallucination Protection...\n");

  let testsPassed = 0;
  let totalTests = 0;

  // Test 1: Valid response (should pass)
  console.log("1️⃣ Testing valid response...");
  totalTests++;
  const validResponse = {
    text: "Your account balances are:",
    data: [
      { name: "Checking", balance: 0, institution: "Chase" },
      { name: "Savings", balance: 100, institution: "Chase" },
    ],
  };

  const validValidation = validateResponseAgainstToolResults(
    JSON.stringify(validResponse),
    mockToolResults,
  );
  if (validValidation.isValid) {
    console.log("✅ Valid response passed validation");
    testsPassed++;
  } else {
    console.log("❌ Valid response failed validation:", validValidation.reason);
  }

  // Test 2: Hallucinated balance (should fail)
  console.log("\n2️⃣ Testing hallucinated balance...");
  totalTests++;
  const hallucinatedResponse = {
    text: "Your account balances are:",
    data: [
      { name: "Checking", balance: 1250, institution: "Chase" }, // ❌ Invented balance
      { name: "Savings", balance: 100, institution: "Chase" },
    ],
  };

  const hallucinatedValidation = validateResponseAgainstToolResults(
    JSON.stringify(hallucinatedResponse),
    mockToolResults,
  );
  if (!hallucinatedValidation.isValid) {
    console.log(
      "✅ Hallucinated balance correctly detected:",
      hallucinatedValidation.reason,
    );
    testsPassed++;
  } else {
    console.log("❌ Hallucinated balance NOT detected - SECURITY RISK!");
  }

  // Test 3: Missing data field (should fail)
  console.log("\n3️⃣ Testing missing data field...");
  totalTests++;
  const missingDataResponse = {
    text: "Your account information is available",
    // ❌ Missing data field
  };

  const missingDataValidation = validateResponseAgainstToolResults(
    JSON.stringify(missingDataResponse),
    mockToolResults,
  );
  if (!missingDataValidation.isValid) {
    console.log(
      "✅ Missing data field correctly detected:",
      missingDataValidation.reason,
    );
    testsPassed++;
  } else {
    console.log("❌ Missing data field NOT detected - SECURITY RISK!");
  }

  // Test 4: Empty data despite tool results (should fail)
  console.log("\n4️⃣ Testing empty data despite tool results...");
  totalTests++;
  const emptyDataResponse = {
    text: "Your account information is available",
    data: [], // ❌ Empty data despite having tool results
  };

  const emptyDataValidation = validateResponseAgainstToolResults(
    JSON.stringify(emptyDataResponse),
    mockToolResults,
  );
  if (!emptyDataValidation.isValid) {
    console.log(
      "✅ Empty data correctly detected:",
      emptyDataValidation.reason,
    );
    testsPassed++;
  } else {
    console.log("❌ Empty data NOT detected - SECURITY RISK!");
  }

  // Test 5: No tool results (edge case - should pass validation)
  console.log("\n5️⃣ Testing no tool results...");
  totalTests++;
  const noToolResultsResponse = {
    text: "No financial data available",
    data: {},
  };

  const noToolResultsValidation = validateResponseAgainstToolResults(
    JSON.stringify(noToolResultsResponse),
    mockEmptyToolResults,
  );
  if (noToolResultsValidation.isValid) {
    console.log("✅ No tool results case handled correctly");
    testsPassed++;
  } else {
    console.log(
      "❌ No tool results case failed:",
      noToolResultsValidation.reason,
    );
  }

  // Test 6: Partial data hallucination (should fail)
  console.log("\n6️⃣ Testing partial data hallucination...");
  totalTests++;
  const partialHallucinationResponse = {
    text: "Your account balances are:",
    data: [
      { name: "Checking", balance: 0, institution: "Chase" },
      { name: "Savings", balance: 100, institution: "Chase" },
      { name: "Investment", balance: 5000, institution: "Fidelity" }, // ❌ Invented account
    ],
  };

  console.log("Tool results:", JSON.stringify(mockToolResults, null, 2));
  console.log(
    "LLM response data:",
    JSON.stringify(partialHallucinationResponse.data, null, 2),
  );

  const partialHallucinationValidation = validateResponseAgainstToolResults(
    JSON.stringify(partialHallucinationResponse),
    mockToolResults,
  );
  console.log("Validation result:", partialHallucinationValidation);

  if (!partialHallucinationValidation.isValid) {
    console.log(
      "✅ Partial hallucination correctly detected:",
      partialHallucinationValidation.reason,
    );
    testsPassed++;
  } else {
    console.log("❌ Partial hallucination NOT detected - SECURITY RISK!");
  }

  // Test 7: Net worth validation
  console.log("\n7️⃣ Testing net worth validation...");
  totalTests++;
  const netWorthResponse = {
    text: "Your net worth is $0",
    data: {
      netWorth: 0,
      totalCashBalance: 100,
      totalAssets: 0,
      totalLiabilities: 0,
    },
  };

  const netWorthValidation = validateResponseAgainstToolResults(
    JSON.stringify(netWorthResponse),
    mockNetWorthResult,
  );
  if (netWorthValidation.isValid) {
    console.log("✅ Net worth response passed validation");
    testsPassed++;
  } else {
    console.log(
      "❌ Net worth response failed validation:",
      netWorthValidation.reason,
    );
  }

  // Test 8: Malformed JSON (should fail gracefully)
  console.log("\n8️⃣ Testing malformed JSON...");
  totalTests++;
  const malformedResponse = "This is not valid JSON";

  const malformedValidation = validateResponseAgainstToolResults(
    malformedResponse,
    mockToolResults,
  );
  if (!malformedValidation.isValid) {
    console.log(
      "✅ Malformed JSON correctly detected:",
      malformedValidation.reason,
    );
    testsPassed++;
  } else {
    console.log("❌ Malformed JSON NOT detected - SECURITY RISK!");
  }

  // Results
  console.log("\n" + "=".repeat(50));
  console.log(`🎯 Test Results: ${testsPassed}/${totalTests} tests passed`);

  if (testsPassed === totalTests) {
    console.log(
      "🎉 ALL TESTS PASSED! Hallucination protection is working correctly.",
    );
    return true;
  } else {
    console.log(
      "❌ SOME TESTS FAILED! Hallucination protection has vulnerabilities.",
    );
    console.log("🚨 CRITICAL: Do not deploy until all tests pass!");
    return false;
  }
}

// Test specific validation function
function testValidationFunction() {
  console.log("\n🔍 Testing validation function directly...");

  // Test the validation logic
  const testCases = [
    {
      name: "Valid response",
      response: { text: "Test", data: mockToolResults[0] },
      toolResults: mockToolResults,
      shouldPass: true,
    },
    {
      name: "Hallucinated data",
      response: { text: "Test", data: [{ name: "Fake", balance: 9999 }] },
      toolResults: mockToolResults,
      shouldPass: false,
    },
    {
      name: "Missing data field",
      response: { text: "Test" },
      toolResults: mockToolResults,
      shouldPass: false,
    },
  ];

  for (const testCase of testCases) {
    const result = validateResponseAgainstToolResults(
      JSON.stringify(testCase.response),
      testCase.toolResults,
    );
    const passed = result.isValid === testCase.shouldPass;

    console.log(
      `${passed ? "✅" : "❌"} ${testCase.name}: ${passed ? "PASSED" : "FAILED"}`,
    );
    if (!passed) {
      console.log(
        `   Expected: ${testCase.shouldPass}, Got: ${result.isValid}, Reason: ${result.reason}`,
      );
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const success = testHallucinationProtection();
  testValidationFunction();

  if (success) {
    console.log("\n🚀 System is ready for deployment!");
    process.exit(0);
  } else {
    console.log("\n💥 System has critical vulnerabilities - DO NOT DEPLOY!");
    process.exit(1);
  }
}

export { testHallucinationProtection, testValidationFunction };
