// Zentavos AI Filters Module
// Provides filtering functions for transactions and accounts based on user-supplied filters.

/**
 * Filters transactions according to the provided filters.
 * @param {Array} cleanedData - Array of transaction objects.
 * @param {object} filters - Filtering criteria (dates, amounts, merchant, etc).
 * @returns {Array} Filtered transactions.
 */
export function filterTransactions(cleanedData, filters) {
  if (!filters) {
    return cleanedData;
  }
  const filtered = cleanedData.filter((tx) => {
    const {
      startDate,
      endDate,
      minAmount,
      maxAmount,
      merchantIncludes,
      accountId,
      isInvestment,
    } = filters;

    if (
      startDate &&
      tx.transactionDate &&
      new Date(tx.transactionDate) < new Date(startDate)
    ) {
      return false;
    }

    if (
      endDate &&
      tx.transactionDate &&
      new Date(tx.transactionDate) > new Date(endDate)
    ) {
      return false;
    }

    if (minAmount && tx.amount < minAmount) return false;

    if (maxAmount && tx.amount > maxAmount) return false;

    if (
      merchantIncludes &&
      !(
        (tx.merchant?.name &&
          tx.merchant.name
            .toLowerCase()
            .includes(merchantIncludes.toLowerCase())) ||
        (tx.merchant?.merchantName &&
          tx.merchant.merchantName
            .toLowerCase()
            .includes(merchantIncludes.toLowerCase())) ||
        (tx.name &&
          tx.name.toLowerCase().includes(merchantIncludes.toLowerCase()))
      )
    ) {
      return false;
    }

    if (accountId && tx.plaidAccountId !== accountId) return false;

    if (typeof isInvestment === "boolean" && tx.isInvestment !== isInvestment) {
      return false;
    }
    return true;
  });

  return filtered;
}

/**
 * Filters accounts according to the provided filters.
 * @param {Array} accounts - Array of account objects.
 * @param {object} filters - Filtering criteria (type, subtype, institution, name).
 * @returns {Array} Filtered accounts.
 */
export function filterAccounts(accounts, filters = {}) {
  return accounts.filter((account) => {
    const { accountType, accountSubtype, institutionName, nameIncludes } =
      filters;

    // Enhanced account type filtering with intelligent matching
    if (accountType) {
      const filterTypeKey = accountType.toLowerCase();
      const accountTypeKey = account.account_type?.toLowerCase();
      const accountName = account.account_name?.toLowerCase() || '';
      const accountOfficialName = account.account_official_name?.toLowerCase() || '';
      
      // Direct type match
      if (accountTypeKey === filterTypeKey) {
        // Direct match - continue to other filters
      }
      // Smart savings account detection
      else if (filterTypeKey === 'savings' || filterTypeKey === 'saving') {
        const isSavingsAccount = (
          accountTypeKey === 'depository' && (
            accountName.includes('saving') ||
            accountOfficialName.includes('saving') ||
            account.account_subtype?.toLowerCase() === 'savings'
          )
        ) || accountTypeKey === 'savings';
        
        if (!isSavingsAccount) {
          return false;
        }
      }
      // Smart checking account detection
      else if (filterTypeKey === 'checking') {
        const isCheckingAccount = (
          accountTypeKey === 'depository' && (
            accountName.includes('checking') ||
            accountOfficialName.includes('checking') ||
            account.account_subtype?.toLowerCase() === 'checking'
          )
        ) || accountTypeKey === 'checking';
        
        if (!isCheckingAccount) {
          return false;
        }
      }
      // Smart credit account detection  
      else if (filterTypeKey === 'credit' || filterTypeKey === 'credit card') {
        const isCreditAccount = (
          accountTypeKey === 'credit' ||
          accountName.includes('credit') ||
          accountOfficialName.includes('credit')
        );
        
        if (!isCreditAccount) {
          return false;
        }
      }
      // Smart investment account detection
      else if (filterTypeKey === 'investment' || filterTypeKey === 'investing') {
        const isInvestmentAccount = (
          accountTypeKey === 'investment' ||
          accountName.includes('investment') ||
          accountOfficialName.includes('investment') ||
          accountName.includes('brokerage') ||
          accountOfficialName.includes('brokerage')
        );
        
        if (!isInvestmentAccount) {
          return false;
        }
      }
      // Fallback to exact match for other types
      else if (accountTypeKey !== filterTypeKey) {
        return false;
      }
    }

    if (
      accountSubtype &&
      account.account_subtype?.toLowerCase() !== accountSubtype.toLowerCase()
    ) {
      return false;
    }

    if (
      institutionName &&
      account.institution_name?.toLowerCase() !== institutionName.toLowerCase()
    ) {
      return false;
    }

    if (
      nameIncludes &&
      !(
        (account.account_name &&
          account.account_name
            .toLowerCase()
            .includes(nameIncludes.toLowerCase())) ||
        (account.account_official_name &&
          account.account_official_name
            .toLowerCase()
            .includes(nameIncludes.toLowerCase()))
      )
    ) {
      return false;
    }

    return true;
  });
} 