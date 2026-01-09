import crypto from 'crypto';
import plaidService from "./plaid.service.js";
import { storage, filesBucketName } from "../lib/storageClient.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import businessService from "./businesses.service.js";

import Liability from "../database/models/Liability.js";
import AccessToken from "../database/models/AccessToken.js";
import assetsService from "./assets.service.js";

import {
  decryptValue,
  encryptValue,
  getUserDek,
  hashValue,
} from "../database/encryption.js";
import {
  calculateWeeklyTotals,
  groupByWeek,
} from "./utils/accounts.js";
import structuredLogger from "../lib/structuredLogger.js";

import {
  createSafeEncrypt,
  createSafeDecrypt,
  safeDecryptNumericValue,
} from "../lib/encryptionHelper.js";

const addAccount = async (accessToken, email, uid) => {
  return await structuredLogger.withContext(
    "add_account",
    { email, uid },
    async () => {
      const dek = await getUserDek(uid);
      const safeEncrypt = createSafeEncrypt(uid, dek);
      const safeDecrypt = createSafeDecrypt(uid, dek);

      const user = await User.findOne({
        authUid: uid,
      });
      if (!user) {
        throw new Error("User not found");
      }
      const userId = user._id.toString();
      const userType = user.role;
      const accountsResponse =
        await plaidService.getAccountsWithAccessToken(accessToken);

      const accounts = accountsResponse.accounts;
      const institutionId = accountsResponse.item.institution_id;
      const institutionName = accountsResponse.item.institution_name;

      await plaidService.saveAccessToken(
        email,
        accessToken,
        accountsResponse.item.item_id,
        institutionId,
        uid
      );

      const userAccounts = user.plaidAccounts;
      let savedAccounts = [];
      const accountTypes = {};
      const existingAccounts = [];
      const allAccounts = [];

      for (let account of accounts) {
        const hashAccountName = hashValue(account.name);
        const hashAccountInstitutionId = hashValue(
          accountsResponse.item.institution_id,
        );
        const hashAccountMask = hashValue(account.mask);

        const existingAccount = await PlaidAccount.findOne({
          hashAccountName,
          hashAccountInstitutionId,
          hashAccountMask,
          owner_id: user._id,
        });

        if (existingAccount) {
          existingAccounts.push(existingAccount);
          allAccounts.push(existingAccount);
          continue;
        }

        const encryptedMask = await safeEncrypt(account.mask, {
          account_id: account.account_id,
          field: "mask",
        });

        const encryptedName = await safeEncrypt(account.name, {
          account_id: account.account_id,
          field: "name",
        });

        let encryptedOfficialName;

        if (account.official_name) {
          encryptedOfficialName = await safeEncrypt(
            account.official_name,
            { account_id: account.account_id, field: "official_name" },
          );
        }

        const encryptedType = await safeEncrypt(account.type, {
          account_id: account.account_id,
          field: "type",
        });

        const encryptedSubtype = await safeEncrypt(account.subtype, {
          account_id: account.account_id,
          field: "subtype",
        });

        const encryptedInstitutionName = await safeEncrypt(
          institutionName,
          { account_id: account.account_id, field: "institutionName" },
        );

        let encryptedCurrentBalance;
        let encryptedAvailableBalance;

        if (account.balances) {
          if (account.balances.current) {
            encryptedCurrentBalance = await safeEncrypt(
              account.balances.current,
              { account_id: account.account_id, field: "currentBalance" },
            );
          }

          if (account.balances.available) {
            encryptedAvailableBalance = await safeEncrypt(
              account.balances.available,
              { account_id: account.account_id, field: "availableBalance" },
            );
          }
        }

        const newAccount = new PlaidAccount({
          owner_id: userId,
          itemId: accountsResponse.item.item_id,
          owner_type: userType,
          plaid_account_id: account.account_id,
          account_name: encryptedName,
          account_official_name: encryptedOfficialName,
          account_type: encryptedType,
          account_subtype: encryptedSubtype,
          institution_name: encryptedInstitutionName,
          institution_id: institutionId,
          image_url: account.institution_name,
          currentBalance: encryptedCurrentBalance,
          availableBalance: encryptedAvailableBalance,
          currency: account.balances.iso_currency_code,
          transactions: [],
          nextCursor: null,
          mask: encryptedMask,
          hashAccountName,
          hashAccountInstitutionId,
          hashAccountMask,
        });

        accountTypes[account.account_id] = account.type;

        userAccounts.push(newAccount._id);

        await user.save();
        await newAccount.save();
        savedAccounts.push(newAccount);
        allAccounts.push(newAccount);
      }

      const responseExistingAccounts = await Promise.all(
        existingAccounts.map(async (ec) => {
          return {
            id: ec.id,
            name: await safeDecrypt(ec.account_name, {
              account_id: ec.id,
              field: "account_name",
            }),
          };
        }),
      );

      let transactionsResponse;
      let investmentTransactionsResponse;
      let liabilitiesResponse;
      if (accountsResponse.item.products.includes("transactions")) {
        try {
          transactionsResponse =
            await plaidService.getTransactionsWithAccessToken(accessToken);
        } catch (error) {
          console.error(
            "Error fetching transactions:",
            error.response?.data || error,
          );
        }
      }

      if (accountsResponse.item.products.includes("investments")) {
        try {
          investmentTransactionsResponse =
            await plaidService.getInvestmentTransactionsWithAccessToken(
              accessToken,
            );
        } catch (error) {
          console.error(
            "Error fetching investment transactions:",
            error.response?.data || error,
          );
        }
      }

      if (accountsResponse.item.products.includes("liabilities")) {
        try {
          liabilitiesResponse =
            await plaidService.getLoanLiabilitiesWithAccessToken(accessToken);
        } catch (error) {
          console.error(
            "Error fetching liabilities:",
            error.response?.data || error,
          );
        }
      }

      if (accountsResponse.item.products.includes("investments")) {
        try {
          await plaidService.updateInvestmentTransactions(
            accountsResponse.item.item_id,
          );
        } catch (error) {
          console.error(
            "Error updating investment transactions:",
            error.response?.data || error,
          );
        }
      }

      const nextCursor = transactionsResponse
        ? transactionsResponse.next_cursor
        : null;
      const transactions = transactionsResponse
        ? transactionsResponse.added
        : [];
      const investmentTransactions = investmentTransactionsResponse
        ? investmentTransactionsResponse.investment_transactions
        : [];

      const transactionsByAccount = {};

      for (const transaction of transactions) {
        const existingTransaction = await Transaction.findOne({
          plaidTransactionId: transaction.transaction_id,
        });

        if (existingTransaction) continue;

        const accountType = accountTypes[transaction.account_id];

        const existingAccount = await PlaidAccount.findOne({
          plaid_account_id: transaction.account_id,
        });

        const account = allAccounts.find(
          (account) => account.plaid_account_id === transaction.account_id,
        );

        if (!account) {
          continue;
        }

        let merchantName;
        let name;

        if (transaction.merchant_name) {
          merchantName = await safeEncrypt(transaction.merchant_name);
        }

        if (transaction.name) {
          name = await safeEncrypt(transaction.name);
        }

        const merchantCategory = transaction.category?.[0];
        const website = transaction.website;
        const logo = transaction.logo_url;
        const merchant = {
          merchantName: merchantName,
          name: name,
          merchantCategory: merchantCategory,
          website: website,
          logo: logo,
        };

        let transactionCode;

        const encyptedAmount = await safeEncrypt(transaction.amount);

        if (transaction.transaction_code) {
          transactionCode = await safeEncrypt(transaction.transaction_code);
        }
        let encryptedAccountType;
        if (accountType) {
          encryptedAccountType = await safeEncrypt(accountType);
        }

        const encryptedTags = await safeEncrypt(transaction.category);

        const newTransaction = new Transaction({
          accountId: account._id,
          plaidTransactionId: transaction.transaction_id,
          plaidAccountId: transaction.account_id,
          transactionDate: transaction.date,
          amount: encyptedAmount,
          currency: transaction.iso_currency_code,
          notes: null,
          merchant: merchant,
          description: null,
          transactionCode: transactionCode,
          tags: encryptedTags,
          accountType: encryptedAccountType,
        });

        await newTransaction.save();

        if (!transactionsByAccount[transaction.account_id]) {
          transactionsByAccount[transaction.account_id] = [];
        }

        transactionsByAccount[transaction.account_id].push(newTransaction._id);
      }

      for (const transaction of investmentTransactions) {
        const existingTransaction = await Transaction.findOne({
          plaidTransactionId: transaction.investment_transaction_id,
        });

        if (existingTransaction) continue;

        const account = allAccounts.find(
          (account) => account.plaid_account_id === transaction.account_id,
        );

        if (!account) {
          console.error(
            `Could not find account for transaction ${transaction.investment_transaction_id} with account_id ${transaction.account_id}`,
          );
          continue;
        }

        const accountType = "investment";
        const encryptedAmount = await safeEncrypt(transaction.amount, { context: { transactionKind: 'investment', field: 'amount' } });
        const encryptedAccountType = await safeEncrypt(accountType, { context: { transactionKind: 'investment', field: 'accountType' } });

        const name = await safeEncrypt(transaction.name, { context: { transactionKind: 'investment', field: 'name' } });

        const fees = await safeEncrypt(transaction.fees, { context: { transactionKind: 'investment', field: 'fees' } });

        const price = await safeEncrypt(transaction.price, { context: { transactionKind: 'investment', field: 'price' } });

        const quantity = await safeEncrypt(transaction.quantity, { context: { transactionKind: 'investment', field: 'quantity' } });

        const securityId = await safeEncrypt(transaction.security_id, { context: { transactionKind: 'investment', field: 'securityId' } });

        const type = await safeEncrypt(transaction.type, { context: { transactionKind: 'investment', field: 'type' } });

        const subtype = await safeEncrypt(transaction.subtype, { context: { transactionKind: 'investment', field: 'subtype' } });

        const newTransaction = new Transaction({
          accountId: account._id,
          plaidTransactionId: transaction.investment_transaction_id,
          plaidAccountId: transaction.account_id,
          transactionDate: transaction.date,
          amount: encryptedAmount,
          currency: transaction.iso_currency_code,
          isInvestment: true,
          name: name,
          fees: fees,
          price: price,
          quantity: quantity,
          securityId: securityId,
          type: type,
          subtype: subtype,
          accountType: encryptedAccountType,
        });

        await newTransaction.save();

        if (!transactionsByAccount[transaction.account_id]) {
          transactionsByAccount[transaction.account_id] = [];
        }

        transactionsByAccount[transaction.account_id].push(newTransaction._id);
      }

            if (liabilitiesResponse) {
              for (const [key, value] of Object.entries(
                liabilitiesResponse.liabilities,
              )) {
                if (Array.isArray(value)) {
                  for (const item of value) {
                    //if accountid is not in savedaccounts, then skip
                    if (
                      !savedAccounts.find(
                        (account) => account.plaid_account_id === item.account_id,
                      )
                    )
                      continue;
      
                    const encryptedAccountNumber = await safeEncrypt(
                      item.account_number,
                    );
      
                    const encryptedLastPaymentAmount = await safeEncrypt(
                      item.last_payment_amount,
                    );
      
                    const encryptedMinimumPaymentAmount = await safeEncrypt(
                      item.minimum_payment_amount,
                    );
      
                    const encryptedLastStatementBalance = await safeEncrypt(
                      item.last_statement_balance,
                    );
      
                    const encryptedLoanTypeDescription = await safeEncrypt(
                      item.loan_type_description,
                    );
      
                    const encryptedLoanTerm = await safeEncrypt(item.loan_term);
      
                    const encryptedNextMonthlyPayment = await safeEncrypt(
                      item.next_monthly_payment,
                    );
      
                    const encryptedOriginationPrincipalAmount = await safeEncrypt(
                      item.origination_principal_amount,
                    );
      
                    const encryptedPastDueAmount = await safeEncrypt(
                      item.past_due_amount,
                    );
      
                    const encryptedEscrowBalance = await safeEncrypt(
                      item.escrow_balance,
                    );
      
                    const encryptedHasPmi = await safeEncrypt(item.has_pmi);
      
                    const encryptedHasPrepaymentPenalty = await safeEncrypt(
                      item.has_prepayment_penalty,
                    );
                    let encryptedPropertyAddress;
                    if (item.property_address) {
                      encryptedPropertyAddress = {
                        city: await safeEncrypt(item.property_address?.city),
                        country: await safeEncrypt(item.property_address?.country),
                        postalCode: await safeEncrypt(
                          item.property_address?.postal_code,
                        ),
                        region: await safeEncrypt(item.property_address?.region),
                        street: await safeEncrypt(item.property_address?.street),
                      };
                    }
      
                    const encryptedGuarantor = await safeEncrypt(item.guarantor);
      
                    const encryptedLoanName = await safeEncrypt(item.loan_name);
      
                    const encryptedOutstandingInterestAmount = await safeEncrypt(
                      item.outstanding_interest_amount,
                    );
                    const encryptedPaymentReferenceNumber = await safeEncrypt(
                      item.payment_reference_number,
                    );
                    const encryptedPslfStatus = await safeEncrypt(item.pslf_status);
                    let encryptedRepaymentPlan;
                    if (item.repayment_plan) {
                      encryptedRepaymentPlan = {
                        type: await safeEncrypt(item.repayment_plan?.type),
                        description: await safeEncrypt(
                          item.repayment_plan?.description,
                        ),
                      };
                    }
                    const encryptedSequenceNumber = await safeEncrypt(
                      item.sequence_number,
                    );
                    let encryptedServicerAddress;
                    if (item.servicer_address)
                      encryptedServicerAddress = {
                        city: await safeEncrypt(item.servicer_address?.city),
                        country: await safeEncrypt(
                          item.servicer_address?.country,
                        ),
                        postalCode: await safeEncrypt(
                          item.servicer_address?.postal_code,
                        ),
                        region: await safeEncrypt(item.servicer_address?.region),
                        street: await safeEncrypt(item.servicer_address?.street),
                      };
                    const encryptedYtdInterestPaid = await safeEncrypt(
                      item.ytd_interest_paid,
                    );
                    const encryptedYtdPrincipalPaid = await safeEncrypt(
                      item.ytd_principal_paid,
                    );
      
                    const liability = new Liability({
                      liabilityType: key,
                      accountId: item.account_id,
                      accountNumber: encryptedAccountNumber,
                      lastPaymentAmount: encryptedLastPaymentAmount,
                      lastPaymentDate: item.last_payment_date,
                      nextPaymentDueDate: item.next_payment_due_date,
                      minimumPaymentAmount: encryptedMinimumPaymentAmount,
                      lastStatementBalance: encryptedLastStatementBalance,
                      lastStatementIssueDate: item.last_statement_issue_date,
                      isOverdue: item.is_overdue,
      
                      // Credit-specific fields
                      aprs: item.aprs,
      
                      // Mortgage-specific fields
                      loanTypeDescription: encryptedLoanTypeDescription,
                      loanTerm: encryptedLoanTerm,
                      maturityDate: item.maturity_date,
                      nextMonthlyPayment: encryptedNextMonthlyPayment,
                      originationDate: item.origination_date,
                      originationPrincipalAmount:
                        encryptedOriginationPrincipalAmount,
                      pastDueAmount: encryptedPastDueAmount,
                      escrowBalance: encryptedEscrowBalance,
                      hasPmi: encryptedHasPmi,
                      hasPrepaymentPenalty: encryptedHasPrepaymentPenalty,
                      propertyAddress: encryptedPropertyAddress,
                      interestRate: item.interest_rate,
      
                      // Student-specific fields
                      disbursementDates: item.disbursement_dates,
                      expectedPayoffDate: item.expected_payoff_date,
                      guarantor: encryptedGuarantor,
                      interestRatePercentage: item.interest_rate_percentage,
                      loanName: encryptedLoanName,
      
                      // Loan status
                      loanStatus: item.loan_status,
                      outstandingInterestAmount: encryptedOutstandingInterestAmount,
                      paymentReferenceNumber: encryptedPaymentReferenceNumber,
                      pslfStatus: encryptedPslfStatus,
                      repaymentPlan: encryptedRepaymentPlan,
                      sequenceNumber: encryptedSequenceNumber,
                      servicerAddress: encryptedServicerAddress,
                      ytdInterestPaid: encryptedYtdInterestPaid,
                      ytdPrincipalPaid: encryptedYtdPrincipalPaid,
                    });
      
                    await liability.save();
                  }
                }
              }
            }
      const internalTransfers =
        await plaidService.detectInternalTransfers(transactions);

      for (const internalTransaction of internalTransfers) {
        const transactionId = internalTransaction.transactionId;
        const transactionRef = internalTransaction.transactionRef;
        const transaction = await Transaction.findOne({
          plaidTransactionId: transactionId,
        });
        if (!transaction) continue;
        transaction.isInternal = true;
        transaction.internalReference = transactionRef;
        await transaction.save();
      }

      for (const accountId in transactionsByAccount) {
        const account = await PlaidAccount.findOne({
          plaid_account_id: accountId,
        });
        if (!account) continue;
        account.transactions.push(...transactionsByAccount[accountId]);
        account.nextCursor = nextCursor;
        await account.save();
      }
      structuredLogger.logSuccess("add_account_completed", {
        user_id: userId,
        institution_id: institutionId,
        institution_name: institutionName,
        saved_accounts_count: savedAccounts.length,
        existing_accounts_count: existingAccounts.length,
        transactions_count: transactions.length,
        investment_transactions_count: investmentTransactions.length,
      });

      return { savedAccounts, existingAccounts: responseExistingAccounts };
    },
  );
};

