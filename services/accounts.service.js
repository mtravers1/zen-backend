import plaidService from "./plaid.service.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import businessService from "./businesses.service.js";
import { Storage } from "@google-cloud/storage";
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
  getOldestAccessToken,
  groupByWeek,
} from "./utils/accounts.js";
import structuredLogger from "../lib/structuredLogger.js";

let storage;
let bucketName;

if (process.env.NODE_ENV !== 'test') {
  const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
  if (!serviceAccountBase64) {
    throw new Error('CRITICAL: STORAGE_SERVICE_ACCOUNT environment variable is not set.');
  }
  const serviceAccountJsonString = Buffer.from(
    serviceAccountBase64,
    "base64"
  ).toString("utf8");
  const storageServiceAccount = JSON.parse(serviceAccountJsonString);

  // Ensure credentials have universe_domain field
  if (!storageServiceAccount.universe_domain) {
    storageServiceAccount.universe_domain = "googleapis.com";
  }

  storage = new Storage({
    credentials: storageServiceAccount,
    projectId: process.env.GCP_PROJECT_ID,
    apiEndpoint: "https://storage.googleapis.com",
    useAuthWithCustomEndpoint: true,
  });
  bucketName = "zentavos-bucket";
} else {
  // Mock Storage for test environment
  storage = {
    bucket: () => ({
      file: () => ({
        getSignedUrl: () => ['http://mock-signed-url.com'],
      }),
    }),
  };
  bucketName = "test-bucket";
}

