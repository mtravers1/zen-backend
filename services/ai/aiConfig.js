// Zentavos AI Configuration
// Centralized configuration for AI service behavior

export const AI_CONFIG = {
  // Prompt settings
  PROMPT: {
    MAX_LENGTH: 15000, // Simplified max length
    USE_SIMPLIFIED_WHEN_OVER: 12000, // Use simplified prompt when over this
    CONTEXT_PRIORITY: ["screen", "user", "data"], // Order of context importance
  },

  // Tool call settings
  TOOLS: {
    TIMEOUT_MS: 15000, // Tool execution timeout
    MAX_RETRIES: 2, // Max retries per tool
    REQUIRED_FOR_FINANCIAL: [
      // Always use tools for these patterns
      "balance",
      "net worth",
      "transactions",
      "accounts",
      "how much",
      "total",
      "income",
      "expenses",
      "cash flow",
    ],
    NEVER_FOR_GENERAL: [
      // Never use tools for these patterns
      "how to",
      "what is",
      "how can i",
      "advice",
      "tips",
      "hello",
      "hi",
      "thank you",
      "help",
    ],
  },

  // Response settings
  RESPONSE: {
    DEFAULT_SOURCE: "general_response",
    TOOL_SOURCE: "tool_result",
    ERROR_SOURCE: "error_fallback",
    MAX_SUGGESTED_QUESTIONS: 3,
    FALLBACK_MESSAGE:
      "I encountered an issue processing your request. Please try again.",
  },

  // Structured content settings
  STRUCTURED_CONTENT: {
    ENABLED: true,
    TYPES: ["steps", "list", "sections", "table", "item", "text"],
    FORMAT_PATTERNS: {
      steps: /^\d+\.\s+\*\*[^*]+\*\*/gm,
      list: /^\*\s+[^*\n]+/gm,
      sections: /^\*\*[^*]+\*\*/gm,
      table: /\|\s*[^|]+\s*\|/g,
      item: /^\*\*[^*]+\*\*\s*\n\s*\*/gm,
    },
    PRIORITY: ["table", "steps", "sections", "list", "item", "text"],
  },

  // Validation settings
  VALIDATION: {
    STRICT_MODE: false, // Simplified validation
    ALLOW_PARTIAL_DATA: true, // Allow responses with partial data
    CHECK_HALLUCINATIONS: false, // Disable complex hallucination checks
    LOG_VALIDATION_DETAILS: false, // Reduce validation logging
  },
};

// Question type detection
export function detectQuestionType(prompt) {
  const lowerPrompt = prompt.toLowerCase().trim();

  // Financial data questions (need tools)
  if (
    AI_CONFIG.TOOLS.REQUIRED_FOR_FINANCIAL.some((keyword) =>
      lowerPrompt.includes(keyword),
    )
  ) {
    return "financial_data";
  }

  // General questions (no tools)
  if (
    AI_CONFIG.TOOLS.NEVER_FOR_GENERAL.some((keyword) =>
      lowerPrompt.includes(keyword),
    )
  ) {
    return "general";
  }

  // Navigation/UI questions
  if (
    lowerPrompt.includes("screen") ||
    lowerPrompt.includes("where am i") ||
    lowerPrompt.includes("what can i do")
  ) {
    return "navigation";
  }

  // Default to general
  return "general";
}

// Simple context builder
export function buildSimpleContext(screen, dataScreen, richContext = {}) {
  const contextParts = [];

  if (screen && screen !== "unknown") {
    contextParts.push(`Screen: ${screen}`);
  }

  if (dataScreen && dataScreen !== "unknown" && dataScreen !== "overview") {
    contextParts.push(`View: ${dataScreen}`);
  }

  if (
    richContext.user?.profileName &&
    richContext.user.profileName !== "Unknown"
  ) {
    contextParts.push(`Profile: ${richContext.user.profileName}`);
  }

  return contextParts.length > 0 ? contextParts.join(" | ") : "Dashboard";
}

// Response formatter
export function formatAIResponse(
  response,
  data = null,
  source = null,
  error = false,
) {
  return {
    response: response || AI_CONFIG.RESPONSE.FALLBACK_MESSAGE,
    data: data || null,
    source:
      source ||
      (data
        ? AI_CONFIG.RESPONSE.TOOL_SOURCE
        : AI_CONFIG.RESPONSE.DEFAULT_SOURCE),
    error: error || false,
    errorMessage: error ? response : null,
    needsClarification: false,
    suggestedQuestions: [],
  };
}
