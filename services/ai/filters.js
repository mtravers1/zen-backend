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

    // Enhanced account type filtering that handles smart mapping
    if (accountType) {
      const filterTypeNormalized = accountType.toLowerCase();
      const accountTypeNormalized = account.account_type?.toLowerCase();
      const accountSubtypeNormalized = account.account_subtype?.toLowerCase();
      
      // Handle smart filtering for common user queries
      if (filterTypeNormalized === 'savings') {
        // For savings, check if account_subtype is 'savings' and account_type is 'depository'
        if (!(accountTypeNormalized === 'depository' && accountSubtypeNormalized === 'savings')) {
          return false;
        }
      } else if (filterTypeNormalized === 'checking') {
        // For checking, check if account_subtype is 'checking' and account_type is 'depository'
        if (!(accountTypeNormalized === 'depository' && accountSubtypeNormalized === 'checking')) {
          return false;
        }
      } else if (filterTypeNormalized === 'credit card' || filterTypeNormalized === 'credit') {
        // For credit cards, check if account_type is 'credit' 
        if (accountTypeNormalized !== 'credit') {
          return false;
        }
      } else {
        // Default behavior: match account_type directly
        if (accountTypeNormalized !== filterTypeNormalized) {
          return false;
        }
      }
    }

    // Standard account subtype filtering
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