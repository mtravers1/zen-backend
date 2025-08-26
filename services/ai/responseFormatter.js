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

/**
 * Enhanced data formatter for better table display
 * @param {any} data - The data to format
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted data with better structure
 */
export function formatDataForDisplay(data, userQuestion = '') {
  if (!data) {
    return null;
  }

  // Handle array data (most common case for tables)
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return null;
    }

    // Process each item to create better table structure
    const processedData = data.map(item => {
      if (typeof item === 'object' && item !== null) {
        return processObjectForTable(item);
      }
      return item;
    });

    return {
      type: 'table',
      data: processedData,
      headers: generateTableHeaders(processedData),
      summary: generateTableSummary(processedData, userQuestion)
    };
  }

  // Handle single object data
  if (typeof data === 'object' && data !== null) {
    const processedData = processObjectForTable(data);
    return {
      type: 'table',
      data: [processedData],
      headers: generateTableHeaders([processedData]),
      summary: generateTableSummary([processedData], userQuestion)
    };
  }

  // Handle primitive data
  return {
    type: 'text',
    data: String(data),
    summary: generateTextSummary(data, userQuestion)
  };
}

/**
 * Format structured content (steps, lists, tables) for better mobile display
 * @param {string} content - The content to format
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted content object
 */
export function formatStructuredContent(content, userQuestion = '') {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Clean up HTML tags and normalize line breaks
  const cleanContent = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Check if content contains structured information
  if (isStructuredContent(cleanContent)) {
    return formatAsStructuredData(cleanContent, userQuestion);
  }

  // Return as simple text if no structure detected
  return {
    type: 'text',
    content: cleanContent,
    summary: generateTextSummary(cleanContent, userQuestion)
  };
}

/**
 * Check if content contains structured information
 * @param {string} content - The content to analyze
 * @returns {boolean} True if content is structured
 */
function isStructuredContent(content) {
  const structuredPatterns = [
    /\|\s*[^|]+\s*\|/g, // Table format with pipes
    /^\d+\.\s+\*\*[^*]+\*\*/gm, // Numbered steps with bold headers
    /^\*\s+[^*\n]+/gm, // Bullet points
    /^[A-Z][^:]*:\s*\n/gm, // Section headers with colons
    /^\*\*[^*]+\*\*/gm, // Bold headers
    /^Step\s+\d+/gmi, // Step headers
    /^[A-Z][^.]*\.\s*\n/gm // Numbered items
  ];

  return structuredPatterns.some(pattern => pattern.test(content));
}

/**
 * Format content as structured data
 * @param {string} content - The content to format
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted structured data
 */
function formatAsStructuredData(content, userQuestion) {
  // Try to parse as table first
  if (content.includes('|')) {
    return parseTableContent(content, userQuestion);
  }

  // Try to parse as steps
  if (content.includes('Step') || /\d+\.\s+\*\*/.test(content)) {
    return parseStepsContent(content, userQuestion);
  }

  // Try to parse as list
  if (/\*\s+/.test(content)) {
    return parseListContent(content, userQuestion);
  }

  // Try to parse as sections
  if (/\*\*[^*]+\*\*/.test(content)) {
    return parseSectionsContent(content, userQuestion);
  }

  // Fallback to simple text
  return {
    type: 'text',
    content: content,
    summary: generateTextSummary(content, userQuestion)
  };
}

/**
 * Parse table content with pipe separators
 * @param {string} content - The table content
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted table data
 */
function parseTableContent(content, userQuestion) {
  const lines = content.split('\n').filter(line => line.trim());
  const tableLines = lines.filter(line => line.includes('|'));
  
  if (tableLines.length < 2) {
    return {
      type: 'text',
      content: content,
      summary: generateTextSummary(content, userQuestion)
    };
  }

  // Parse headers
  const headerLine = tableLines[0];
  const headers = headerLine
    .split('|')
    .map(h => h.trim().replace(/\*\*/g, ''))
    .filter(h => h.length > 0);

  // Parse data rows
  const dataRows = tableLines.slice(1).map(line => {
    const cells = line
      .split('|')
      .map(cell => cell.trim().replace(/\*\*/g, ''))
      .filter(cell => cell.length > 0);
    
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || '';
    });
    return row;
  });

  return {
    type: 'table',
    data: dataRows,
    headers: headers,
    summary: `Table with ${dataRows.length} rows showing ${headers.join(', ')}`,
    originalContent: content
  };
}

/**
 * Parse steps content
 * @param {string} content - The steps content
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted steps data
 */
function parseStepsContent(content, userQuestion) {
  const lines = content.split('\n').filter(line => line.trim());
  const steps = [];
  let currentStep = null;

  lines.forEach(line => {
    // Check for step headers (e.g., "1. **Step Name**")
    const stepMatch = line.match(/^(\d+)\.\s+\*\*([^*]+)\*\*/);
    if (stepMatch) {
      if (currentStep) {
        steps.push(currentStep);
      }
      currentStep = {
        stepNumber: parseInt(stepMatch[1]),
        title: stepMatch[2].trim(),
        details: []
      };
    } else if (currentStep && line.trim().startsWith('•')) {
      // Add bullet points to current step
      currentStep.details.push(line.trim().substring(1).trim());
    } else if (currentStep && line.trim().startsWith('*')) {
      // Add bullet points to current step
      currentStep.details.push(line.trim().substring(1).trim());
    } else if (currentStep && line.trim() && !line.startsWith('|')) {
      // Add regular text to current step
      currentStep.details.push(line.trim());
    }
  });

  // Add the last step
  if (currentStep) {
    steps.push(currentStep);
  }

  if (steps.length > 0) {
    return {
      type: 'steps',
      data: steps,
      summary: `${steps.length} steps for ${userQuestion.toLowerCase()}`,
      originalContent: content
    };
  }

  return {
    type: 'text',
    content: content,
    summary: generateTextSummary(content, userQuestion)
  };
}