const deletePlaidAccountByEmail = async (accountId, email) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
  });
  if (!user) {
    throw new Error("User not found");
  }
  const plaidAccounts = user.plaidAccounts;

  const account = await PlaidAccount.findOne({ plaid_account_id: accountId });
  user.plaidAccounts = plaidAccounts.filter(
    (id) => id.toString() !== account._id.toString(),
  );

  await user.save();

  await PlaidAccount.deleteOne({ plaid_account_id: accountId });
  await Transaction.deleteMany({ plaidAccountId: accountId });
  await Liability.deleteMany({ accountId });
};

const deletePlaidAccount = async (accountId, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) {
    throw new Error("User not found");
  }

  // 1. Find the target account to get the itemId.
  const targetAccount = await PlaidAccount.findById(accountId);
  if (!targetAccount) {
    // console.log(`Account with _id ${accountId} not found.`);
    // If account is already gone, there's nothing to do.
    return { success: true, message: "Account already deleted." };
  }

  // Verify ownership.
  if (targetAccount.owner_id.toString() !== user._id.toString()) {
    throw new Error("User does not own this account");
  }

  const { itemId } = targetAccount;

  // 2. Invalidate the item with Plaid.
  try {
    const decryptedToken = await plaidService.getAccessTokenFromItemId(itemId, uid);

    if (decryptedToken) {
      await plaidService.invalidateAccessToken(decryptedToken);
    }
  } catch (error) {
    const isItemNotFoundError =
      error.response?.data?.error_code === "ITEM_NOT_FOUND" ||
      error.message?.includes("item not found");

    if (!isItemNotFoundError) {
      // For any other error, re-throw it.
      throw error;
    }
    // Otherwise, it's an ITEM_NOT_FOUND error. Log it for info and proceed with local cleanup.
    // console.log(`[INFO] Plaid item with itemId: ${itemId} was already removed. Proceeding with local cleanup.`);
  }

  // 3. Find all local accounts associated with the itemId.
  const allAccountsOnItem = await PlaidAccount.find({ itemId });
  if (allAccountsOnItem.length === 0) {
    // This case should be rare if targetAccount was found, but it's good practice.
    return { success: true, message: "No local accounts found for the item." };
  }

  const accountIdsToDelete = allAccountsOnItem.map(acc => acc._id);
  const plaidAccountIdsToDelete = allAccountsOnItem.map(acc => acc.plaid_account_id);

  // 4. Clean up all related data from the database.
  
  // Remove account references from the user.
  await User.updateOne(
    { _id: user._id },
    { $pull: { plaidAccounts: { $in: accountIdsToDelete } } }
  );
  
  // Delete all transactions for the accounts.
  await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIdsToDelete } });
  
  // Delete all liabilities for the accounts.
  await Liability.deleteMany({ accountId: { $in: plaidAccountIdsToDelete } });
  
  // Delete all AccessToken documents for the item.
  await AccessToken.deleteMany({ itemId });

  // Finally, delete all PlaidAccount documents for the item.
  const result = await PlaidAccount.deleteMany({ itemId });

  structuredLogger.logSuccess("item_deleted_successfully", {
    item_id: itemId,
    user_id: uid,
    deleted_accounts_count: result.deletedCount,
  });

  return result;
};