const addAccount = async (accessToken, email, uid) => {
  return await structuredLogger.withContext(
    "add_account",
    { email, uid },
    async () => {
      const dek = await getUserDek(uid);
      const user = await User.findOne({
        authUid: uid,
      });
      if (!user) {
        throw new Error("User not found");
      }
      const userId = user._id.toString();
      const userType = user.role;
      const accountsResponse = await plaidService.getAccountsWithAccessToken(
        accessToken
      );

      const accounts = accountsResponse.accounts;
      const institutionId = accountsResponse.item.institution_id;
      const institutionName = accountsResponse.item.institution_name;

      const userAccounts = user.plaidAccounts;
      let savedAccounts = [];
      const accountTypes = {};
      const existingAccounts = [];

      for (let account of accounts) {
        const hashAccountName = hashValue(account.name);
        const hashAccountInstitutionId = hashValue(
          accountsResponse.item.institution_id
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
          continue;
        }

        const encryptedMask = await encryptValue(account.mask, dek);

        const encryptedToken = await encryptValue(accessToken, dek);

        const encriptedName = await encryptValue(account.name, dek);

        let encriptedOfficialName;

        if (account.official_name) {
          encriptedOfficialName = await encryptValue(
            account.official_name,
            dek
          );
        }

        const encriptedType = await encryptValue(account.type, dek);

        const encriptedSubtype = await encryptValue(account.subtype, dek);

        const encriptedInstitutionName = await encryptValue(
          institutionName,
          dek
        );

        let encriptedCurrentBalance;
        let encriptedAvailableBalance;

        if (account.balances) {
          if (account.balances.current) {
            encriptedCurrentBalance = await encryptValue(
              account.balances.current,
              dek
            );
          }

          if (account.balances.available) {
            encriptedAvailableBalance = await encryptValue(
              account.balances.available,
              dek
            );
          }
        }

        const newAccount = new PlaidAccount({
          owner_id: userId,
          itemId: accountsResponse.item.item_id,
          accessToken: encryptedToken,
          owner_type: userType,
          plaid_account_id: account.account_id,
          account_name: encriptedName,
          account_official_name: encriptedOfficialName,
          account_type: encriptedType,
          account_subtype: encriptedSubtype,
          institution_name: encriptedInstitutionName,
          institution_id: institutionId,
          image_url: account.institution_name,
          currentBalance: encriptedCurrentBalance,
          availableBalance: encriptedAvailableBalance,
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
      }

      const responseExistingAccounts = await Promise.all(
        existingAccounts.map(async (ec) => {
          return { id: ec.id, name: await decryptValue(ec.account_name, dek) };
        })
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
            error.response?.data || error
          );
        }
      }

      if (accountsResponse.item.products.includes("investments")) {
        try {
          investmentTransactionsResponse =
            await plaidService.getInvestmentTransactionsWithAccessToken(
              accessToken
            );
        } catch (error) {
          console.error(
            "Error fetching investment transactions:",
            error.response?.data || error
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
            error.response?.data || error
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

        if (!accountType || !existingAccount) {
          continue;
        }
        const account = savedAccounts.find(
          (account) => account.plaid_account_id === transaction.account_id
        );

        if (!account) {
          continue;
        }

        let merchantName;
        let name;

        if (transaction.merchant_name) {
          merchantName = await encryptValue(transaction.merchant_name, dek);
        }

        if (transaction.name) {
          name = await encryptValue(transaction.name, dek);
        }

        const merchant = {
          merchantName: merchantName,
          name: name,
          merchantCategory: transaction.category?.[0],
          website: transaction.website,
          logo: transaction.logo_url,
        };

        let transactionCode;

        const encyptedAmount = await encryptValue(transaction.amount, dek);

        if (transaction.transaction_code) {
          transactionCode = await encryptValue(
            transaction.transaction_code,
            dek
          );
        }
        let encryptedAccountType;
        if (accountType) {
          encryptedAccountType = await encryptValue(accountType, dek);
        }

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
          tags: transaction.category,
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

        const accountType = accountTypes[transaction.account_id];
        const account = savedAccounts.find(
          (account) => account.plaid_account_id === transaction.account_id
        );

        const encryptedAmount = await encryptValue(transaction.amount, dek);
        const encryptedAccountType = await encryptValue(accountType, dek);

        const name = await encryptValue(transaction.name, dek);

        const fees = await encryptValue(transaction.fees, dek);

        const price = await encryptValue(transaction.price, dek);

        const quantity = await encryptValue(transaction.quantity, dek);

        const securityId = await encryptValue(transaction.security_id, dek);

        const type = await encryptValue(transaction.type, dek);

        const subtype = await encryptValue(transaction.subtype, dek);

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
        Object.entries(liabilitiesResponse.liabilities).forEach(
          ([key, value]) => {
            if (Array.isArray(value)) {
              value.forEach(async (item) => {
                //if accountid is not in savedaccounts, then skip
                if (
                  !savedAccounts.find(
                    (account) => account.plaid_account_id === item.account_id
                  )
                )
                  return;

                const encryptedAccountNumber = await encryptValue(
                  item.account_number,
                  dek
                );

                const encryptedLastPaymentAmount = await encryptValue(
                  item.last_payment_amount,
                  dek
                );

                const encryptedLastPaymentDate = await encryptValue(
                  item.last_payment_date,
                  dek
                );

                const encryptedNextPaymentDueDate = await encryptValue(
                  item.next_payment_due_date,
                  dek
                );

                const encryptedMinimumPaymentAmount = await encryptValue(
                  item.minimum_payment_amount,
                  dek
                );

                const encryptedLastStatementBalance = await encryptValue(
                  item.last_statement_balance,
                  dek
                );

                const encryptedLastStatementIssueDate = await encryptValue(
                  item.last_statement_issue_date,
                  dek
                );

                const encryptedIsOverdue = await encryptValue(
                  item.is_overdue,
                  dek
                );

                const encryptedAprs = item.aprs
                  ? await Promise.all(
                      item.aprs.map(async (apr) => ({
                        aprPercentage: await encryptValue(
                          apr.apr_percentage,
                          dek
                        ),
                        aprType: await encryptValue(apr.apr_type, dek),
                        balanceSubjectToApr: await encryptValue(
                          apr.balance_subject_to_apr,
                          dek
                        ),
                        interestChargeAmount: await encryptValue(
                          apr.interest_charge_amount,
                          dek
                        ),
                      }))
                    )
                  : undefined;

                const encryptedLoanTypeDescription = await encryptValue(
                  item.loan_type_description,
                  dek
                );

                const encryptedLoanTerm = await encryptValue(
                  item.loan_term,
                  dek
                );

                const encryptedMaturityDate = await encryptValue(
                  item.maturity_date,
                  dek
                );

                const encryptedNextMonthlyPayment = await encryptValue(
                  item.next_monthly_payment,
                  dek
                );

                const encryptedOriginationDate = await encryptValue(
                  item.origination_date,
                  dek
                );

                const encryptedOriginationPrincipalAmount = await encryptValue(
                  item.origination_principal_amount,
                  dek
                );

                const encryptedPastDueAmount = await encryptValue(
                  item.past_due_amount,
                  dek
                );

                const encryptedEscrowBalance = await encryptValue(
                  item.escrow_balance,
                  dek
                );

                const encryptedHasPmi = await encryptValue(item.has_pmi, dek);

                const encryptedHasPrepaymentPenalty = await encryptValue(
                  item.has_prepayment_penalty,
                  dek
                );
                let encryptedPropertyAddress;
                if (item.property_address) {
                  encryptedPropertyAddress = {
                    city: await encryptValue(item.property_address?.city, dek),
                    country: await encryptValue(
                      item.property_address?.country,
                      dek
                    ),
                    postalCode: await encryptValue(
                      item.property_address?.postal_code,
                      dek
                    ),
                    region: await encryptValue(
                      item.property_address?.region,
                      dek
                    ),
                    street: await encryptValue(
                      item.property_address?.street,
                      dek
                    ),
                  };
                }

                let encryptedInterestRate;
                if (item.servicer_address) {
                  const encryptedInterestRate = {
                    percentage: await encryptValue(
                      item.interest_rate?.percentage,
                      dek
                    ),
                    type: await encryptValue(item.interest_rate?.type, dek),
                  };
                }

                const encryptedDisbursementDates = await encryptValue(
                  item.disbursement_dates,
                  dek
                );

                const encryptedExpectedPayoffDate = await encryptValue(
                  item.expected_payoff_date,
                  dek
                );

                const encryptedGuarantor = await encryptValue(
                  item.guarantor,
                  dek
                );

                const encryptedInterestRatePercentage = await encryptValue(
                  item.interest_rate_percentage,
                  dek
                );

                const encryptedLoanName = await encryptValue(
                  item.loan_name,
                  dek
                );
                let encryptedLoanStatus;
                if (item.loan_status) {
                  encryptedLoanStatus = {
                    endDate: await encryptValue(
                      item.loan_status?.end_date,
                      dek
                    ),
                    type: await encryptValue(item.loan_status?.type, dek),
                  };
                }
                const encryptedOutstandingInterestAmount = await encryptValue(
                  item.outstanding_interest_amount,
                  dek
                );
                const encryptedPaymentReferenceNumber = await encryptValue(
                  item.payment_reference_number,
                  dek
                );
                const encryptedPslfStatus = await encryptValue(
                  item.pslf_status,
                  dek
                );
                let encryptedRepaymentPlan;
                if (item.repayment_plan) {
                  encryptedRepaymentPlan = {
                    type: await encryptValue(item.repayment_plan?.type, dek),
                    description: await encryptValue(
                      item.repayment_plan?.description,
                      dek
                    ),
                  };
                }
                const encryptedSequenceNumber = await encryptValue(
                  item.sequence_number,
                  dek
                );
                let encryptedServicerAddress;
                if (item.servicer_address)
                  encryptedServicerAddress = {
                    city: await encryptValue(item.servicer_address?.city, dek),
                    country: await encryptValue(
                      item.servicer_address?.country,
                      dek
                    ),
                    postalCode: await encryptValue(
                      item.servicer_address?.postal_code,
                      dek
                    ),
                    region: await encryptValue(
                      item.servicer_address?.region,
                      dek
                    ),
                    street: await encryptValue(
                      item.servicer_address?.street,
                      dek
                    ),
                  };
                const encryptedYtdInterestPaid = await encryptValue(
                  item.ytd_interest_paid,
                  dek
                );
                const encryptedYtdPrincipalPaid = await encryptValue(
                  item.ytd_principal_paid,
                  dek
                );

                const liability = new Liability({
                  liabilityType: key,
                  accountId: item.account_id,
                  accountNumber: encryptedAccountNumber,
                  lastPaymentAmount: encryptedLastPaymentAmount,
                  lastPaymentDate: encryptedLastPaymentDate,
                  nextPaymentDueDate: encryptedNextPaymentDueDate,
                  minimumPaymentAmount: encryptedMinimumPaymentAmount,
                  lastStatementBalance: encryptedLastStatementBalance,
                  lastStatementIssueDate: encryptedLastStatementIssueDate,
                  isOverdue: encryptedIsOverdue,

                  // Credit-specific fields
                  aprs: encryptedAprs,

                  // Mortgage-specific fields
                  loanTypeDescription: encryptedLoanTypeDescription,
                  loanTerm: encryptedLoanTerm,
                  maturityDate: encryptedMaturityDate,
                  nextMonthlyPayment: encryptedNextMonthlyPayment,
                  originationDate: encryptedOriginationDate,
                  originationPrincipalAmount:
                    encryptedOriginationPrincipalAmount,
                  pastDueAmount: encryptedPastDueAmount,
                  escrowBalance: encryptedEscrowBalance,
                  hasPmi: encryptedHasPmi,
                  hasPrepaymentPenalty: encryptedHasPrepaymentPenalty,
                  propertyAddress: encryptedPropertyAddress,
                  interestRate: encryptedInterestRate,

                  // Student-specific fields
                  disbursementDates: encryptedDisbursementDates,
                  expectedPayoffDate: encryptedExpectedPayoffDate,
                  guarantor: encryptedGuarantor,
                  interestRatePercentage: encryptedInterestRatePercentage,
                  loanName: encryptedLoanName,

                  // Loan status
                  loanStatus: encryptedLoanStatus,
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
              });
            }
          }
        );
      }

      const internalTransfers = await plaidService.detectInternalTransfers(
        transactions
      );

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
    }
  );
};

const removeAccount = async (accountId, email) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
  });
  if (!user) {
    throw new Error("User not found");
  }
  const plaidAccounts = user.plaidAccounts;

  const account = await PlaidAccount.findOne({ plaid_account_id: accountId });
  user.plaidAccounts = plaidAccounts.filter(
    (id) => id.toString() !== account._id.toString()
  );

  await user.save();

  await PlaidAccount.deleteOne({ plaid_account_id: accountId });
  await Transaction.deleteMany({ plaidAccountId: accountId });
  await Liability.deleteMany({ accountId });
};

const getAccounts = async (profile, uid) => {
  return await structuredLogger.withContext(
    "get_accounts",
    { uid, profile_id: profile.id },
    async () => {
      const dek = await getUserDek(uid);
      const plaidIds = profile.plaidAccounts;
      const plaidAccountsResponse = await PlaidAccount.find({
        _id: { $in: plaidIds },
      })
        .lean()
        .select("-accessToken")
        .exec();

      let plaidAccounts = [];

      for (const plaidAccount of plaidAccountsResponse) {
        const decryptedCurrentBalance = await decryptValue(
          plaidAccount.currentBalance,
          dek
        );
        const decryptedAvailableBalance = await decryptValue(
          plaidAccount.availableBalance,
          dek
        );
        const decryptedAccountType = await decryptValue(
          plaidAccount.account_type,
          dek
        );
        const decryptedAccountSubtype = await decryptValue(
          plaidAccount.account_subtype,
          dek
        );
        const decryptedAccountName = await decryptValue(
          plaidAccount.account_name,
          dek
        );
        const decryptedAccountOfficialName = await decryptValue(
          plaidAccount.account_official_name,
          dek
        );
        const decryptedMask = await decryptValue(plaidAccount.mask, dek);

        const decryptedInstitutionName = await decryptValue(
          plaidAccount.institution_name,
          dek
        );

        plaidAccounts.push({
          ...plaidAccount,
          currentBalance: decryptedCurrentBalance,
          availableBalance: decryptedAvailableBalance,
          account_type: decryptedAccountType,
          account_subtype: decryptedAccountSubtype,
          account_name: decryptedAccountName,
          account_official_name: decryptedAccountOfficialName,
          mask: decryptedMask,
          institution_name: decryptedInstitutionName,
        });
      }

      const depositoryAccounts = plaidAccounts.filter(
        (account) => account.account_type === "depository"
      );
      const creditAccounts = plaidAccounts.filter(
        (account) => account.account_type === "credit"
      );
      const investmentAccounts = plaidAccounts.filter(
        (account) => account.account_type === "investment"
      );
      const loanAccounts = plaidAccounts.filter(
        (account) => account.account_type === "loan"
      );
      const otherAccounts = plaidAccounts.filter(
        (account) => account.account_type === "other"
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
    }
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

      if (!user.plaidAccounts.length) {
        structuredLogger.logSuccess("get_all_user_accounts_completed", {
          uid,
          accounts_count: 0,
        });
        return [];
      }

      const accountsResponse = user.plaidAccounts;

      let accounts = [];

      const dek = await getUserDek(uid);

      for (const plaidAccount of accountsResponse) {
        const decryptedCurrentBalance = await decryptValue(
          plaidAccount.currentBalance,
          dek
        );
        const decryptedAvailableBalance = await decryptValue(
          plaidAccount.availableBalance,
          dek
        );
        const decryptedAccountType = await decryptValue(
          plaidAccount.account_type,
          dek
        );
        const decryptedAccountSubtype = await decryptValue(
          plaidAccount.account_subtype,
          dek
        );

        const decryptedAccountName = await decryptValue(
          plaidAccount.account_name,
          dek
        );
        const decryptedAccountOfficialName = await decryptValue(
          plaidAccount.account_official_name,
          dek
        );
        const decryptedMask = await decryptValue(plaidAccount.mask, dek);

        const decryptedInstitutionName = await decryptValue(
          plaidAccount.institution_name,
          dek
        );

        accounts.push({
          ...plaidAccount._doc,
          currentBalance: decryptedCurrentBalance,
          availableBalance: decryptedAvailableBalance,
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
    }
  );
};
const calculateCashFlowsWeekly = async (
  depositoryTransactions,
  creditTransactions,
  allTransactions
) => {
  const groupedTransactions = groupByWeek([
    ...depositoryTransactions,
    ...creditTransactions,
  ]);

  return calculateWeeklyTotals(groupedTransactions, allTransactions);
};

const weeklyCashFlowPlaidAccountSetUpTransactions = async (
  plaidAccounts,
  uid
) => {
  const dek = await getUserDek(uid);

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

  for (const plaidAccount of plaidAccounts) {
    const currentBalance = Number(plaidAccount.currentBalance) || 0;
    const availableBalance = Number(plaidAccount.availableBalance) || 0;

    if (plaidAccount.account_type === "credit" && plaidAccount.currentBalance) {
      balanceCredit = balanceCredit += currentBalance;
    } else if (plaidAccount.account_type === "depository") {
      if (plaidAccount.availableBalance) {
        balanceDebit = balanceDebit += availableBalance;
      } else if (plaidAccount.currentBalance) {
        balanceDebit = balanceDebit += currentBalance;
      }
    } else if (plaidAccount.account_type === "investment") {
      if (plaidAccount?.currentBalance) {
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
          balanceCurrentInvestment = balanceCurrentInvestment += currentBalance;
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
      const decryptedAmount = await decryptValue(transaction.amount, dek);
      const decryptedAccountType = await decryptValue(
        transaction.accountType,
        dek
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
        (transaction) => plaidAccount.account_type === "depository"
      )
    );
    creditTransactions.push(
      ...transactions.filter(
        (transaction) => plaidAccount.account_type === "credit"
      )
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

      let plaidAccounts = [];
      for (const plaidAccount of plaidAccountsResponse) {
        const decryptedCurrentBalance = await decryptValue(
          plaidAccount.currentBalance,
          dek
        );
        const decryptedAvailableBalance = await decryptValue(
          plaidAccount.availableBalance,
          dek
        );
        const decryptedAccountType = await decryptValue(
          plaidAccount.account_type,
          dek
        );
        const decryptedAccountSubtype = await decryptValue(
          plaidAccount.account_subtype,
          dek
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
            if (plaidAccount.account_subtype === "cd") {
              balanceAvailableInvestment = balanceAvailableInvestment +=
                availableBalance;
            } else {
              balanceDebit = balanceDebit += availableBalance;
            }
          } else if (plaidAccount.currentBalance) {
            if (plaidAccount.account_subtype === "cd") {
              balanceCurrentInvestment = balanceCurrentInvestment +=
                currentBalance;
            } else {
              balanceDebit = balanceDebit += currentBalance;
            }
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
          const decryptedAmount = await decryptValue(transaction.amount, dek);
          const decryptedAccountType = await decryptValue(
            transaction.accountType,
            dek
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
        (txn) => !toRemove.has(String(txn._id))
      );

      const filteredOutIds = new Set(
        filteredTxns.map((txn) => String(txn._id))
      );

      const cleanDepositoryTxns = depositoryTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id))
      );

      const cleanCreditTxns = creditTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id))
      );

      const cleanInvestmentTxns = investmentTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id))
      );

      const cleanLoanTxns = loanTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id))
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
        (transaction) => transaction.amount < 0
      );
      const depositoryWithdrawTransactions = cleanDepositoryTxns.filter(
        (transaction) => transaction.amount > 0
      );
      const creditDepositTransactions = cleanCreditTxns.filter(
        (transaction) => transaction.amount < 0
      );
      const creditWithdrawTransactions = cleanCreditTxns.filter(
        (transaction) => transaction.amount > 0
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

      const totalCashBalance = balanceDebit + balanceAvailableInvestment;

      /// Calculate net worth
      // (bank accounts + investments accounts + assets - credit accounts - loan accounts)

      const assets = await assetsService.getAssets(uid);
      const profileAssets = assets.filter(
        (asset) => asset.profileId === profile.id.toString()
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
          (totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1
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
          (transaction) => transaction.accountType === "depository"
        );
        const weekCreditTransactions = weekTransactions.filter(
          (transaction) => transaction.accountType === "credit"
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
    }
  );
};

