import plaidService from "./plaid.service.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import { getUserDek } from "../database/encryption.js";
import { createSafeDecrypt, createSafeEncrypt, safeDecryptNumericValue } from "../lib/encryptionHelper.js";

import structuredLogger from "../lib/structuredLogger.js";
export const formatTransactionAmount = (transaction, account) => {


  if (
    (account.account_type === "depository" && account.account_subtype !== "cd" && account.account_subtype !== "money market") || 
    account.account_type === "credit" || 
    account.account_type === "loan"
  ) {
    transaction.amount = transaction.amount * -1;
  } else if (account.account_type === "investment") {
    if (
      transaction.type === 'buy' ||
      transaction.type === 'fee' ||
      transaction.type === 'reinvested_dividend'
    ) {
      transaction.amount = transaction.amount * -1;
    } else if (
      transaction.type === 'sell' ||
      transaction.type === 'dividend'
    ) {
      if (transaction.amount < 0) {
        transaction.amount = transaction.amount * -1;
      }
    }
  }



  return transaction;
};



const getTransactions = async (
  accounts,
  uid,
  pagination = { paginate: false },
) => {
  return await structuredLogger.withContext(
    "get_transactions",
    { uid, accounts_count: accounts.length, pagination },
    async () => {
      structuredLogger.logInfo("get_transactions_started", { accounts_count: accounts.length });
      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid, dek);

      const accountIds = accounts.map(a => a.plaid_account_id);
      const findQuery = { plaidAccountId: { $in: accountIds } };

      let transactionsToProcess = [];
      let totalCount = 0;

      if (pagination && pagination.paginate) {
        const { page = 1, limit = 50 } = pagination;
        const skip = (page - 1) * limit;

        totalCount = await Transaction.countDocuments(findQuery);
        transactionsToProcess = await Transaction.find(findQuery)
          .sort({ transactionDate: -1 })
          .skip(skip)
          .limit(limit)
          .lean();
      } else {
        transactionsToProcess = await Transaction.find(findQuery)
          .sort({ transactionDate: -1 })
          .lean();
        totalCount = transactionsToProcess.length;
      }
      
      const accountsMap = new Map(accounts.map(acc => [acc.plaid_account_id, acc]));
      const allTransactions = [];

      for (const transaction of transactionsToProcess) {
        const account = accountsMap.get(transaction.plaidAccountId);
        if (!account) {
            structuredLogger.logWarn("get_transactions_account_not_found_for_transaction", { plaidAccountId: transaction.plaidAccountId });
            continue;
        }

        let decryptedAmount = await safeDecryptNumericValue(transaction.amount, safeDecrypt, {
          model: Transaction,
          docId: transaction._id,
          fieldPath: "amount",
        });

        if (decryptedAmount === null) {
          structuredLogger.logError("get_transactions_decryption_error", { transaction_id: transaction._id, field: "amount" });
          continue;
        }

        let decryptedType = await safeDecrypt(transaction.type, {
          model: Transaction,
          docId: transaction._id,
          fieldPath: "type",
        });

        const formattedTransaction = formatTransactionAmount({ ...transaction, amount: decryptedAmount, type: decryptedType }, account);
        decryptedAmount = formattedTransaction.amount;
        
        let decryptedName = await safeDecrypt(transaction.name, {
          model: Transaction,
          docId: transaction._id,
          fieldPath: "name",
        });
        
        let decryptedAccountType = await safeDecrypt(
          transaction.accountType,
          { model: Transaction, docId: transaction._id, fieldPath: "accountType" },
        );

        let decryptedMerchantName;
        let decryptedMerchantMerchantName;
        let merchantCategory;
        let merchantLogo;
        let merchantWebsite;
        if (transaction.merchant) {
          decryptedMerchantName = await safeDecrypt(
            transaction.merchant.name,
            { model: Transaction, docId: transaction._id, fieldPath: "merchant.name" },
          );

          decryptedMerchantMerchantName = await safeDecrypt(
            transaction.merchant.merchantName,
            {
              model: Transaction,
              docId: transaction._id,
              fieldPath: "merchant.merchantName",
            },
          );

          merchantCategory = await safeDecrypt(
            transaction.merchant.merchantCategory,
            {
              model: Transaction,
              docId: transaction._id,
              fieldPath: "merchant.merchantCategory",
            },
          );

          merchantLogo = await safeDecrypt(
              transaction.merchant.logo,
              { model: Transaction, docId: transaction._id, fieldPath: "merchant.logo" },
          );

          merchantWebsite = await safeDecrypt(
              transaction.merchant.website,
              { model: Transaction, docId: transaction._id, fieldPath: "merchant.website" },
          );
        }

        const decryptedFees = await safeDecryptNumericValue(transaction.fees, safeDecrypt, {
          model: Transaction,
          docId: transaction._id,
          fieldPath: "fees",
        });

        const decryptedPrice = await safeDecryptNumericValue(transaction.price, safeDecrypt, {
          model: Transaction,
          docId: transaction._id,
          fieldPath: "price",
        });

        let decryptedSubtype = await safeDecrypt(transaction.subtype, {
          model: Transaction,
          docId: transaction._id,
          fieldPath: "subtype",
        });

        const decryptedQuantity = await safeDecryptNumericValue(
          transaction.quantity, safeDecrypt,
          { model: Transaction, docId: transaction._id, fieldPath: "quantity" },
        );

        let decryptedSecurityId = await safeDecrypt(
          transaction.securityId,
          { model: Transaction, docId: transaction._id, fieldPath: "securityId" },
        );

        let decryptedDescription = null;
        if (transaction.description) {
          decryptedDescription = await safeDecrypt(transaction.description, {
              model: Transaction,
              docId: transaction._id,
              fieldPath: "description",
          });
        }

        let decryptedNotes = null;
        if (transaction.notes) {
          decryptedNotes = await safeDecrypt(transaction.notes, {
              model: Transaction,
              docId: transaction._id,
              fieldPath: "notes",
          });
        }

        let decryptedTags = null;
        if (transaction.tags && typeof transaction.tags === 'string') {
          decryptedTags = await safeDecrypt(transaction.tags, {
              model: Transaction,
              docId: transaction._id,
              fieldPath: "tags",
          });
        }
        
        const decryptedInstitutionName = await safeDecrypt(
          account.institution_name,
          { account_id: account._id, field: "institution_name" },
        );

        allTransactions.push({
          ...transaction,
          amount: decryptedAmount,
          name: decryptedName,
          merchant: transaction.merchant ? {
            ...transaction.merchant,
            name: decryptedMerchantName,
            merchantName: decryptedMerchantMerchantName,
            merchantCategory: merchantCategory,
            logo: merchantLogo,
            website: merchantWebsite,
          } : null,
          fees: decryptedFees,
          price: decryptedPrice,
          type: decryptedType,
          subtype: decryptedSubtype,
          quantity: decryptedQuantity,
          securityId: decryptedSecurityId,
          accountType: decryptedAccountType,
          description: decryptedDescription,
          notes: decryptedNotes,
          tags: decryptedTags,
          institutionName: decryptedInstitutionName,
          institutionId: account.institution_id,
        });
      }

      if (pagination && pagination.paginate) {
        const { page = 1, limit = 50 } = pagination;

        return {
          data: allTransactions,
          pagination: {
            total: totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
          },
        };
      }

      return allTransactions;
    },
  );
};