const getAccounts = async (profile, uid) => {
  return await structuredLogger.withContext(
    "get_accounts",
    { uid, profile_id: profile.id },
    async () => {
                const dek = await getUserDek(uid);
                const dekHash = crypto.createHash('sha256').update(dek[0]).digest('hex');
                // console.error(`[DEK_HASH] getAccounts for user ${uid}: ${dekHash}`);
                const safeDecrypt = createSafeDecrypt(uid, dek);
      
                const plaidIds = profile.plaidAccounts;      const plaidAccountsResponse = await PlaidAccount.find({
        _id: { $in: plaidIds },
      })
        .lean()
        .exec();

      const itemIds = [...new Set(plaidAccountsResponse.map(acc => acc.itemId))];

      // Find all AccessTokens that are expired for those items
      const expiredTokens = await AccessToken.find({
        itemId: { $in: itemIds },
        isAccessTokenExpired: true
      });
      const expiredItemIds = new Set(expiredTokens.map(token => token.itemId));

      let plaidAccounts = [];

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
        const decryptedAccountName = await safeDecrypt(
          plaidAccount.account_name,
          { account_id: plaidAccount._id, field: "account_name" },
        );
        const decryptedAccountOfficialName = await safeDecrypt(
          plaidAccount.account_official_name,
          { account_id: plaidAccount._id, field: "account_official_name" },
        );
        const decryptedMask = await safeDecrypt(plaidAccount.mask, {
          account_id: plaidAccount._id,
          field: "mask",
        });

        const decryptedInstitutionName = await safeDecrypt(
          plaidAccount.institution_name,
          { account_id: plaidAccount._id, field: "institution_name" },
        );

        const isExpired = expiredItemIds.has(plaidAccount.itemId);

        plaidAccounts.push({
          ...plaidAccount,
          isAccessTokenExpired: isExpired,
          currentBalance: parseFloat(decryptedCurrentBalance),
          availableBalance: parseFloat(decryptedAvailableBalance),
          account_type: decryptedAccountType,
          account_subtype: decryptedAccountSubtype,
          account_name: decryptedAccountName,
          account_official_name: decryptedAccountOfficialName,
          mask: decryptedMask,
          institution_name: decryptedInstitutionName,
        });
      }

      const depositoryAccounts = plaidAccounts.filter(
        (account) => account.account_type === "depository",
      );
      const creditAccounts = plaidAccounts.filter(
        (account) => account.account_type === "credit",
      );
      const investmentAccounts = plaidAccounts.filter(
        (account) => account.account_type === "investment",
      );
      const loanAccounts = plaidAccounts.filter(
        (account) => account.account_type === "loan",
      );
      const otherAccounts = plaidAccounts.filter(
        (account) => account.account_type === "other",
      );
      structuredLogger.logSuccess("get_accounts_completed", {
        uid,
        profile_id: profile.id,
        total_accounts: plaidAccounts.length,
        depository_accounts: depositoryAccounts.length,
        credit_accounts: creditAccounts.length,
        investment_accounts: investmentAccounts.length,
        loan_accounts: loanAccounts.length,
        other_accounts: otherAccounts.length,
      });

      return {
        depositoryAccounts,
        creditAccounts,
        investmentAccounts,
        loanAccounts,
        otherAccounts,
      };
    },
  );
};

const getAllUserAccounts = async (email, uid) => {
  return await structuredLogger.withContext(
    "get_all_user_accounts",
    { email, uid },
    async () => {
      const user = await User.findOne({
        authUid: uid,
      })
        .populate("plaidAccounts", "-transactions")
        .exec();
      if (!user) {
        throw new Error("User not found");
      }

      // SELF-HEALING: Detect and repair orphaned AccessTokens (tokens without accounts).
      const allTokens = await AccessToken.find({ userId: user._id, isAccessTokenExpired: { $ne: true } });
      const itemIdsWithAccounts = new Set(user.plaidAccounts.map(acc => acc.itemId));
      const orphanedTokens = allTokens.filter(token => !itemIdsWithAccounts.has(token.itemId));

      if (orphanedTokens.length > 0) {
        for (const token of orphanedTokens) {
          (async () => {
            try {
              structuredLogger.logWarning("Orphaned AccessToken found. Triggering self-healing.", {
                  itemId: token.itemId,
                  userId: user._id.toString()
              });
              const dek = await getUserDek(uid);
              const safeDecrypt = createSafeDecrypt(uid, dek);
              const decryptedToken = await safeDecrypt(token.accessToken, {
                item_id: token.itemId,
                field: "accessToken",
              });

              if (decryptedToken) {
                const primaryEmail = user.email.find(e => e.isPrimary)?.email;
                if (primaryEmail) {
                  // This will fetch accounts and save them, fixing the orphan.
                  await addAccount(decryptedToken, primaryEmail, uid);
                }
              }
            } catch (error) {
              structuredLogger.logErrorBlock(error, {
                operation: "self_healing_add_account",
                item_id: token.itemId,
                user_id: uid,
              });
            }
          })();
        }
        // Since accounts are being added in the background, we might return a slightly stale list on this first run.
        // The user can refresh to see the newly added accounts.
      }


      if (!user.plaidAccounts.length) {
        structuredLogger.logSuccess("get_all_user_accounts_completed", {
          uid,
          accounts_count: 0,
        });
        return [];
      }

      const accountsResponse = user.plaidAccounts;

      let accounts = [];

      const itemIds = [...new Set(accountsResponse.map(acc => acc.itemId))];

      // Find all AccessTokens that are expired for those items
      const expiredTokens = await AccessToken.find({
        itemId: { $in: itemIds },
        isAccessTokenExpired: true
      });
      const expiredItemIds = new Set(expiredTokens.map(token => token.itemId));

      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid, dek);

      for (const plaidAccount of accountsResponse) {
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

        const decryptedAccountName = await safeDecrypt(
          plaidAccount.account_name,
          { account_id: plaidAccount._id, field: "account_name" },
        );
        const decryptedAccountOfficialName = await safeDecrypt(
          plaidAccount.account_official_name,
          { account_id: plaidAccount._id, field: "account_official_name" },
        );
        const decryptedMask = await safeDecrypt(plaidAccount.mask, {
          account_id: plaidAccount._id,
          field: "mask",
        });

        const decryptedInstitutionName = await safeDecrypt(
          plaidAccount.institution_name,
          { account_id: plaidAccount._id, field: "institution_name" },
        );

        // Determine the true expired status
        const isExpired = expiredItemIds.has(plaidAccount.itemId);

        accounts.push({
          ...plaidAccount._doc,
          isAccessTokenExpired: isExpired, // Use the corrected status
          currentBalance: parseFloat(decryptedCurrentBalance),
          availableBalance: parseFloat(decryptedAvailableBalance),
          account_type: decryptedAccountType,
          account_subtype: decryptedAccountSubtype,
          account_name: decryptedAccountName,
          account_official_name: decryptedAccountOfficialName,
          mask: decryptedMask,
          institution_name: decryptedInstitutionName,
        });
        }
        structuredLogger.logSuccess("get_all_user_accounts_completed", {
          uid,
          accounts_count: accounts.length,
        });

        return accounts;
      },
    );
  };
const calculateCashFlowsWeekly = async (
  depositoryTransactions,
  creditTransactions,
  allTransactions,
) => {
  const groupedTransactions = groupByWeek([
    ...depositoryTransactions,
    ...creditTransactions,
  ]);

  return calculateWeeklyTotals(groupedTransactions, allTransactions);
};