const getTransactions = async (
  accounts,
  uid,
  pagination = { paginate: false }
) => {
  return await structuredLogger.withContext(
    "get_transactions",
    { uid, accounts_count: accounts.length, pagination },
    async () => {
      const allTransactions = [];

      for (const plaidAccount of accounts) {
        const transactionsResponse = await Transaction.find({
          plaidAccountId: plaidAccount.plaid_account_id,
        })
          .sort({ transactionDate: -1 })
          .lean();

        const dek = await getUserDek(uid);

        const decryptedInstitutionName = await decryptValue(
          plaidAccount.institution_name,
          dek
        );
        const transactions = [];

        for (const transaction of transactionsResponse) {
          const decryptedAmount = await decryptValue(transaction.amount, dek);
          const decryptedName = await decryptValue(transaction.name, dek);
          const decryptedAccountType = await decryptValue(
            transaction.accountType,
            dek
          );

          let decryptedMerchantName;
          let decryptedMerchantMerchantName;
          if (transaction.merchant) {
            decryptedMerchantName = await decryptValue(
              transaction.merchant.name,
              dek
            );

            decryptedMerchantMerchantName = await decryptValue(
              transaction.merchant.merchantName,
              dek
            );
          }

          const decryptedFees = await decryptValue(transaction.fees, dek);

          const decryptedPrice = await decryptValue(transaction.price, dek);

          const decryptedType = await decryptValue(transaction.type, dek);

          const decryptedSubtype = await decryptValue(transaction.subtype, dek);
          const decryptedQuantity = await decryptValue(
            transaction.quantity,
            dek
          );

          const decryptedSecurityId = await decryptValue(
            transaction.securityId,
            dek
          );

          transactions.push({
            ...transaction,
            amount: decryptedAmount,
            name: decryptedName,
            merchant: {
              ...transaction.merchant,
              name: decryptedMerchantName,
              merchantName: decryptedMerchantMerchantName,
            },
            fees: decryptedFees,
            price: decryptedPrice,
            type: decryptedType,
            subtype: decryptedSubtype,
            quantity: decryptedQuantity,
            securityId: decryptedSecurityId,
            accountType: decryptedAccountType,
          });
        }
        transactions.forEach((transaction) => {
          transaction.institutionName = decryptedInstitutionName;
          transaction.institutionId = plaidAccount.institution_id;
        });

        allTransactions.push(...transactions);
      }

      const sortedTransactions = allTransactions.sort(
        (a, b) => new Date(b.transactionDate) - new Date(a.transactionDate)
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
    }
  );
};

const getUserTransactions = async (
  email,
  uid,
  pagination = { paginate: false }
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
  email,
  profileId,
  uid,
  pagination = { paginate: false }
) => {
  const profiles = await businessService.getUserProfiles(email, uid);
  const profile = profiles.find((p) => String(p.id) === profileId);
  if (!profile) {
    throw new Error("Profile not found");
  }
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  let plaidAccounts = [];
  const dek = await getUserDek(uid);

  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await decryptValue(
      plaidAccount.currentBalance,
      dek
    );
    const decryptedAvailableBalance = await decryptValue(
      plaidAccount.availableBalance,
      dek
    );
    const decryptedAccountType = await decryptValue(
      plaidAccount.account_type,
      dek
    );
    const decryptedAccountSubtype = await decryptValue(
      plaidAccount.account_subtype,
      dek
    );

    plaidAccounts.push({
      ...plaidAccount,
      currentBalance: decryptedCurrentBalance,
      availableBalance: decryptedAvailableBalance,
      account_type: decryptedAccountType,
      account_subtype: decryptedAccountSubtype,
    });
  }

  return await getTransactions(plaidAccounts, uid, pagination);
};