const getUserTransactions = async (
  email,
  uid,
  pagination = { paginate: false },
) => {
  const user = await User.findOne({ authUid: uid })
    .populate("plaidAccounts")
    .exec();

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.plaidAccounts.length) {
    return pagination.paginate
      ? {
          data: [],
          pagination: {
            total: 0,
            page: pagination.page || 1,
            limit: pagination.limit || 50,
            totalPages: 0,
          },
        }
      : [];
  }

  const accounts = user.plaidAccounts;
  const decryptedAccounts = [];
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);

  for (const account of accounts) {
    const decryptedAccount = { ...account.toObject() };
    try {
      decryptedAccount.account_type = await safeDecrypt(
        account.account_type,
        { account_id: account._id, field: "account_type" },
      );
      decryptedAccount.account_subtype = await safeDecrypt(
        account.account_subtype,
        { account_id: account._id, field: "account_subtype" },
      );
    } catch (e) {
      console.error(`Failed to decrypt account_type for account ${account._id}:`, e);
    }
    decryptedAccounts.push(decryptedAccount);
  }

  return getTransactions(decryptedAccounts, uid, pagination);
};

const getProfileTransactions = async (
  profile,
  uid,
  pagination = { paginate: false },
) => {
  structuredLogger.logInfo("get_profile_transactions_started", { profile, uid, pagination });

  if (!profile) {
    structuredLogger.logError("get_profile_transactions_error", { message: "Profile not found", uid });
    throw new Error("Profile not found");
  }

  const plaidIds = profile.plaidAccounts;
  structuredLogger.logInfo("get_profile_transactions_plaid_ids", { plaidIds, profileId: profile.id });

  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  structuredLogger.logInfo("get_profile_transactions_plaid_accounts_response", { count: plaidAccountsResponse.length });

  let plaidAccounts = [];
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);

  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await safeDecrypt(
      plaidAccount.currentBalance,
      { account_id: plaidAccount._id, field: "currentBalance" },
    );
    const decryptedAvailableBalance = await safeDecrypt(
      plaidAccount.availableBalance,
      { account_id: plaidAccount._id, field: "availableBalance" },
    );
    const decryptedAccountType = await safeDecrypt(
      plaidAccount.account_type,
      { account_id: plaidAccount._id, field: "account_type" },
    );
    const decryptedAccountSubtype = await safeDecrypt(
      plaidAccount.account_subtype,
      { account_id: plaidAccount._id, field: "account_subtype" },
    );

    plaidAccounts.push({
      ...plaidAccount,
      currentBalance: decryptedCurrentBalance,
      availableBalance: decryptedAvailableBalance,
      account_type: decryptedAccountType,
      account_subtype: decryptedAccountSubtype,
    });
  }

  structuredLogger.logInfo("get_profile_transactions_finished_decryption", { count: plaidAccounts.length });

  return await getTransactions(plaidAccounts, uid, pagination);
};

