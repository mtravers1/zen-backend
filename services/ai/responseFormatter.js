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
      return `Found ${toolResult.length} transaction${toolResult.length > 1 ? 's' : ''} for your request.`;
    }
  }

  // Handle generic data
  if (typeof toolResult === 'object' && Object.keys(toolResult).length > 0) {
    return 'Here is your financial information based on your account records.';
  }

  return 'No financial data available for your request.';
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