/**
 * Parse list content
 * @param {string} content - The list content
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted list data
 */
function parseListContent(content, userQuestion) {
  const lines = content.split('\n').filter(line => line.trim());
  const listItems = lines
    .filter(line => line.trim().startsWith('*') || line.trim().startsWith('•'))
    .map(line => line.trim().substring(1).trim());

  if (listItems.length > 0) {
    return {
      type: 'list',
      data: listItems,
      summary: `${listItems.length} items for ${userQuestion.toLowerCase()}`,
      originalContent: content
    };
  }

  return {
    type: 'text',
    content: content,
    summary: generateTextSummary(content, userQuestion)
  };
}

/**
 * Parse sections content
 * @param {string} content - The sections content
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted sections data
 */
function parseSectionsContent(content, userQuestion) {
  const lines = content.split('\n').filter(line => line.trim());
  const sections = [];
  let currentSection = null;

  lines.forEach(line => {
    // Check for section headers (e.g., "**Section Name**")
    const sectionMatch = line.match(/^\*\*([^*]+)\*\*/);
    if (sectionMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: sectionMatch[1].trim(),
        content: []
      };
    } else if (currentSection && line.trim()) {
      // Add content to current section
      currentSection.content.push(line.trim());
    }
  });

  // Add the last section
  if (currentSection) {
    sections.push(currentSection);
  }

  if (sections.length > 0) {
    return {
      type: 'sections',
      data: sections,
      summary: `${sections.length} sections for ${userQuestion.toLowerCase()}`,
      originalContent: content
    };
  }

  return {
    type: 'text',
    content: content,
    summary: generateTextSummary(content, userQuestion)
  };
}

/**
 * Process object data to make it more table-friendly
 * @param {object} obj - The object to process
 * @returns {object} Processed object
 */
function processObjectForTable(obj) {
  const processed = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Clean up key names
    const cleanKey = key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();

    // Format values appropriately
    let formattedValue = value;
    
    if (typeof value === 'number') {
      // Format currency values
      if (key.toLowerCase().includes('balance') || key.toLowerCase().includes('amount') || key.toLowerCase().includes('value')) {
        formattedValue = `$${value.toLocaleString()}`;
      } else {
        formattedValue = value.toLocaleString();
      }
    } else if (typeof value === 'string') {
      // Clean up string values
      formattedValue = value
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim();
    } else if (value === null || value === undefined) {
      formattedValue = '';
    }

    processed[cleanKey] = formattedValue;
  }

  return processed;
}

/**
 * Generate table headers from data
 * @param {Array} data - The data array
 * @returns {Array} Array of header strings
 */
function generateTableHeaders(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  const allKeys = new Set();
  data.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(key => allKeys.add(key));
    }
  });

  return Array.from(allKeys).sort();
}

/**
 * Generate summary text for table data
 * @param {Array} data - The data array
 * @param {string} userQuestion - The original user question
 * @returns {string} Summary text
 */
function generateTableSummary(data, userQuestion) {
  if (!Array.isArray(data) || data.length === 0) {
    return 'No data available.';
  }

  const question = userQuestion.toLowerCase();
  
  // Generate context-aware summary
  if (question.includes('balance') || question.includes('saldo')) {
    const totalBalance = data.reduce((sum, item) => {
      const balance = parseFloat(String(item.balance || item.amount || item.value || 0).replace(/[$,]/g, ''));
      return sum + (isNaN(balance) ? 0 : balance);
    }, 0);
    
    return `Total balance across ${data.length} account${data.length > 1 ? 's' : ''}: $${totalBalance.toLocaleString()}`;
  }
  
  if (question.includes('savings') || question.includes('poupança')) {
    const savingsAccounts = data.filter(item => 
      String(item.type || item.subtype || '').toLowerCase().includes('savings') ||
      String(item.name || '').toLowerCase().includes('savings') ||
      String(item.name || '').toLowerCase().includes('poupança')
    );
    
    if (savingsAccounts.length > 0) {
      const totalSavings = savingsAccounts.reduce((sum, item) => {
        const balance = parseFloat(String(item.balance || item.amount || 0).replace(/[$,]/g, ''));
        return sum + (isNaN(balance) ? 0 : balance);
      }, 0);
      
      return `Found ${savingsAccounts.length} savings account${savingsAccounts.length > 1 ? 's' : ''} with total balance: $${totalSavings.toLocaleString()}`;
    }
  }
  
  if (question.includes('account') || question.includes('conta')) {
    return `Showing ${data.length} account${data.length > 1 ? 's' : ''} with detailed information.`;
  }
  
  if (question.includes('transaction') || question.includes('transação')) {
    return `Showing ${data.length} recent transaction${data.length > 1 ? 's' : ''}.`;
  }

  // Default summary
  return `Displaying ${data.length} item${data.length > 1 ? 's' : ''} of financial data.`;
}

/**
 * Generate summary for text data
 * @param {any} data - The text data
 * @param {string} userQuestion - The original user question
 * @returns {string} Summary text
 */
function generateTextSummary(data, userQuestion) {
  if (typeof data === 'string') {
    return data.length > 100 ? data.substring(0, 100) + '...' : data;
  }
  
  return String(data);
} 