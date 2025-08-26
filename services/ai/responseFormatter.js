/**
 * Response Formatter Utility
 * Helps create user-friendly responses from tool results
 */

/**
 * Creates a natural language response from financial data
 * @param {object} toolResult - The result from tool execution
 * @param {string} userQuestion - The original user question
 * @returns {string} A natural language response
 */
export function formatFinancialResponse(toolResult, userQuestion = '') {
  if (!toolResult) {
    return 'No financial data available for your request.';
  }

  // Handle US forms help data
  if (toolResult.formType && toolResult.form) {
    return formatFormsResponse(toolResult);
  }

  // Handle financial knowledge data
  if (toolResult.topic && toolResult.knowledge) {
    return formatFinancialKnowledgeResponse(toolResult);
  }

  // Handle general knowledge responses
  if (toolResult.type === 'general_knowledge') {
    return toolResult.text || 'Here is general information about your question.';
  }

  // Handle net worth data
  if (toolResult.netWorth !== undefined) {
    let response = `Your current net worth is $${toolResult.netWorth.toLocaleString()}`;

    if (toolResult.totalCashBalance !== undefined) {
      response += `, with $${toolResult.totalCashBalance.toLocaleString()} in cash`;
    }

    if (toolResult.totalAssets !== undefined && toolResult.totalAssets > 0) {
      response += ` and $${toolResult.totalAssets.toLocaleString()} in other assets`;
    }

    if (toolResult.totalLiabilities !== undefined && toolResult.totalLiabilities > 0) {
      response += `. You have $${toolResult.totalLiabilities.toLocaleString()} in liabilities`;
    }

    response += '.';
    return response;
  }

  // Handle cash balance data
  if (toolResult.totalCashBalance !== undefined) {
    return `You have $${toolResult.totalCashBalance.toLocaleString()} in cash across your accounts.`;
  }

  // Handle account breakdown data
  if (toolResult.breakdown) {
    const accounts = [];
    if (toolResult.breakdown.depository?.accounts) {
      accounts.push(...toolResult.breakdown.depository.accounts);
    }
    if (toolResult.breakdown.credit?.accounts) {
      accounts.push(...toolResult.breakdown.credit.accounts);
    }
    if (toolResult.breakdown.investment?.accounts) {
      accounts.push(...toolResult.breakdown.investment.accounts);
    }

    if (accounts.length > 0) {
      const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
      return `You have ${accounts.length} account${accounts.length > 1 ? 's' : ''} with a total balance of $${totalBalance.toLocaleString()}.`;
    } else {
      return 'Here is your account information.';
    }
  }

  // Handle transaction data
  if (Array.isArray(toolResult)) {
    if (toolResult.length === 0) {
      return 'No transactions found for the requested period.';
    } else {
      // Don't return a string here - let the caller handle the data
      return null; // This will keep the original data intact
    }
  }

  // Handle generic data
  if (typeof toolResult === 'object' && Object.keys(toolResult).length > 0) {
    return 'Here is your financial information based on your account records.';
  }

  return 'No financial data available for your request.';
}

/**
 * Formats responses specifically for US forms help
 * @param {object} formData - The form help data
 * @returns {string} A formatted response about forms
 */
function formatFormsResponse(formData) {
  if (!formData.form) {
    return formData.message || 'I can help you with various US tax and banking forms.';
  }

  const form = formData.form;
  let response = `${formData.message}\n\n`;

  if (form.description) {
    response += `${form.description}\n\n`;
  }

  if (form.fields) {
    response += `**Key Fields to Complete:**\n`;
    form.fields.forEach(field => {
      response += `• ${field}\n`;
    });
    response += '\n';
  }

  if (form.types) {
    response += `**Types of ${form.name}:**\n`;
    Object.entries(form.types).forEach(([type, description]) => {
      response += `• ${type}: ${description}\n`;
    });
    response += '\n';
  }

  if (form.forms) {
    response += `**Common Forms:**\n`;
    Object.entries(form.forms).forEach(([formName, description]) => {
      response += `• ${formName}: ${description}\n`;
    });
    response += '\n';
  }

  if (form.requiredDocuments) {
    response += `**Required Documents:**\n`;
    form.requiredDocuments.forEach(doc => {
      response += `• ${doc}\n`;
    });
    response += '\n';
  }

  if (form.tips) {
    response += `**Helpful Tips:**\n`;
    form.tips.forEach(tip => {
      response += `• ${tip}\n`;
    });
  }

  return response.trim();
}

/**
 * Formats responses specifically for financial knowledge
 * @param {object} knowledgeData - The financial knowledge data
 * @returns {string} A formatted response about financial knowledge
 */
function formatFinancialKnowledgeResponse(knowledgeData) {
  if (!knowledgeData.knowledge) {
    return knowledgeData.message || 'I can provide information about various financial topics.';
  }

  const knowledge = knowledgeData.knowledge;
  let response = `${knowledgeData.message}\n\n`;

  if (knowledge.content) {
    response += knowledge.content;
  }

  return response.trim();
}

/**
 * Creates a response object with proper formatting
 * @param {object} toolResult - The result from tool execution
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted response object
 */
export function createFormattedResponse(toolResult, userQuestion = '') {
  const text = formatFinancialResponse(toolResult, userQuestion);

  return {
    text,
    data: toolResult || {},
    error: false
  };
}

/**
 * Creates a response for general financial knowledge questions
 * @param {string} topic - The topic of the question
 * @param {string} responseText - The detailed response text
 * @returns {object} Formatted response object for general knowledge
 */
export function createGeneralKnowledgeResponse(topic, responseText) {
  return {
    text: responseText,
    data: {
      topic: topic,
      type: 'general_knowledge',
      timestamp: new Date().toISOString()
    },
    error: false
  };
}

/**
 * Creates a response when no personal data is available but general guidance can be provided
 * @param {string} topic - The topic requested
 * @param {string} generalGuidance - General information about the topic
 * @returns {object} Formatted response object
 */
export function createNoPersonalDataResponse(topic, generalGuidance) {
  return {
    text: `I don't have access to your personal financial data for that question. However, I can provide general information about ${topic}:\n\n${generalGuidance}\n\nWould you like me to help you access your personal financial information, or do you have other questions about ${topic}?`,
    data: {
      type: 'no_personal_data',
      topic: topic,
      suggestion: 'general_guidance',
      timestamp: new Date().toISOString()
    },
    error: false
  };
} 