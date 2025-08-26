/**
 * Response Formatter Utility
 * Helps create user-friendly responses from tool results
 */

import { AI_CONFIG } from './aiConfig.js';

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

    // Check if the data makes mathematical sense
    const cashBalance = toolResult.totalCashBalance || 0;
    const otherAssets = toolResult.totalAssets || 0;
    
    // If cash balance equals net worth, all money is in cash
    if (cashBalance === toolResult.netWorth) {
      response += `, all in cash`;
    } 
    // If cash balance is less than net worth, show the breakdown
    else if (cashBalance < toolResult.netWorth && cashBalance > 0) {
      const remainingAssets = toolResult.netWorth - cashBalance;
      response += `, with $${cashBalance.toLocaleString()} in cash`;
      
      if (remainingAssets > 0) {
        response += ` and $${remainingAssets.toLocaleString()} in other assets`;
      }
    }
    // If cash balance is greater than net worth (shouldn't happen but handle gracefully)
    else if (cashBalance > toolResult.netWorth) {
      response += `, with $${toolResult.netWorth.toLocaleString()} in cash`;
    }

    if (toolResult.totalLiabilities !== undefined && toolResult.totalLiabilities > 0) {
      response += `. You have $${toolResult.totalLiabilities.toLocaleString()} in liabilities`;
    }

    response += '.';
    
    return {
      text: response,
      type: 'simple_text',
      shouldShowData: false
    };
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

  // Special handling for file data
  if (Array.isArray(data) && data.length > 0 && data[0].type && data[0].info) {
    console.log(`[responseFormatter] 📁 Detected file data, formatting for file display`);
    
    const formattedFiles = data.map(file => ({
      'File Name': file.info?.nameOfDocument || file.info?.name || 'Unnamed',
      'Type': file.type || 'Unknown',
      'Folder': file.folder || 'Root',
      'Updated': file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : 'Unknown'
    }));
    
    return {
      type: 'table',
      data: formattedFiles,
      headers: ['File Name', 'Type', 'Folder', 'Updated'],
      summary: `${data.length} file${data.length > 1 ? 's' : ''} found`
    };
  }

  // Handle array data (most common case for tables)
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return null;
    }

    // Check if user is asking about specific account types
    const question = userQuestion.toLowerCase();
    let filteredData = data;

    if (question.includes('saving') || question.includes('poupança')) {
      console.log(`[responseFormatter] 🔍 Filtering for savings accounts. Question: "${question}"`);
      console.log(`[responseFormatter] 📊 Original data length: ${data.length}`);
      console.log(`[responseFormatter] 📋 Sample data item:`, JSON.stringify(data[0], null, 2));
      
      // Filter to show only savings accounts
      filteredData = data.filter(item => {
        const accountType = String(item.account_type || item.type || '').toLowerCase();
        const accountSubtype = String(item.account_subtype || item.subtype || '').toLowerCase();
        const accountName = String(item.account_name || item.name || '').toLowerCase();
        const accountOfficialName = String(item.account_official_name || '').toLowerCase();
        const accountCategory = String(item.account_category || '').toLowerCase();
        
        const isSavings = accountType.includes('depository') ||
                         accountSubtype.includes('saving') ||
                         accountName.includes('saving') ||
                         accountOfficialName.includes('saving') ||
                         accountCategory.includes('saving') ||
                         String(item.name || '').toLowerCase().includes('poupança');
        
        console.log(`[responseFormatter] 🔍 Item "${item.account_name || item.name}":`, {
          accountType,
          accountSubtype,
          accountName,
          accountOfficialName,
          accountCategory,
          isSavings
        });
        
        return isSavings;
      });
      
      console.log(`[responseFormatter] ✅ Filtered data length: ${filteredData.length}`);
      
      if (filteredData.length === 0) {
        // No savings accounts found
        return {
          type: 'text',
          data: `No savings accounts found. You have ${data.length} other account${data.length > 1 ? 's' : ''} (checking, investment, etc.).`,
          summary: 'No savings accounts available'
        };
      }
      
      // Update data to filtered version
      data = filteredData;
    }

    // Check if this is actually tabular data or just a list
    if (isArrayTabularData(data)) {
      console.log(`[responseFormatter] 📊 Data is tabular, processing for table display`);
      
      // Process each item to create better table structure
      const processedData = data.map(item => {
        if (typeof item === 'object' && item !== null) {
          return processObjectForTable(item);
        }
        return item;
      });

      const result = {
        type: 'table',
        data: processedData,
        headers: generateTableHeaders(processedData),
        summary: null // Remove summary to avoid "Text content" wrapper
      };
      
      console.log(`[responseFormatter] ✅ Returning table result:`, {
        type: result.type,
        dataLength: result.data.length,
        headersCount: result.headers.length,
        summary: result.summary
      });
      
      return result;
    } else {
      console.log(`[responseFormatter] 📋 Data is not tabular, treating as list`);
      
      // This is a list, not a table
      const result = {
        type: 'list',
        data: data,
        summary: generateListSummary(data, userQuestion)
      };
      
      console.log(`[responseFormatter] ✅ Returning list result:`, {
        type: result.type,
        dataLength: result.data.length,
        summary: result.summary
      });
      
      return result;
    }
  }

  // Handle single object data
  if (typeof data === 'object' && data !== null) {
    // Check if this object is tabular or just a single item
    if (isObjectTabularData(data)) {
      const processedData = processObjectForTable(data);
      return {
        type: 'table',
        data: [processedData],
        headers: generateTableHeaders([processedData]),
        summary: null // Remove summary to avoid "Text content" wrapper
      };
    } else {
      // This is a single item, not a table
      return {
        type: 'item',
        data: data,
        summary: generateItemSummary(data, userQuestion)
      };
    }
  }

  // Handle primitive data - return as simple text, not table
  return {
    type: 'text',
    data: String(data),
    summary: generateTextSummary(data, userQuestion)
  };
}