const weeklyCashFlowPlaidAccountSetUpTransactions = async (
  plaidAccounts,
  uid,
) => {
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const allTransactions = [];
  const depositoryTransactions = [];
  const creditTransactions = [];

  for (const plaidAccount of plaidAccounts) {


    const transactionsResponse = await Transaction.find({
      plaidAccountId: plaidAccount.plaid_account_id,
      transactionDate: { $gte: ninetyDaysAgo },
      isInternal: false,
    })
      .sort({ transactionDate: 1 })
      .lean();

    const transactions = [];

    for (const transaction of transactionsResponse) {
      const decryptedAmount = await safeDecrypt(transaction.amount, {
        transaction_id: transaction._id,
        field: "amount",
      });
                    const decryptedAccountType = await safeDecrypt(
      
                      transaction.accountType,
      
                      { transaction_id: transaction._id, field: "accountType" },
      
                    );

      transactions.push({
        ...transaction,
        amount: decryptedAmount,
        accountType: decryptedAccountType,
      });
    }

    allTransactions.push(...transactions);
    depositoryTransactions.push(
      ...transactions.filter(
        (transaction) => plaidAccount.account_type === "depository",
      ),
    );
    creditTransactions.push(
      ...transactions.filter(
        (transaction) => plaidAccount.account_type === "credit",
      ),
    );
  }
  return { depositoryTransactions, creditTransactions, allTransactions };
};

