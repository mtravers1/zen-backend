// Test Structured Content Detection
// This file tests if the structured content types are being detected correctly

import { validateStructuredContent } from './responseFormatter.js';

// Test cases for each structured content type
const testCases = [
  {
    name: 'Steps Format',
    content: `Here's how to save money:

1. **Create a Budget**
• Track your income and expenses
• Set spending limits for each category

2. **Reduce Expenses**
• Cancel unused subscriptions
• Cook meals at home instead of eating out

3. **Increase Income**
• Look for side hustles
• Ask for a raise at work`,
    expectedTypes: ['steps']
  },
  {
    name: 'List Format',
    content: `Here are money-saving tips:
• Create a budget
• Reduce expenses
• Increase income
• Save automatically
• Invest wisely`,
    expectedTypes: ['list']
  },
  {
    name: 'Sections Format',
    content: `**Budgeting Basics**
Start by tracking your income and expenses to understand your spending patterns.

**Expense Reduction**
Look for areas where you can cut back, such as subscriptions or dining out.

**Income Growth**
Consider side hustles or asking for a raise to increase your income.`,
    expectedTypes: ['sections']
  },
  {
    name: 'Table Format',
    content: `Here's your expense breakdown:
| Category | Amount | Percentage |
| Food     | $400   | 20%        |
| Housing  | $1200  | 60%        |
| Transport| $200   | 10%        |
| Other    | $200   | 10%        |`,
    expectedTypes: ['table']
  },
  {
    name: 'Item Format',
    content: `**Emergency Fund**
• Save 3-6 months of expenses
• Keep in high-yield savings account
• Only use for true emergencies`,
    expectedTypes: ['item']
  },
  {
    name: 'Mixed Format',
    content: `**Financial Planning Guide**

1. **Assess Current Situation**
• Calculate net worth
• Review monthly expenses

**Next Steps**
• Create emergency fund
• Start retirement planning

| Priority | Action | Timeline |
| High     | Emergency Fund | 3 months |
| Medium   | Debt Payoff | 6 months |`,
    expectedTypes: ['steps', 'sections', 'table']
  },
  {
    name: 'Plain Text',
    content: `To save money, you should create a budget and track your expenses. Look for ways to reduce spending and consider increasing your income through side hustles.`,
    expectedTypes: []
  }
];

// Run tests
console.log('🧪 Testing Structured Content Detection...\n');

testCases.forEach((testCase, index) => {
  console.log(`${index + 1}. Testing: ${testCase.name}`);
  
  const result = validateStructuredContent(testCase.content);
  
  console.log(`   Expected types: ${testCase.expectedTypes.join(', ') || 'none'}`);
  console.log(`   Detected types: ${result.detectedTypes.join(', ') || 'none'}`);
  console.log(`   Is valid: ${result.isValid ? '✅' : '❌'}`);
  
  if (result.suggestions.length > 0) {
    console.log(`   Suggestions:`);
    result.suggestions.forEach(suggestion => {
      console.log(`     - ${suggestion}`);
    });
  }
  
  console.log('');
});

console.log('🏁 Structured content testing completed!');