/**
 * Check if object data is tabular (has multiple properties that could be columns)
 * @param {object} data - The object to check
 * @returns {boolean} True if data is tabular
 */
function isObjectTabularData(data) {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const keys = Object.keys(data);
  
  // Must have multiple properties to be considered tabular
  if (keys.length < 2) {
    return false;
  }

  // Check if properties have different types (indicating different kinds of data)
  const valueTypes = keys.map(key => typeof data[key]);
  const uniqueTypes = [...new Set(valueTypes)];
  
  // If we have different types of data, it's more likely to be tabular
  return uniqueTypes.length > 1;
}

/**
 * Check if array data is actually tabular (has consistent object structure)
 * @param {Array} data - The array to check
 * @returns {boolean} True if data is tabular
 */
function isArrayTabularData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  // Check if all items are objects with similar structure
  const firstItem = data[0];
  if (typeof firstItem !== 'object' || firstItem === null) {
    return false;
  }

  const firstItemKeys = Object.keys(firstItem);
  if (firstItemKeys.length === 0) {
    return false;
  }

  // Check if at least 80% of items have the same key structure
  const similarStructureCount = data.filter(item => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    
    const itemKeys = Object.keys(item);
    const commonKeys = firstItemKeys.filter(key => itemKeys.includes(key));
    return commonKeys.length >= firstItemKeys.length * 0.8; // At least 80% similarity
  }).length;

  return similarStructureCount >= data.length * 0.8;
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
 * Validate if LLM response follows structured content guidelines
 * @param {string} content - The LLM response content
 * @returns {object} Validation result with suggestions
 */
export function validateStructuredContent(content) {
  if (!content || typeof content !== 'string') {
    return { isValid: false, suggestions: ['Content must be a string'] };
  }

  const validation = {
    isValid: true,
    suggestions: [],
    detectedTypes: [],
    missingFormats: []
  };

  // Check for each structured type
  const types = AI_CONFIG.STRUCTURED_CONTENT.TYPES;
  const patterns = AI_CONFIG.STRUCTURED_CONTENT.FORMAT_PATTERNS;

  for (const type of types) {
    if (type === 'text') continue; // Skip text type as it's the fallback
    
    if (patterns[type] && patterns[type].test(content)) {
      validation.detectedTypes.push(type);
    } else {
      validation.missingFormats.push(type);
    }
  }

  // Generate suggestions for missing formats
  if (validation.missingFormats.length > 0) {
    validation.suggestions.push('Consider using structured formats for better mobile display:');
    
    if (validation.missingFormats.includes('steps')) {
      validation.suggestions.push('- Use numbered steps: 1. **Step Title** • Detail point');
    }
    if (validation.missingFormats.includes('list')) {
      validation.suggestions.push('- Use bullet points: • Item 1 • Item 2 • Item 3');
    }
    if (validation.missingFormats.includes('sections')) {
      validation.suggestions.push('- Use section headers: **Section Title** Content here');
    }
    if (validation.missingFormats.includes('table')) {
      validation.suggestions.push('- Use table format: | Header | Header | | Data | Data |');
    }
    if (validation.missingFormats.includes('item')) {
      validation.suggestions.push('- Use item format: **Item Title** • Detail 1 • Detail 2');
    }
  }

  // Consider it valid if at least one structured type is detected
  validation.isValid = validation.detectedTypes.length > 0 || content.length < 100;

  return validation;
}