const getCashFlows = async (profile, uid) => {
  return await structuredLogger.withContext(
    "get_cash_flows",
    { uid, profile_id: profile.id },
    async () => {
      const plaidIds = profile.plaidAccounts;
      const plaidAccountsResponse = await PlaidAccount.find({
        _id: { $in: plaidIds },
      }).lean();

      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid, dek);

      let plaidAccounts = [];
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
          availableBalance: parseInt(decryptedAvailableBalance),
          account_type: decryptedAccountType,
          account_subtype: decryptedAccountSubtype,
        });
      }

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const allTransactions = [];
      let balanceCredit = 0;
      let balanceDebit = 0;
      let balanceCurrentInvestment = 0;
      let balanceAvailableInvestment = 0;
      let allInvestmentsCurrentBalance = 0;
      let balanceLoan = 0;
      const depositoryTransactions = [];
      const creditTransactions = [];
      const investmentTransactions = [];
      const loanTransactions = [];

      for (const plaidAccount of plaidAccounts) {
        const currentBalance = Number(plaidAccount.currentBalance) || 0;
        const availableBalance = Number(plaidAccount.availableBalance) || 0;
        if (
          plaidAccount.account_type === "credit" &&
          plaidAccount.currentBalance
        ) {
          balanceCredit = balanceCredit += currentBalance;
        } else if (plaidAccount.account_type === "depository") {
          if (plaidAccount.availableBalance) {
            balanceDebit += availableBalance;
          } else if (plaidAccount.currentBalance) {
            balanceDebit += currentBalance;
          }
        } else if (plaidAccount.account_type === "investment") {
          if (plaidAccount.currentBalance) {
            allInvestmentsCurrentBalance = allInvestmentsCurrentBalance +=
              currentBalance;
          }
          if (
            plaidAccount.account_subtype === "brokerage" ||
            plaidAccount.account_subtype === "isa" ||
            plaidAccount.account_subtype === "crypto exchange" ||
            plaidAccount.account_subtype === "fixed annuity" ||
            plaidAccount.account_subtype === "non-custodial wallet" ||
            plaidAccount.account_subtype === "non-taxable brokerage account" ||
            plaidAccount.account_subtype === "retirement" ||
            plaidAccount.account_subtype === "trust"
          ) {
            if (plaidAccount.currentBalance) {
              balanceCurrentInvestment = balanceCurrentInvestment +=
                currentBalance;
            }
            if (plaidAccount.availableBalance) {
              balanceAvailableInvestment = balanceAvailableInvestment +=
                availableBalance;
            }
          }
        } else if (
          plaidAccount.account_type === "loan" &&
          plaidAccount.currentBalance
        ) {
          balanceLoan = balanceLoan += currentBalance;
        }

        const transactionsResponse = await Transaction.find({
          plaidAccountId: plaidAccount.plaid_account_id,
          transactionDate: { $gte: ninetyDaysAgo },
          isInternal: false,
        })
          .sort({ transactionDate: 1 })
          .lean();

        const transactions = [];
        for (const transaction of transactionsResponse) {
          const decryptedAmount = await safeDecrypt(transaction.amount, {
            transaction_id: transaction._id,
            field: "amount",
          });
          const decryptedAccountType = await safeDecrypt(
            transaction.accountType,
            { transaction_id: transaction._id, field: "accountType" },
          );

          transactions.push({
            ...transaction,
            amount: decryptedAmount,
            accountType: decryptedAccountType,
          });
        }

        allTransactions.push(...transactions);

        if (
          plaidAccount.account_type === "depository" &&
          plaidAccount.account_subtype !== "cd"
        ) {
          depositoryTransactions.push(...transactions);
        } else if (plaidAccount.account_type === "credit") {
          creditTransactions.push(...transactions);
        } else if (
          plaidAccount.account_type === "investment" ||
          plaidAccount.account_subtype === "cd"
        ) {
          investmentTransactions.push(...transactions);
        } else if (plaidAccount.account_type === "loan") {
          loanTransactions.push(...transactions);
        }
      }

      const internalTxns = allTransactions.filter((txn) => txn.isInternal);

      const txnMap = new Map(internalTxns.map((txn) => [String(txn._id), txn]));

      const toRemove = new Set();

      internalTxns.forEach((txn) => {
        const refId = txn.internalReference?.toString();
        if (refId && txnMap.has(refId)) {
          toRemove.add(String(txn._id));
          toRemove.add(refId);
        }
      });

      const filteredTxns = internalTxns.filter(
        (txn) => !toRemove.has(String(txn._id)),
      );

      const filteredOutIds = new Set(
        filteredTxns.map((txn) => String(txn._id)),
      );

      const cleanDepositoryTxns = depositoryTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id)),
      );

      const cleanCreditTxns = creditTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id)),
      );

      const cleanInvestmentTxns = investmentTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id)),
      );

      const cleanLoanTxns = loanTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id)),
      );

      const depositoryDepositsAmount = cleanDepositoryTxns
        .filter((transaction) => transaction.amount < 0)
        .reduce((total, transaction) => total + transaction.amount, 0);

      const depositoryWithdrawsAmount = cleanDepositoryTxns
        .filter((transaction) => transaction.amount > 0)
        .reduce((total, transaction) => total + transaction.amount, 0);

      const creditDepositsAmount = cleanCreditTxns
        .filter((transaction) => transaction.amount < 0)
        .reduce((total, transaction) => total + transaction.amount, 0);

      const creditWithdrawsAmount = cleanCreditTxns
        .filter((transaction) => transaction.amount > 0)
        .reduce((total, transaction) => total + transaction.amount, 0);

      const depositoryDepositTransactions = cleanDepositoryTxns.filter(
        (transaction) => transaction.amount < 0,
      );
      const depositoryWithdrawTransactions = cleanDepositoryTxns.filter(
        (transaction) => transaction.amount > 0,
      );
      const creditDepositTransactions = cleanCreditTxns.filter(
        (transaction) => transaction.amount < 0,
      );
      const creditWithdrawTransactions = cleanCreditTxns.filter(
        (transaction) => transaction.amount > 0,
      );

      /// Calculate current cash flow

      const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
      const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
      const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
      const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

      const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
      const totalWithdrawls =
        depositWithdrawAmountAbs + creditWithdrawAmountAbs;

      let currentCashFlow = 0;
      if (totalDeposits === 0) {
        currentCashFlow = -999;
      } else if (totalDeposits === 0 && totalWithdrawls === 0) {
        currentCashFlow = 0;
      } else {
        currentCashFlow = (
          (totalDeposits - totalWithdrawls) /
          totalDeposits
        ).toFixed(2);
      }
      if (totalDeposits !== 0) {
        currentCashFlow = currentCashFlow * 100;
      }

      /// Calculate average daily spend

      let averageDailySpend = 0;

      const oldestCreditWithdrawDate =
        creditWithdrawTransactions[0]?.transactionDate || null;
      const oldestDepositWithdrawDate =
        depositoryWithdrawTransactions[0]?.transactionDate || null;

      let oldestWithdrawDate = null;

      if (oldestCreditWithdrawDate && oldestDepositWithdrawDate) {
        oldestWithdrawDate =
          oldestDepositWithdrawDate < oldestCreditWithdrawDate
            ? oldestDepositWithdrawDate
            : oldestCreditWithdrawDate;
      } else if (oldestCreditWithdrawDate) {
        oldestWithdrawDate = oldestCreditWithdrawDate;
      } else if (oldestDepositWithdrawDate) {
        oldestWithdrawDate = oldestDepositWithdrawDate;
      }

      if (oldestWithdrawDate) {
        const today = new Date();
        // const days = Math.ceil(
        //   (today - oldestWithdrawDate) / (1000 * 60 * 60 * 24)
        // );

        const totalWithdrawals =
          creditWithdrawsAmount + depositoryWithdrawsAmount;
        averageDailySpend = Math.abs((totalWithdrawals / 90) * -1).toFixed(2);
      }

      /// Calculate average daily income

      let averageDailyIncome = 0;

      const oldestCreditDepositDate =
        creditDepositTransactions[0]?.transactionDate || null;
      const oldestDepositoryDepositDate =
        depositoryDepositTransactions[0]?.transactionDate || null;

      let oldestDepositDate = null;

      if (oldestCreditDepositDate && oldestDepositoryDepositDate) {
        oldestDepositDate =
          oldestDepositoryDepositDate < oldestCreditDepositDate
            ? oldestDepositoryDepositDate
            : oldestCreditDepositDate;
      } else if (oldestCreditDepositDate) {
        oldestDepositDate = oldestCreditDepositDate;
      } else if (oldestDepositoryDepositDate) {
        oldestDepositDate = oldestDepositoryDepositDate;
      }

      if (oldestDepositDate) {
        // const today = new Date();
        // const days = Math.ceil((today - oldestDepositDate) / (1000 * 60 * 60 * 24));
        const totalDeposits = depositoryDepositsAmount + creditDepositsAmount;
        averageDailyIncome = Math.abs(totalDeposits / 90).toFixed(2);
      }

      /// Calculate total cash balance

      const totalCashBalance = plaidAccounts
        .filter(acc => acc.account_type === 'depository' || acc.account_type === 'investment')
        .reduce((total, acc) => total + (acc.availableBalance || acc.currentBalance || 0), 0);

      /// Calculate net worth
      // (bank accounts + investments accounts + assets - credit accounts - loan accounts)

      const assets = await assetsService.getAssets(uid);
      const profileAssets = assets.filter(
        (asset) => asset.profileId === profile.id.toString(),
      );
      let totalAssets = 0;
      for (const asset of profileAssets) {
        const cleanBasis = String(asset.basis).replace(/,/g, "");
        totalAssets += Number(cleanBasis) || 0;
      }

      const netWorth =
        balanceDebit +
        allInvestmentsCurrentBalance +
        totalAssets -
        balanceCredit -
        balanceLoan;
      /// Calculate cash runway
      let cashRunway = null;
      let advice = null;

      if (currentCashFlow < 0) {
        cashRunway = Math.floor(
          (totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1,
        );
        advice =
          Math.ceil(((averageDailySpend - averageDailyIncome) * 1.05) / 10) *
          10;
      }

      // average daily net
      const averageDailyNet = averageDailyIncome - averageDailySpend;

      // weekly cash flow

      const ninetyDaysAgoDate = new Date();
      ninetyDaysAgoDate.setDate(ninetyDaysAgoDate.getDate() - 86);
      const weeklyCashFlow = {};

      const today = new Date();

      let currentStart = new Date(ninetyDaysAgoDate);
      const ranges = [];

      while (currentStart <= today) {
        let currentEnd = new Date(currentStart);

        if (ranges.length === 0 && currentStart.getDay() === 6) {
          currentEnd.setDate(currentEnd.getDate() + 1);
        } else {
          const daysToSunday = 7 - currentStart.getDay();
          currentEnd.setDate(currentEnd.getDate() + daysToSunday);
        }

        weeklyCashFlow[currentStart.toISOString().split("T")[0]] = 0;

        ranges.push({
          start: currentStart.toISOString().split("T")[0],
          end: currentEnd.toISOString().split("T")[0],
        });

        currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() + 1);
      }

      const categorizedTransactionByWeek = ranges.map((range) => {
        const rangeStart = new Date(range.start);
        const rangeEnd = new Date(range.end);

        const filteredTransactions = allTransactions.filter((transaction) => {
          const transactionDate = new Date(transaction.transactionDate);
          return transactionDate >= rangeStart && transactionDate <= rangeEnd;
        });

        return filteredTransactions;
      });

      let index = 0;
      for (const weekTransactions of categorizedTransactionByWeek) {
        const weekDepositoryTransactions = weekTransactions.filter(
          (transaction) => transaction.accountType === "depository",
        );
        const weekCreditTransactions = weekTransactions.filter(
          (transaction) => transaction.accountType === "credit",
        );
        const depositoryDepositsAmount = weekDepositoryTransactions
          .filter((transaction) => transaction.amount < 0)
          .reduce((total, transaction) => total + transaction.amount, 0);

        const depositoryWithdrawsAmount = weekDepositoryTransactions
          .filter((transaction) => transaction.amount > 0)
          .reduce((total, transaction) => total + transaction.amount, 0);

        const creditDepositsAmount = weekCreditTransactions
          .filter((transaction) => transaction.amount < 0)
          .reduce((total, transaction) => total + transaction.amount, 0);

        const creditWithdrawsAmount = weekCreditTransactions
          .filter((transaction) => transaction.amount > 0)
          .reduce((total, transaction) => total + transaction.amount, 0);

        const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
        const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
        const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
        const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

        const totalDeposits =
          depositDepositsAmountAbs + creditDepositsAmountAbs;
        const totalWithdrawls =
          depositWithdrawAmountAbs + creditWithdrawAmountAbs;

        let currentCashFlow = 0;
        if (totalDeposits === 0) {
          currentCashFlow = -999;
        } else if (totalDeposits === 0 && totalWithdrawls === 0) {
          currentCashFlow = 0;
        } else {
          currentCashFlow = (
            (totalDeposits - totalWithdrawls) /
            totalDeposits
          ).toFixed(2);
        }
        if (totalDeposits !== 0) {
          currentCashFlow = currentCashFlow * 100;
        }

        weeklyCashFlow[ranges[index].start] = currentCashFlow;
        index++;
      }

      structuredLogger.logSuccess("get_cash_flows_completed", {
        uid,
        profile_id: profile.id,
        current_cash_flow: currentCashFlow,
        total_cash_balance: totalCashBalance,
        net_worth: netWorth,
        cash_runway: cashRunway,
      });

      return {
        currentCashFlow,
        totalCashBalance,
        averageDailySpend,
        averageDailyIncome,
        netWorth,
        cashRunway,
        advice,
        averageDailyNet,
        weeklyCashFlow,
      };
    },
  );
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
      const allTransactions = [];
      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid, dek);

      for (const plaidAccount of accounts) {
        const transactionsResponse = await Transaction.find({
          plaidAccountId: plaidAccount.plaid_account_id,
        })
          .sort({ transactionDate: -1 })
          .lean();

        const decryptedInstitutionName = await safeDecrypt(
          plaidAccount.institution_name,
          { account_id: plaidAccount._id, field: "institution_name" },
        );
        const transactions = [];

        for (const transaction of transactionsResponse) {
          const decryptedAmount = await safeDecryptNumericValue(transaction.amount, safeDecrypt, {
            transaction_id: transaction._id,
            field: "amount",
          });

          if (decryptedAmount === null) {
            continue;
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
          let merchantLogo;
          let merchantWebsite;
          if (transaction.merchant) {
            try {
              decryptedMerchantName = await safeDecrypt(
                transaction.merchant.name,
                { transaction_id: transaction._id, field: "merchant.name" },
              );
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

            merchantLogo = transaction.merchant.logo;

            merchantWebsite = transaction.merchant.website;
          }

          const decryptedFees = await safeDecryptNumericValue(transaction.fees, safeDecrypt, {
            transaction_id: transaction._id,
            field: "fees",
          });

          const decryptedPrice = await safeDecryptNumericValue(transaction.price, safeDecrypt, {
            transaction_id: transaction._id,
            field: "price",
          });

          let decryptedType = null;
          try {
            decryptedType = await safeDecrypt(transaction.type, {
              transaction_id: transaction._id,
              field: "type",
            });
          } catch (e) {
            console.error(`Failed to decrypt type for transaction ${transaction._id}:`, e);
          }

          let decryptedSubtype = null;
          try {
            decryptedSubtype = await safeDecrypt(transaction.subtype, {
              transaction_id: transaction._id,
              field: "subtype",
            });
          } catch (e) {
            console.error(`Failed to decrypt subtype for transaction ${transaction._id}:`, e);
          }

          const decryptedQuantity = await safeDecryptNumericValue(
            transaction.quantity, safeDecrypt,
            { transaction_id: transaction._id, field: "quantity" },
          );

          let decryptedSecurityId = null;
          try {
            decryptedSecurityId = await safeDecrypt(
              transaction.securityId,
              { transaction_id: transaction._id, field: "securityId" },
            );
          } catch (e) {
            console.error(`Failed to decrypt securityId for transaction ${transaction._id}:`, e);
          }

          // console.log("[TRACE] Applying conditional decryption logic for transaction fields.");
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

          transactions.push({
            ...transaction,
            amount: decryptedAmount,
            name: decryptedName,
            merchant: transaction.merchant ? {
              ...transaction.merchant,
              name: decryptedMerchantName,
              merchantName: decryptedMerchantMerchantName,
              merchantCategory: transaction.merchant.merchantCategory,
              logo: transaction.merchant.logo,
              website: transaction.merchant.website,
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
          });
        }
        transactions.forEach((transaction) => {
          transaction.institutionName = decryptedInstitutionName;
          transaction.institutionId = plaidAccount.institution_id;
        });

        allTransactions.push(...transactions);
      }

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

  return getTransactions(accounts, uid, pagination);
};

const getProfileTransactions = async (
  profile,
  uid,
  pagination = { paginate: false },
) => {
  // console.log('[AI] getProfileTransactions called');
  if (!profile) {
    throw new Error("Profile not found");
  }
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

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

  // console.log('[AI] getProfileTransactions finished');
  return await getTransactions(plaidAccounts, uid, pagination);
};

const getTransactionsByAccount = async (
  accountId,

  uid,

  pagination = { paginate: false },
) => {
  const account = await PlaidAccount.findOne({ plaid_account_id: accountId })

    .populate("transactions")

    .lean()

    .exec();

  if (!account) {
    throw new Error("Account not found");
  }

  const transactionsResponse = await Transaction.find({
    plaidAccountId: account.plaid_account_id,
  })

    .sort({ transactionDate: -1 })

    .lean();

  let allTransactions = [];

  const dek = await getUserDek(uid);

  const safeDecrypt = createSafeDecrypt(uid, dek);

  for (const transaction of transactionsResponse) {
    const decryptedAmount = await safeDecryptNumericValue(transaction.amount, safeDecrypt, {
      transaction_id: transaction._id,
      field: "amount",
    });

    if (decryptedAmount === null) {
      continue;
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

    let decryptedType = null;
    try {
      decryptedType = await safeDecrypt(transaction.type, {
        transaction_id: transaction._id,
        field: "type",
      });
    } catch (e) {
      console.error(`Failed to decrypt type for transaction ${transaction._id}:`, e);
    }

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

      amount: decryptedAmount,

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

const findLiabilityByAccountId = (accountId, liabilities) => {
  for (const category in liabilities) {
    if (!liabilities[category]) {
      continue;
    }
    const found = liabilities[category].find(
      (item) => item.account_id === accountId,
    );
    if (found) {
      return { category, ...found };
    }
  }
  return null;
};

function summarizeHoldingsByAccountId(
  holdings,
  securities,
  accounts,
  targetAccountId,
) {
  const securityMap = Object.fromEntries(
    securities.map((sec) => [sec.security_id, sec]),
  );

  const accountMap = Object.fromEntries(
    accounts.map((acc) => [acc.account_id, acc]),
  );

  const filteredHoldings = holdings.filter(
    (h) => h.account_id === targetAccountId,
  );
  const account = accountMap[targetAccountId];

  if (!account) {
    return null;
  }

  const summary = {
    account_id: targetAccountId,
    account_name: account.name,
    account_type: account.type,
    holdings: filteredHoldings.map((holding) => {
      const security = securityMap[holding.security_id];
      return {
        security_name: security.name,
        ticker: security.ticker_symbol,
        quantity: holding.quantity,
        price: holding.institution_value / holding.quantity,
        value: holding.institution_value,
      };
    }),
  };

  return summary;
}

const getAccountDetails = async (accountId, profileId, uid) => {
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);
  const user = await User.findOne({ authUid: uid });
  if (!user) {
    throw new Error("User not found");
  }
  const account = await PlaidAccount.findOne({ plaid_account_id: accountId, owner_id: user._id })
    .lean()
    .exec();

  const liab = await Liability.find({ accountId: accountId }).lean().exec();

  if (!account) {
    throw new Error("Account not found");
  }
  const deac = await getDecryptedAccount(account, dek, uid, true);

  const access_token = await plaidService.getNewestAccessToken({
    userId: user._id,
    institutionId: deac.institution_id,
  });
  const decryptAccessToken = await safeDecrypt(access_token.accessToken, {
    account_id: account._id,
    field: "accessToken",
  });

  let liabilityPlaid;
  let accountPlaid;

  try {
    const plaidData = await plaidService.getAccountsWithAccessToken(decryptAccessToken);
    accountPlaid = plaidData.accounts.find(a => a.account_id === account.plaid_account_id);
  } catch (error) {
    console.error("Error fetching account data from Plaid:", error.response?.data || error.message);
    // If the item requires re-authentication, flag it in our database
    if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
      structuredLogger.logInfo('item_login_required_detected_in_api_call', {
        item_id: deac.itemId,
        account_id: accountId,
        user_id: uid,
      });
      // Use the original 'account' object from our DB lookup
      await PlaidAccount.updateOne({ _id: account._id }, { $set: { isAccessTokenExpired: true } });
    }
  }

  if (deac.account_type === "credit" && liab && liab.length > 0) {
    liabilityPlaid = await getDecryptedLiabilitiesCredit(liab, dek, uid);
  }

  if (deac.account_type === "loan" && liab && liab.length > 0) {
    liabilityPlaid = await getDecryptedLiabilitiesLoan(liab, dek, uid);
  }

  let investmentData = null;

  if (deac.account_type === "investment") {
    try {
      const data =
        await plaidService.getInvestmentsHoldingsWithAccessToken(
          decryptAccessToken,
        );
      investmentData = summarizeHoldingsByAccountId(
        data.holdings,
        data.securities,
        data.accounts,
        deac.plaid_account_id,
      );
    } catch (error) {
      console.error(
        "Error fetching investment data:",
        error.response?.data || error.message,
      );
    }
  }

  const result = {
    account: deac,
    accountPlaid: accountPlaid,
    liabilityPlaid: liabilityPlaid,
    investmentData: investmentData || { holdings: [] },
  };
  return { ...result };
};

/**
 * Decrypts a credit liability record (expected as the first element in a liabilities array) and its nested APR entries.
 *
 * @param {Array} liabilities - Array whose first element is the credit liability object containing encrypted binary fields and an optional `aprs` array.
 * @param {*} dek - Data encryption key used to decrypt encrypted fields.
 * @returns {Object} Decrypted liability object including core identifiers, decrypted binary fields (when present), and a decrypted `aprs` array with `aprPercentage`, `aprType`, `balanceSubjectToApr`, and `interestChargeAmount` entries.
 */

async function flexibleDecrypt(value, safeDecrypt, context) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return await safeDecrypt(value, context);
    } catch (e) {
      // If decryption fails, assume it's a plaintext value and return it.
      return value;
    }
  }

  // If it's not a string (e.g., a number, boolean, or object from new data), return it directly.
  return value;
}