const getTransactionsByAccount = async (
  accountId,
  uid,
  pagination = { paginate: false }
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
  for (const transaction of transactionsResponse) {
    const decryptedAmount = await decryptValue(transaction.amount, dek);
    const decryptedName = await decryptValue(transaction.name, dek);
    const decryptedAccountType = await decryptValue(
      transaction.accountType,
      dek
    );

    let decryptedMerchantName;
    let decryptedMerchantMerchantName;
    if (transaction.merchant) {
      decryptedMerchantName = await decryptValue(
        transaction.merchant.name,
        dek
      );

      decryptedMerchantMerchantName = await decryptValue(
        transaction.merchant.merchantName,
        dek
      );
    }

    const decryptedFees = await decryptValue(transaction.fees, dek);

    const decryptedPrice = await decryptValue(transaction.price, dek);

    const decryptedType = await decryptValue(transaction.type, dek);
    const decryptedSubtype = await decryptValue(transaction.subtype, dek);

    const decryptedQuantity = await decryptValue(transaction.quantity, dek);

    allTransactions.push({
      ...transaction,
      amount: decryptedAmount,
      name: decryptedName,
      merchant: {
        ...transaction.merchant,
        name: decryptedMerchantName,
        merchantName: decryptedMerchantMerchantName,
      },
      fees: decryptedFees,
      price: decryptedPrice,
      type: decryptedType,
      subtype: decryptedSubtype,
      quantity: decryptedQuantity,
      accountType: decryptedAccountType,
    });
  }

  allTransactions.forEach((transaction) => {
    transaction.institutionName = account.institution_name;
    transaction.institutionId = account.institution_id;
  });

  const sortedTransactions = allTransactions.sort(
    (a, b) => new Date(b.transactionDate) - new Date(a.transactionDate)
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
      (item) => item.account_id === accountId
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
  targetAccountId
) {
  const securityMap = Object.fromEntries(
    securities.map((sec) => [sec.security_id, sec])
  );

  const accountMap = Object.fromEntries(
    accounts.map((acc) => [acc.account_id, acc])
  );

  const filteredHoldings = holdings.filter(
    (h) => h.account_id === targetAccountId
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

  const account = await PlaidAccount.findOne({ plaid_account_id: accountId })
    .lean()
    .exec();

  const liab = await Liability.find({ accountId: accountId }).lean().exec();

  if (!account) {
    throw new Error("Account not found");
  }
  const deac = await getDecryptedAccount(account, dek);

  const access_token = await getOldestAccessToken({
    userId: profileId,
    institutionId: deac.institution_id,
  });
  const decryptAccessToken = await decryptValue(access_token.accessToken, dek);

  let liabilityPlaid;
  let accountPlaid;

  if (deac.account_type === "credit") {
    liabilityPlaid = await getDecryptedLiabilitiesCredit(liab, dek);
  }

  if (deac.account_type === "loan") {
    liabilityPlaid = await getDecryptedLiabilitiesLoan(liab, dek);
  }

  let investmentData;

  if (deac.account_type === "investment") {
    try {
      const data = await plaidService.getInvestmentsHoldingsWithAccessToken(
        decryptAccessToken
      );
      investmentData = summarizeHoldingsByAccountId(
        data.holdings,
        data.securities,
        data.accounts,
        deac.plaid_account_id
      );
    } catch (error) {
      console.error(
        "Error fetching investment data:",
        error.response?.data || error.message
      );
    }
  }

  const result = {
    account: deac,
    accountPlaid: accountPlaid,
    liabilityPlaid: liabilityPlaid,
    investmentData: investmentData,
  };
  return { ...result };
};

async function getDecryptedLiabilitiesCredit(liabilities, dek) {
  const liabilitiesList = liabilities[0];
  const decryptedLiabilities = {
    _id: liabilitiesList._id,
    liabilityType: liabilitiesList.liabilityType,
    accountNumber: liabilitiesList.accountNumber,
  };
  const binaryFields = [
    "accountId",
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
    if (liabilitiesList[field]) {
      decryptedLiabilities[field] = await decryptValue(
        liabilitiesList[field],
        dek
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
        if (aprItem[key]) {
          decryptedAprItem[key] = await decryptValue(aprItem[key], dek);
        }
      }
      decryptedLiabilities.aprs.push(decryptedAprItem);
    }
  }
  return decryptedLiabilities;
}

async function getDecryptedLiabilitiesLoan(liabilities, dek) {
  const liabilitiesList = liabilities[0];
  const decryptedLiabilities = {
    _id: liabilitiesList._id,
    liabilityType: liabilitiesList.liabilityType,
    accountNumber: liabilitiesList.accountNumber,
  };
  const binaryFields = [
    "accountId",
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
    if (liabilitiesList[field]) {
      decryptedLiabilities[field] = await decryptValue(
        liabilitiesList[field],
        dek
      );
    }
  }
  return decryptedLiabilities;
}

async function getDecryptedAccount(account, dek) {
  const decryptedAccount = {
    _id: account._id,
    owner_id: account.owner_id,
    itemId: account.itemId,
    isAccessTokenExpired: account.isAccessTokenExpired,
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
    "accessToken",
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
      decryptedAccount[field] = await decryptValue(account[field], dek);
    }
  }

  return decryptedAccount;
}

const generateUploadUrl = async (fileName) => {
  try {
    const [url] = await storage
      .bucket(bucketName)
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
      .bucket(bucketName)
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
    plaidWeeklyTransactions.allTransactions
  );
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
    const decryptedAmount = await decryptValue(transaction.amount, dek);

    const decryptedAccountType = await decryptValue(
      transaction.accountType,
      dek
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
      (transaction) => plaidAccount.account_type === "depository"
    )
  );
  creditTransactions.push(
    ...transactions.filter(
      (transaction) => plaidAccount.account_type === "credit"
    )
  );
  investmentTransactions.push(
    ...transactions.filter(
      (transaction) => plaidAccount.account_type === "investment"
    )
  );
  loanTransactions.push(
    ...transactions.filter(
      (transaction) => plaidAccount.account_type === "loan"
    )
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
    (transaction) => transaction.amount < 0
  );
  const depositoryWithdrawTransactions = depositoryTransactions.filter(
    (transaction) => transaction.amount > 0
  );
  const creditDepositTransactions = creditTransactions.filter(
    (transaction) => transaction.amount < 0
  );
  const creditWithdrawTransactions = creditTransactions.filter(
    (transaction) => transaction.amount > 0
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
      (totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1
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
      (transaction) => transaction.accountType === "depository"
    );
    const weekCreditTransactions = weekTransactions.filter(
      (transaction) => transaction.accountType === "credit"
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
  };
};

const formatTransactionsWithSigns = (transactions) => {
  for (const transaction of transactions) {
    if (transaction.accountType === "depository") {
      transaction.amount = transaction.amount * -1;
    } else if (transaction.accountType === "investment") {
      transaction.amount = Math.abs(transaction.amount);
    }
    delete transaction.merchant._id;
    delete transaction.merchant.website;
    delete transaction.merchant.logo;
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
        : account.currentBalance ?? 0;
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
  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await decryptValue(
      plaidAccount.currentBalance,
      dek
    );
    const decryptedAvailableBalance = await decryptValue(
      plaidAccount.availableBalance,
      dek
    );
    const decryptedAccountType = await decryptValue(
      plaidAccount.account_type,
      dek
    );
    const decryptedAccountSubtype = await decryptValue(
      plaidAccount.account_subtype,
      dek
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
  removeAccount,
  getCashFlowsByPlaidAccount,
  formatTransactionsWithSigns,
  formatAccountsBalances,
};

export default accountsService;