const getTransactionsByAccount = async (
  accountId,
  uid,
  pagination = { paginate: false },
  context // Added context parameter here
) => {
  const account = await PlaidAccount.findOne({ plaid_account_id: accountId })
    .populate("transactions")
    .lean()
    .exec();

  if (!account) {
    throw new Error("Account not found");
  }

  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);

  const decryptedAccountType = await safeDecrypt(
    account.account_type,
    { account_id: account._id, field: "account_type" },
  );
  account.account_type = decryptedAccountType;

  const decryptedAccountSubtype = await safeDecrypt(
    account.account_subtype,
    { account_id: account._id, field: "account_subtype" },
  );
  account.account_subtype = decryptedAccountSubtype;

  const transactionsResponse = await Transaction.find({
    plaidAccountId: account.plaid_account_id,
  })
    .sort({ transactionDate: -1 })
    .lean();

  let allTransactions = [];

  for (const transaction of transactionsResponse) {
    let decryptedAmount = await safeDecryptNumericValue(transaction.amount, safeDecrypt, {
      transaction_id: transaction._id,
      field: "amount",
    });

    if (decryptedAmount === null) {
      continue;
    }

    let decryptedType = null;
    try {
      decryptedType = await safeDecrypt(transaction.type, {
        transaction_id: transaction._id,
        field: "type",
      });
    } catch (e) {
      console.error(`Failed to decrypt type for transaction ${transaction._id}:`, e);
    }
    
    let finalAmount = decryptedAmount;

    // Apply context-specific amount formatting
    if (context === 'details_page') {
        if (account.account_type === 'depository') {
            // For depository accounts on details page, purchases are negative.
            finalAmount = decryptedAmount * -1;
        } 
        // For credit accounts on details page, purchases are positive (raw value).
        // For loan accounts on details page, leave as raw.
    } else {
        // Default to the original universal formatting for other contexts (e.g., dashboard)
        const formattedTx = formatTransactionAmount({ ...transaction, amount: decryptedAmount, type: decryptedType }, account);
        finalAmount = formattedTx.amount;
    }

    let decryptedName = null;
    try {
      decryptedName = await safeDecrypt(transaction.name, {
        transaction_id: transaction._id,
        field: "name",
      });
    } catch (e) {
      console.error(`Failed to decrypt name for transaction ${transaction._id}:`, e);
    }

    let decryptedAccountType = null;
    try {
      decryptedAccountType = await safeDecrypt(
        transaction.accountType,
        { transaction_id: transaction._id, field: "accountType" },
      );
    } catch (e) {
      console.error(`Failed to decrypt accountType for transaction ${transaction._id}:`, e);
    }
    let decryptedMerchantName;
    let decryptedMerchantMerchantName;
    let merchantCategory;
    if (transaction.merchant) {
      try {
        decryptedMerchantName = await safeDecrypt(transaction.merchant.name, {
          transaction_id: transaction._id,
          field: "merchant.name",
        });
      } catch (e) {
        console.error(`Failed to decrypt merchant.name for transaction ${transaction._id}:`, e);
      }

      try {
        decryptedMerchantMerchantName = await safeDecrypt(
          transaction.merchant.merchantName,
          {
            transaction_id: transaction._id,
            field: "merchant.merchantName",
          },
        );
      } catch (e) {
        console.error(`Failed to decrypt merchant.merchantName for transaction ${transaction._id}:`, e);
      }

      merchantCategory = transaction.merchant.merchantCategory;
    }

    const decryptedFees = await safeDecryptNumericValue(transaction.fees, safeDecrypt, {
      transaction_id: transaction._id,
      field: "fees",
    });

    const decryptedPrice = await safeDecryptNumericValue(transaction.price, safeDecrypt, {
      transaction_id: transaction._id,
      field: "price",
    });

    let decryptedSubtype = null;
    try {
      decryptedSubtype = await safeDecrypt(transaction.subtype, {
        transaction_id: transaction._id,
        field: "subtype",
      });
    } catch (e) {
      console.error(`Failed to decrypt subtype for transaction ${transaction._id}:`, e);
    }

    const decryptedQuantity = await safeDecryptNumericValue(transaction.quantity, safeDecrypt, {
      transaction_id: transaction._id,
      field: "quantity",
    });

    let decryptedSecurityId = null;
    try {
      decryptedSecurityId = await safeDecrypt(
        transaction.securityId,
        { transaction_id: transaction._id, field: "securityId" },
      );
    } catch (e) {
      console.error(`Failed to decrypt securityId for transaction ${transaction._id}:`, e);
    }

    let decryptedDescription = null;
    try {
      if (transaction.description) {
        decryptedDescription = await safeDecrypt(transaction.description, {
            transaction_id: transaction._id,
            field: "description",
        });
      }
    } catch (e) {
      console.error(`Failed to decrypt description for transaction ${transaction._id}:`, e);
    }

    let decryptedNotes = null;
    try {
      if (transaction.notes) {
        decryptedNotes = await safeDecrypt(transaction.notes, {
            transaction_id: transaction._id,
            field: "notes",
        });
      }
    } catch (e) {
      console.error(`Failed to decrypt notes for transaction ${transaction._id}:`, e);
    }

    let decryptedTags = null;
    try {
      if (transaction.tags && typeof transaction.tags === 'string') {
        decryptedTags = await safeDecrypt(transaction.tags, {
            transaction_id: transaction._id,
            field: "tags",
        });
      }
    } catch (e) {
      console.error(`Failed to decrypt tags for transaction ${transaction._id}:`, e);
    }

    allTransactions.push({
      ...transaction,

      amount: finalAmount,

      name: decryptedName,

      merchant: transaction.merchant ? {
        ...transaction.merchant,

        name: decryptedMerchantName,

        merchantName: decryptedMerchantMerchantName,
        merchantCategory: merchantCategory,
      } : null,

      fees: decryptedFees,

      price: decryptedPrice,

      type: decryptedType,

      subtype: decryptedSubtype,

      quantity: decryptedQuantity,

      accountType: decryptedAccountType,
      description: decryptedDescription,
      notes: decryptedNotes,
      tags: decryptedTags,
    });
  }

  allTransactions.forEach((transaction) => {
    transaction.institutionName = account.institution_name;

    transaction.institutionId = account.institution_id;
  });

  const sortedTransactions = allTransactions.sort(
    (a, b) => new Date(b.transactionDate) - new Date(a.transactionDate),
  );

  // Apply pagination if requested

  if (pagination && pagination.paginate) {
    const { page = 1, limit = 50 } = pagination;

    const startIndex = (page - 1) * limit;

    const endIndex = page * limit;

    const paginatedResults = {
      data: sortedTransactions.slice(startIndex, endIndex),

      pagination: {
        total: sortedTransactions.length,

        page,

        limit,

        totalPages: Math.ceil(sortedTransactions.length / limit),
      },
    };

    return paginatedResults;
  }

  return sortedTransactions;
};


const transactionsService = {
  getTransactions,
  getUserTransactions,
  getProfileTransactions,
  getTransactionsByAccount,
};



export default transactionsService;