async function getDecryptedLiabilitiesCredit(liabilities, dek, uid) {

  const liabilitiesList = liabilities[0];
  if (!liabilitiesList) return null;
  const safeDecrypt = createSafeDecrypt(uid, dek);
  const decryptedLiabilities = {
    _id: liabilitiesList._id,
    liabilityType: liabilitiesList.liabilityType,
    accountNumber: await flexibleDecrypt(liabilitiesList.accountNumber, safeDecrypt, { field: 'accountNumber' }),
  };
  const binaryFields = [
    "lastPaymentAmount",
    "lastPaymentDate",
    "lastPaymentDueDate",
    "nextPaymentDueDate",
    "minimumPaymentAmount",
    "lastStatementBalance",
    "lastStatementIssueDate",
    "isOverdue",
  ];
  for (const field of binaryFields) {
    if (liabilitiesList[field] !== undefined) {
      decryptedLiabilities[field] = await flexibleDecrypt(
        liabilitiesList[field],
        safeDecrypt,
        { field: field },
      );
    }
  }
  if (Array.isArray(liabilitiesList.aprs)) {
    decryptedLiabilities.aprs = [];
    for (const aprItem of liabilitiesList.aprs) {
      const decryptedAprItem = { _id: aprItem._id };
      for (const key of [
        "aprPercentage",
        "aprType",
        "balanceSubjectToApr",
        "interestChargeAmount",
      ]) {
        if (aprItem[key] !== undefined) {
          decryptedAprItem[key] = await flexibleDecrypt(aprItem[key], safeDecrypt, {
            field: `aprs.${key}`,
          });
        }
      }
      decryptedLiabilities.aprs.push(decryptedAprItem);
    }
  }
  return decryptedLiabilities;
}

/**
 * Decrypts a loan liability record and its nested fields using the provided data encryption key.
 *
 * @param {Array} liabilities - Array whose first element is the stored loan liability object containing encrypted fields and nested objects (e.g., property_address, interest_rate, loan_status, repayment_plan, servicer_address).
 * @param {Buffer|string} dek - Data encryption key (DEK) used to decrypt the liability's encrypted values.
 * @returns {Object} An object representing the decrypted loan liability, including top-level fields (_id, liabilityType, accountNumber), decrypted scalar fields (e.g., loanTerm, maturityDate, interestRatePercentage), and decrypted nested objects (propertyAddress, InterestRate, LoanStatus, RepaymentPlan, ServicerAddress) when present.
 */