/**
 * Check if content contains structured information
 * @param {string} content - The content to check
 * @returns {boolean} True if content is structured
 */
function isStructuredContent(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const lines = content.split('\n').filter(line => line.trim());
  
  // Check for various structured patterns
  const hasSteps = /\d+\.\s+\*\*/.test(content) || /Step\s+\d+/i.test(content);
  const hasList = /\*\s+/.test(content) || /•\s+/.test(content);
  const hasSections = /\*\*[^*]+\*\*/.test(content);
  const hasTable = /\|\s*[^|]+\s*\|/.test(content);
  
  // Check if content has multiple lines with consistent structure
  const hasConsistentStructure = lines.length > 2 && (
    hasSteps || hasList || hasSections || hasTable ||
    lines.some(line => line.trim().startsWith('•')) ||
    lines.some(line => line.trim().startsWith('*')) ||
    lines.some(line => /^\d+\./.test(line.trim()))
  );

  return hasConsistentStructure;
}

/**
 * Check if content is actually tabular data (not just structured text)
 * @param {string} content - The content to analyze
 * @returns {boolean} True if content is truly tabular
 */
function isTabularData(content) {
  // Must have pipe separators and multiple rows
  if (!content.includes('|')) {
    return false;
  }
  
  const lines = content.split('\n').filter(line => line.trim());
  const tableLines = lines.filter(line => line.includes('|'));
  
  // Need at least 2 lines with pipes to be a real table
  if (tableLines.length < 2) {
    return false;
  }
  
  // Check if the first line looks like headers (not just data)
  const firstLine = tableLines[0];
  const headerCells = firstLine.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);
  
  // Headers should be descriptive, not just data values
  const hasDescriptiveHeaders = headerCells.some(header => 
    header.length > 3 && 
    !/\d+/.test(header) && // Not just numbers
    !/^\$[\d,]+$/.test(header) && // Not just currency amounts
    !/^[A-Z][a-z]+$/.test(header) // Not just single words
  );
  
  return hasDescriptiveHeaders;
}

/**
 * Format content as structured data
 * @param {string} content - The content to format
 * @param {string} userQuestion - The original user question
 * @returns {object} Formatted structured data
 */