async function getDecryptedLiabilitiesLoan(liabilities, dek, uid) {
  const liabilitiesList = liabilities[0];
  const safeDecrypt = createSafeDecrypt(uid, dek);
  const decryptedLiabilities = {
    _id: liabilitiesList._id,
    liabilityType: liabilitiesList.liabilityType,
    accountNumber: await flexibleDecrypt(liabilitiesList.accountNumber, safeDecrypt, { field: 'accountNumber' }),
  };
  const binaryFields = [
    "lastPaymentAmount",
    "lastPaymentDate",
    "lastPaymentDueDate",
    "nextPaymentDueDate",
    "minimumPaymentAmount",
    "lastStatementBalance",
    "lastStatementIssueDate",
    "isOverdue",
    "loanTypeDescription",
    "loanTerm",
    "maturityDate",
    "nextMonthlyPayment",
    "originationDate",
    "originationPrincipalAmount",
    "pastDueAmount",
    "escrowBalance",
    "hasPmi",
    "hasPrepaymentPenalty",
    "ytdInterestPaid",
    "ytdPrincipalPaid",
    "interestRatePercentage",
  ];
  for (const field of binaryFields) {
    if (liabilitiesList[field] !== undefined) {
      decryptedLiabilities[field] = await flexibleDecrypt(
        liabilitiesList[field],
        safeDecrypt,
        { field: field },
      );
    }
  }
  // Handle nested objects for propertyAddress, interestRate, loanStatus, repayment_plan, servicer_address
  if (liabilitiesList.propertyAddress) {
    decryptedLiabilities.propertyAddress = {};
    for (const key of ["city", "country", "postalCode", "region", "street"]) {
      if (liabilitiesList.propertyAddress[key] !== undefined) {
        decryptedLiabilities.propertyAddress[key] = await flexibleDecrypt(
          liabilitiesList.propertyAddress[key],
          safeDecrypt,
          { field: `propertyAddress.${key}` },
        );
      }
    }
  }

  if (liabilitiesList.interestRate) {
    decryptedLiabilities.interestRate = {};
    for (const key of ["percentage", "type"]) {
      if (liabilitiesList.interestRate[key] !== undefined) {
        decryptedLiabilities.interestRate[key] = await flexibleDecrypt(
          liabilitiesList.interestRate[key],
          safeDecrypt,
          { field: `interestRate.${key}` },
        );
      }
    }
  }

  if (liabilitiesList.loanStatus) {
    decryptedLiabilities.loanStatus = {};
    for (const key of ["endDate", "type"]) {
      if (liabilitiesList.loanStatus[key] !== undefined) {
        decryptedLiabilities.loanStatus[key] = await flexibleDecrypt(
          liabilitiesList.loanStatus[key],
          safeDecrypt,
          { field: `loanStatus.${key}` },
        );
      }
    }
  }

  if (liabilitiesList.repayment_plan) {
    decryptedLiabilities.repaymentPlan = {};
    for (const key of ["type", "description"]) {
      if (liabilitiesList.repayment_plan[key] !== undefined) {
        decryptedLiabilities.repaymentPlan[key] = await flexibleDecrypt(
          liabilitiesList.repayment_plan[key],
          safeDecrypt,
          { field: `repaymentPlan.${key}` },
        );
      }
    }
  }

  if (liabilitiesList.servicer_address) {
    decryptedLiabilities.servicerAddress = {};
    for (const key of ["city", "country", "postalCode", "region", "street"]) {
      if (liabilitiesList.servicer_address[key] !== undefined) {
        decryptedLiabilities.servicerAddress[key] = await flexibleDecrypt(
          liabilitiesList.servicer_address[key],
          safeDecrypt,
          { field: `servicerAddress.${key}` },
        );
      }
    }
  }
  return decryptedLiabilities;
}

/**
 * Return a Plaid account object with sensitive binary fields decrypted using the provided data encryption key.
 * @param {Object} account - The PlaidAccount document (binary fields may be encrypted).
 * @param {Buffer|string} dek - The data encryption key for the account's owner used to decrypt binary fields.
 * @returns {Object} An account object containing the original metadata and decrypted sensitive fields (e.g., `accessToken`, `account_name`, `account_official_name`, `account_type`, `account_subtype`, `institution_name`, `currentBalance`, `availableBalance`, `mask`) when present.
 */

async function getDecryptedAccount(account, dek, uid, crossReferenceExpired = false) {
  const safeDecrypt = createSafeDecrypt(uid, dek);
  let isExpired = account.isAccessTokenExpired;

  if (crossReferenceExpired) {
    const expiredToken = await AccessToken.findOne({ itemId: account.itemId, isAccessTokenExpired: true });
    if (expiredToken) {
      isExpired = true;
    }
  }

  const decryptedAccount = {
    _id: account._id,
    owner_id: account.owner_id,
    itemId: account.itemId,
    owner_type: account.owner_type,
    plaid_account_id: account.plaid_account_id,
    institution_id: account.institution_id,
    currency: account.currency,
    transactions: account.transactions,
    nextCursor: account.nextCursor,
    created_at: account.created_at,
    __v: account.__v,
  };

  const binaryFields = [
    "account_name",
    "account_official_name",
    "account_type",
    "account_subtype",
    "institution_name",
    "currentBalance",
    "availableBalance",
    "mask",
  ];

  for (const field of binaryFields) {
    if (account[field]) {
      try {
        decryptedAccount[field] = await safeDecrypt(account[field], {
          field: field,
        });
      } catch (error) {
        console.error(`Failed to decrypt field: ${field}`, error);
        throw error;
      }
    }
  }

  if (decryptedAccount.currentBalance) {
    decryptedAccount.currentBalance = parseFloat(decryptedAccount.currentBalance);
  }
  if (decryptedAccount.availableBalance) {
    decryptedAccount.availableBalance = parseFloat(decryptedAccount.availableBalance);
  }

  return decryptedAccount;
}

const generateUploadUrl = async (fileName) => {
  try {
    const [url] = await storage
      .bucket(filesBucketName)
      .file(fileName)
      .getSignedUrl({
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: "image/jpeg",
      });
    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return null;
  }
};

const generateSignedUrl = async (fileName) => {
  try {
    const options = {
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    };

    const [url] = await storage
      .bucket(filesBucketName)
      .file(fileName)
      .getSignedUrl(options);

    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return null;
  }
};

const getCashFlowsByPlaidAccount = async (plaidAccount, uid) => {
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const allTransactions = [];
  let balanceCredit = 0;
  let balanceDebit = 0;
  let balanceCurrentInvestment = 0;
  let balanceAvailableInvestment = 0;
  let balanceLoan = 0;
  const depositoryTransactions = [];
  const creditTransactions = [];
  const investmentTransactions = [];
  const loanTransactions = [];

  //----------WEEKLY-cashflow-chart calculations
  const plaidWeeklyTransactions =
    await weeklyCashFlowPlaidAccountSetUpTransactions([plaidAccount], uid);

  const resultWeeklyCashFlowwCharts = await calculateCashFlowsWeekly(
    plaidWeeklyTransactions.depositoryTransactions,
    plaidWeeklyTransactions.creditTransactions,
    plaidWeeklyTransactions.allTransactions,
  );

  let liabilityPlaid = null;
  if (plaidAccount.account_type === "credit") {
    const liab = await Liability.find({ accountId: plaidAccount.plaid_account_id }).lean().exec();
    if (liab && liab.length > 0) {
        liabilityPlaid = await getDecryptedLiabilitiesCredit(liab, dek, uid);
    }
  }

  //----------WEEKLY-cashflow-chart calculations

  if (plaidAccount.account_type === "credit" && plaidAccount.currentBalance) {
    balanceCredit = balanceCredit += plaidAccount.currentBalance;
  } else if (plaidAccount.account_type === "depository") {
    if (plaidAccount.availableBalance) {
      balanceDebit = balanceDebit += plaidAccount.availableBalance;
    } else if (plaidAccount.currentBalance) {
      balanceDebit = balanceDebit += plaidAccount.currentBalance;
    }
  } else if (plaidAccount.account_type === "investment") {
    if (
      plaidAccount.account_subtype === "brokerage" ||
      plaidAccount.account_subtype === "isa" ||
      plaidAccount.account_subtype === "crypto exchange" ||
      plaidAccount.account_subtype === "fixed annuity" ||
      plaidAccount.account_subtype === "non-custodial wallet" ||
      plaidAccount.account_subtype === "non-taxable brokerage account" ||
      plaidAccount.account_subtype === "retirement" ||
      plaidAccount.account_subtype === "trust"
    ) {
      if (plaidAccount.currentBalance) {
        balanceCurrentInvestment = balanceCurrentInvestment +=
          plaidAccount.currentBalance;
      }
      if (plaidAccount.availableBalance) {
        balanceAvailableInvestment = balanceAvailableInvestment +=
          plaidAccount.availableBalance;
      }
    }
  } else if (
    plaidAccount.account_type === "loan" &&
    plaidAccount.currentBalance
  ) {
    balanceLoan = balanceLoan += plaidAccount.currentBalance;
  }

  const transactionsResponse = await Transaction.find({
    plaidAccountId: plaidAccount.plaid_account_id,
    transactionDate: { $gte: ninetyDaysAgo },
    isInternal: false,
  })
    .sort({ transactionDate: 1 })
    .lean();
  const transactions = [];

  for (const transaction of transactionsResponse) {
    const decryptedAmount = await safeDecrypt(transaction.amount, { context: { resource: 'transaction', field: 'amount' } });

    const decryptedAccountType = await safeDecrypt(
      transaction.accountType,
      { context: { resource: 'transaction', field: 'accountType' } }
    );

    transactions.push({
      ...transaction,
      amount: decryptedAmount,
      accountType: decryptedAccountType,
    });
  }

  allTransactions.push(...transactions);

  depositoryTransactions.push(
    ...transactions.filter(
      (transaction) => plaidAccount.account_type === "depository",
    ),
  );
  creditTransactions.push(
    ...transactions.filter(
      (transaction) => plaidAccount.account_type === "credit",
    ),
  );
  investmentTransactions.push(
    ...transactions.filter(
      (transaction) => plaidAccount.account_type === "investment",
    ),
  );
  loanTransactions.push(
    ...transactions.filter(
      (transaction) => plaidAccount.account_type === "loan",
    ),
  );

  const depositoryDepositsAmount = depositoryTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const depositoryWithdrawsAmount = depositoryTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const creditDepositsAmount = creditTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const creditWithdrawsAmount = creditTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const depositoryDepositTransactions = depositoryTransactions.filter(
    (transaction) => transaction.amount < 0,
  );
  const depositoryWithdrawTransactions = depositoryTransactions.filter(
    (transaction) => transaction.amount > 0,
  );
  const creditDepositTransactions = creditTransactions.filter(
    (transaction) => transaction.amount < 0,
  );
  const creditWithdrawTransactions = creditTransactions.filter(
    (transaction) => transaction.amount > 0,
  );

  /// Calculate current cash flow

  const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
  const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
  const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
  const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

  const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
  const totalWithdrawls = depositWithdrawAmountAbs + creditWithdrawAmountAbs;

  let currentCashFlow = 0;
  if (totalDeposits === 0) {
    currentCashFlow = -999;
  } else if (totalDeposits === 0 && totalWithdrawls === 0) {
    currentCashFlow = 0;
  } else {
    currentCashFlow = (
      (totalDeposits - totalWithdrawls) /
      totalDeposits
    ).toFixed(2);
  }
  if (totalDeposits !== 0) {
    currentCashFlow = currentCashFlow * 100;
  }

  /// Calculate average daily spend

  let averageDailySpend = 0;

  const oldestCreditWithdrawDate =
    creditWithdrawTransactions[0]?.transactionDate || null;
  const oldestDepositWithdrawDate =
    depositoryWithdrawTransactions[0]?.transactionDate || null;

  let oldestWithdrawDate = null;

  if (oldestCreditWithdrawDate && oldestDepositWithdrawDate) {
    oldestWithdrawDate =
      oldestDepositWithdrawDate < oldestCreditWithdrawDate
        ? oldestDepositWithdrawDate
        : oldestCreditWithdrawDate;
  } else if (oldestCreditWithdrawDate) {
    oldestWithdrawDate = oldestCreditWithdrawDate;
  } else if (oldestDepositWithdrawDate) {
    oldestWithdrawDate = oldestDepositWithdrawDate;
  }

  if (oldestWithdrawDate) {
    const today = new Date();
    // const days = Math.ceil(
    //   (today - oldestWithdrawDate) / (1000 * 60 * 60 * 24)
    // );

    const totalWithdrawals = creditWithdrawsAmount + depositoryWithdrawsAmount;
    averageDailySpend = Math.abs((totalWithdrawals / 90) * -1).toFixed(2);
  }

  /// Calculate average daily income

  let averageDailyIncome = 0;

  const oldestCreditDepositDate =
    creditDepositTransactions[0]?.transactionDate || null;
  const oldestDepositoryDepositDate =
    depositoryDepositTransactions[0]?.transactionDate || null;

  let oldestDepositDate = null;

  if (oldestCreditDepositDate && oldestDepositoryDepositDate) {
    oldestDepositDate =
      oldestDepositoryDepositDate < oldestCreditDepositDate
        ? oldestDepositoryDepositDate
        : oldestCreditDepositDate;
  } else if (oldestCreditDepositDate) {
    oldestDepositDate = oldestCreditDepositDate;
  } else if (oldestDepositoryDepositDate) {
    oldestDepositDate = oldestDepositoryDepositDate;
  }

  if (oldestDepositDate) {
    // const today = new Date();
    // const days = Math.ceil((today - oldestDepositDate) / (1000 * 60 * 60 * 24));
    const totalDeposits = depositoryDepositsAmount + creditDepositsAmount;
    averageDailyIncome = Math.abs(totalDeposits / 90).toFixed(2);
  }

  /// Calculate total cash balance

  const totalCashBalance = balanceDebit + balanceAvailableInvestment;

  /// Calculate net worth
  // (bank accounts + investments accounts + assets - credit accounts - loan accounts)
  //TODO: Add assets

  const netWorth =
    balanceDebit + balanceAvailableInvestment - balanceCredit - balanceLoan;

  /// Calculate cash runway
  let cashRunway = null;
  let advice = null;

  if (currentCashFlow < 0) {
    cashRunway = Math.floor(
      (totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1,
    );
    advice =
      Math.ceil(((averageDailySpend - averageDailyIncome) * 1.05) / 10) * 10;
  }

  // average daily net
  const averageDailyNet = averageDailyIncome - averageDailySpend;

  // weekly cash flow

  const ninetyDaysAgoDate = new Date();
  ninetyDaysAgoDate.setDate(ninetyDaysAgoDate.getDate() - 86);
  const weeklyCashFlow = {};

  const today = new Date();

  let currentStart = new Date(ninetyDaysAgoDate);
  const ranges = [];

  while (currentStart <= today) {
    let currentEnd = new Date(currentStart);

    if (ranges.length === 0 && currentStart.getDay() === 6) {
      currentEnd.setDate(currentEnd.getDate() + 1);
    } else {
      const daysToSunday = 7 - currentStart.getDay();
      currentEnd.setDate(currentEnd.getDate() + daysToSunday);
    }

    weeklyCashFlow[currentStart.toISOString().split("T")[0]] = 0;

    ranges.push({
      start: currentStart.toISOString().split("T")[0],
      end: currentEnd.toISOString().split("T")[0],
    });

    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  const categorizedTransactionByWeek = ranges.map((range) => {
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);

    const filteredTransactions = allTransactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transactionDate);
      return transactionDate >= rangeStart && transactionDate <= rangeEnd;
    });

    return filteredTransactions;
  });

  let index = 0;
  for (const weekTransactions of categorizedTransactionByWeek) {
    const weekDepositoryTransactions = weekTransactions.filter(
      (transaction) => transaction.accountType === "depository",
    );
    const weekCreditTransactions = weekTransactions.filter(
      (transaction) => transaction.accountType === "credit",
    );
    const depositoryDepositsAmount = weekDepositoryTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositoryWithdrawsAmount = weekDepositoryTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditDepositsAmount = weekCreditTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditWithdrawsAmount = weekCreditTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
    const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
    const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
    const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

    const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
    const totalWithdrawls = depositWithdrawAmountAbs + creditWithdrawAmountAbs;

    let currentCashFlow = 0;
    if (totalDeposits === 0) {
      currentCashFlow = -999;
    } else if (totalDeposits === 0 && totalWithdrawls === 0) {
      currentCashFlow = 0;
    } else {
      currentCashFlow = (
        (totalDeposits - totalWithdrawls) /
        totalDeposits
      ).toFixed(2);
    }
    if (totalDeposits !== 0) {
      currentCashFlow = currentCashFlow * 100;
    }

    weeklyCashFlow[ranges[index].start] = currentCashFlow;
    index++;
  }

  return {
    currentCashFlow,
    totalCashBalance,
    averageDailySpend,
    averageDailyIncome,
    netWorth,
    cashRunway,
    advice,
    averageDailyNet,
    weeklyCashFlow,
    weeklyCashFlowChartData: resultWeeklyCashFlowwCharts,
    liabilityPlaid,
  };
};

const formatTransactionsWithSigns = (transactions) => {
  for (const transaction of transactions) {
    if (transaction.accountType === "depository") {
      transaction.amount = transaction.amount * -1;
    } else if (transaction.accountType === "investment") {
      transaction.amount = Math.abs(transaction.amount);
    }
    if (transaction.merchant) {
      delete transaction.merchant._id;
      delete transaction.merchant.website;
      delete transaction.merchant.logo;
    }
  }
  return transactions;
};

const formatAccountsBalances = (accounts) => {
  for (const account of accounts) {
    if (
      account.account_type === "depository" ||
      account.account_type === "other"
    ) {
      account.balance = account.availableBalance
        ? account.availableBalance
        : (account.currentBalance ?? 0);
    } else {
      account.balance = account.currentBalance ?? 0;
    }

    delete account.availableBalance;
    delete account.currentBalance;
  }
  return accounts;
};

const getCashFlowsWeekly = async (profile, uid) => {
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  let plaidAccounts = [];

  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);
  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await safeDecrypt(
      plaidAccount.currentBalance,
      { context: { accountId: plaidAccount._id, field: 'currentBalance' } },
    );
    const decryptedAvailableBalance = await safeDecrypt(
      plaidAccount.availableBalance,
      { context: { accountId: plaidAccount._id, field: 'availableBalance' } },
    );
    const decryptedAccountType = await safeDecrypt(
      plaidAccount.account_type,
      { context: { accountId: plaidAccount._id, field: 'account_type' } },
    );
    const decryptedAccountSubtype = await safeDecrypt(
      plaidAccount.account_subtype,
      { context: { accountId: plaidAccount._id, field: 'account_subtype' } },
    );
    plaidAccounts.push({
      ...plaidAccount,
      currentBalance: decryptedCurrentBalance,
      availableBalance: decryptedAvailableBalance,
      account_type: decryptedAccountType,
      account_subtype: decryptedAccountSubtype,
    });
  }

  const { depositoryTransactions, creditTransactions, allTransactions } =
    await weeklyCashFlowPlaidAccountSetUpTransactions(plaidAccounts, uid);

  const groupedTransactions = groupByWeek([
    ...depositoryTransactions,
    ...creditTransactions,
  ]);
  const result = calculateWeeklyTotals(groupedTransactions, allTransactions);
  return { weeklyCashFlow: result };
};

const accountsService = {
  addAccount,
  getAccounts,
  getAccountDetails,
  getCashFlows,
  getCashFlowsWeekly,
  getUserTransactions,
  getTransactionsByAccount,
  getAllUserAccounts,
  generateUploadUrl,
  generateSignedUrl,
  getProfileTransactions,
  deletePlaidAccountByEmail,
  deletePlaidAccount,
  getCashFlowsByPlaidAccount,
  formatTransactionsWithSigns,
  formatAccountsBalances,
  getDecryptedLiabilitiesLoan,
  getDecryptedLiabilitiesCredit,
  weeklyCashFlowPlaidAccountSetUpTransactions,
  calculateCashFlowsWeekly,
};

export default accountsService;