function formatAsStructuredData(content, userQuestion) {
  // Try to parse as table first, but only if it's truly tabular
  if (content.includes('|') && isTabularData(content)) {
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
    summary: null, // Remove summary to avoid "Text content" wrapper
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
  if (!content || typeof content !== 'string') {
    return {
      type: 'text',
      content: content,
      summary: 'Invalid steps content'
    };
  }

  const lines = content.split('\n').filter(line => line.trim());
  const steps = [];
  let currentStep = null;

  lines.forEach((line, lineIndex) => {
    const trimmedLine = line.trim();
    
    // Check for step headers (e.g., "1. **Step Name**", "Step 1: Name", "1. Name")
    const stepMatch = trimmedLine.match(/^(\d+)\.\s+\*\*([^*]+)\*\*/) || 
                     trimmedLine.match(/^Step\s+(\d+):?\s*(.+)/i) ||
                     trimmedLine.match(/^(\d+)\.\s+(.+)/);
    
    if (stepMatch) {
      if (currentStep) {
        steps.push(currentStep);
      }
      currentStep = {
        stepNumber: parseInt(stepMatch[1]),
        title: stepMatch[2].trim(),
        details: []
      };
    } else if (currentStep && (trimmedLine.startsWith('•') || trimmedLine.startsWith('*') || trimmedLine.startsWith('-') || trimmedLine.startsWith('◦'))) {
      // Add bullet points to current step
      const detail = trimmedLine.substring(1).trim();
      if (detail) {
        currentStep.details.push(detail);
      }
    } else if (currentStep && trimmedLine && !trimmedLine.startsWith('|') && !trimmedLine.startsWith('---')) {
      // Add regular text to current step (but not table separators)
      if (trimmedLine.length > 3) { // Only add meaningful content
        currentStep.details.push(trimmedLine);
      }
    }
  });

  // Add the last step
  if (currentStep) {
    steps.push(currentStep);
  }

  // Validate and clean steps
  const validSteps = steps.filter(step => 
    step && 
    step.title && 
    step.title.trim().length > 0 &&
    (step.details.length > 0 || step.title.length > 10) // Step must have content or a meaningful title
  );

  if (validSteps.length > 0) {
    return {
      type: 'steps',
      data: validSteps,
      summary: `${validSteps.length} step${validSteps.length > 1 ? 's' : ''}`,
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
  if (!content || typeof content !== 'string') {
    return {
      type: 'text',
      content: content,
      summary: 'Invalid list content'
    };
  }

  const lines = content.split('\n').filter(line => line.trim());
  const listItems = lines
    .filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('*') || 
             trimmed.startsWith('•') || 
             trimmed.startsWith('-') || 
             trimmed.startsWith('◦') ||
             trimmed.startsWith('✓') ||
             trimmed.startsWith('☐');
    })
    .map(line => {
      const trimmed = line.trim();
      // Remove bullet point and clean up
      const cleanItem = trimmed.substring(1).trim();
      return cleanItem.length > 0 ? cleanItem : null;
    })
    .filter(item => item !== null && item.length > 2); // Filter out empty or very short items

  if (listItems.length > 0) {
    return {
      type: 'list',
      data: listItems,
      summary: `${listItems.length} item${listItems.length > 1 ? 's' : ''}`,
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
  if (!content || typeof content !== 'string') {
    return {
      type: 'text',
      content: content,
      summary: 'Invalid sections content'
    };
  }

  const lines = content.split('\n').filter(line => line.trim());
  const sections = [];
  let currentSection = null;

  lines.forEach((line, lineIndex) => {
    const trimmedLine = line.trim();
    
    // Check for section headers (e.g., "**Section Name**", "Section Name:", "SECTION NAME")
    const sectionMatch = trimmedLine.match(/^\*\*([^*]+)\*\*/) ||
                        trimmedLine.match(/^([A-Z][^:]*):\s*$/) ||
                        trimmedLine.match(/^([A-Z][A-Z\s]+)$/);
    
    if (sectionMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: sectionMatch[1].trim(),
        content: []
      };
    } else if (currentSection && trimmedLine && !trimmedLine.startsWith('|') && !trimmedLine.startsWith('---')) {
      // Add content to current section (but not table separators)
      if (trimmedLine.length > 3) { // Only add meaningful content
        currentSection.content.push(trimmedLine);
      }
    }
  });

  // Add the last section
  if (currentSection) {
    sections.push(currentSection);
  }

  // Validate and clean sections
  const validSections = sections.filter(section => 
    section && 
    section.title && 
    section.title.trim().length > 0 &&
    (section.content.length > 0 || section.title.length > 5) // Section must have content or a meaningful title
  );

  if (validSections.length > 0) {
    return {
      type: 'sections',
      data: validSections,
      summary: `${validSections.length} section${validSections.length > 1 ? 's' : ''}`,
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
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested objects (like file.info)
      if (value.nameOfDocument) {
        formattedValue = value.nameOfDocument;
      } else if (value.name) {
        formattedValue = value.name;
      } else {
        formattedValue = JSON.stringify(value);
      }
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
 * Generate summary for text data
 * @param {any} data - The text data
 * @param {string} userQuestion - The original user question
 * @returns {string} Summary text
 */
function generateTextSummary(data, userQuestion) {
  if (typeof data === 'string') {
    return data.length > 100 ? data.substring(0, 100) + '...' : data;
  }
} 

/**
 * Generate summary for list data
 * @param {Array} data - The list data
 * @param {string} userQuestion - The original user question
 * @returns {string} Summary text
 */
function generateListSummary(data, userQuestion) {
  if (!Array.isArray(data) || data.length === 0) {
    return 'No items available.';
  }

  // Default summary - simple and direct
  return `${data.length} item${data.length > 1 ? 's' : ''}`;
}

/**
 * Generate summary for single item data
 * @param {object} data - The item data
 * @param {string} userQuestion - The original user question
 * @returns {string} Summary text
 */
function generateItemSummary(data, userQuestion) {
  if (!data || typeof data !== 'object') {
    return 'Item details';
  }

  // Default summary - simple and direct
  return 'Item details';
} 