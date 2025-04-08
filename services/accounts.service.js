import plaidService from "./plaid.service.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import businessService from "./businesses.service.js";
import { Storage } from "@google-cloud/storage";
import Liability from "../database/models/Liability.js";
import AccessToken from "../database/models/AccessToken.js";

import {
  decryptValue,
  encryptValue,
  getUserDek,
} from "../database/encryption.js";
import { calculateWeeklyTotals, groupByWeek } from "./utils/accounts.js";

const storage = new Storage({
  credentials: {
    type: "service_account",
    project_id: "zentavos-d6c79",
    private_key_id: "24978c4e7ffff262c73c88f0a625e74dfa1f8dbd",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCWnQNWbrHeEEwX\nLYRgr8iPwqIIrYoQ446/dR/hMPPetXtt5cJfMmPVLV2PQmpZU016r9txVT4bDtLJ\n0aLc6C0BecyyoFlXak66dloz5LSKogkt1DCwQmRKoeDK5ZB3NcYqemFj+csF86Qw\nVHi1agu/dLyp2kYpC7j4VOzhK/fsoOtNDPOkRn5ozFVID37dSmlfC2LJJ71h26S2\n7hOd0bmMtM1f7q8nNOkHAm/Us1SYd7oqgD0uh5F+re6pQJRDB/pz3xtiOOFqFjPi\n1t6gr4HlBkKZIPtLF916x+Pd7MVyk6xP0zNU63GDhvZCDajftZPNYSOG3p1EVBtA\nRhpsYNd7AgMBAAECggEAAc2BOm89k5JYJ4pxbvanT7an4YSO+LPXIPLm9hJkP2yW\n8vkO5H5qzk9ep3QYtZFGnTaNcHVWZRqq+Cw0dJ1zfQ/1NBVbxpW8LfXRVVcp/f5i\njK5Rxfav5jvhlV8LjF8SBniXWOUi7xtoz692yjtIyq7yV5VV0PRKUIscxutwu8Dc\nF0KeePndfKbDnNk6rGD0FLJkyk6inoXuOtYJJiq0xhzetMYyG1nUoGlwKx9dZAMz\nPa/yCCY3uFu4GGzMQVO54kfms0qdo8q35kIAyG6Nhqu/MrmrEGdIvN12g6mbyPXj\nOGsSFaSDMpsTQWjylr+lCJCFjzu63gVax9UO7ucAgQKBgQDH0+HLD45xDZrNX4Dz\nFjGjOMBTJKKGsxM06xx66Gk9gCEPS7LCGzLTT12AZ+ybxvPizpiXMcLSD2eROnUy\n1VxgyjX6qwbDxKyiGb1fJ5LJwUH1g03h02C3xpPxTpJYpZjszZuuvkTVvncdI2BJ\nFgzbaGAFOceUSY3yfQS4K4CMgQKBgQDA84oxcL6+l5wIJqn3hrhrsoChfnxRRJhM\nBgUONjWeT3nY2M55ohbUgJB3wlUxcaXd5yUjTwA8MYGVIH72G7VwxKJ7vQVwQIxJ\nrOhD9eoncfn5QfHnfQLgzkUcN6Tu91fqbCcbDd6cBJnLiqvuQ3LxrKoINEq/hhyI\neE6ta5CV+wKBgFtbSR1W7V5OQ/mksgVwnhzrMzJPy2YdtKg63PhsDMErNPITP5Ry\nbtggrrSnzoqheJq2rRhijZkPpd/FhBNLbEJr8CW7zwntfqdVcThxlTBcBFXEQ/T8\neHlMdhKaQ1n3y2Rn08ceAcZen4JYzApd5F7i5xM8iTwILLcx5Nh2Ov0BAoGBAKsw\nJ75/miv81OmCbC/5LewXPfqJ/wAXTMu+V4PpYp7nQmK60E2oGntE6WfnWbB5dUCw\nUAnIkJvXDHHjl+EAanT3cHU6GfYivpSrPJL3PlzqyW51LItGJWSQfU5wq/t8JVsN\nw5BEOOnRRyYIDUxiOTvkBiMrSdoswWnu21cPZQM7AoGACLcQoJgRAPQ0RKFYoghq\nEWz0rd+opwsfCzGNdti74GQ9LCdGC+8yPld3UjV+eQhRbgWao+D8yKNvLlKoq+5c\nYGURUsKdSShWy2sTM1rvtGQim90lJHfGel29xxjDY69jvyDS/sZQ4Gbz3QosF/Qj\nmLKxxwRvKbzZCjUO/LU2l9U=\n-----END PRIVATE KEY-----\n",
    client_email: "storage-admin@zentavos-d6c79.iam.gserviceaccount.com",
    client_id: "117489984613438292578",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url:
      "https://www.googleapis.com/robot/v1/metadata/x509/storage-admin%40zentavos-d6c79.iam.gserviceaccount.com",
    universe_domain: "googleapis.com",
  },
});
const bucketName = "zentavos-bucket";

const addAccount = async (accessToken, email, uid) => {
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

  for (let account of accounts) {
    const existingAccount = await PlaidAccount.findOne({
      plaid_account_id: account.account_id,
      owner_id: user._id,
    });

    console.log("EXISTING ACCOUNT", existingAccount);

    if (existingAccount) continue;

    const encryptedMask = await encryptValue(account.mask, dek);

    const encryptedToken = await encryptValue(accessToken, dek);

    const encriptedName = await encryptValue(account.name, dek);

    let encriptedOfficialName;

    if (account.official_name) {
      encriptedOfficialName = await encryptValue(account.official_name, dek);
    }

    const encriptedType = await encryptValue(account.type, dek);

    const encriptedSubtype = await encryptValue(account.subtype, dek);

    const encriptedInstitutionName = await encryptValue(institutionName, dek);

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
    });

    accountTypes[account.account_id] = account.type;

    userAccounts.push(newAccount._id);

    await user.save();
    await newAccount.save();
    savedAccounts.push(newAccount);
  }
  let transactionsResponse;
  let investmentTransactionsResponse;
  let liabilitiesResponse;
  if (accountsResponse.item.products.includes("transactions")) {
    try {
      transactionsResponse = await plaidService.getTransactionsWithAccessToken(
        accessToken
      );
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

  console.log("investmentTransactionsResponse", investmentTransactionsResponse);

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
  const transactions = transactionsResponse ? transactionsResponse.added : [];
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
      transactionCode = await encryptValue(transaction.transaction_code, dek);
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
    Object.entries(liabilitiesResponse.liabilities).forEach(([key, value]) => {
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

          const encryptedIsOverdue = await encryptValue(item.is_overdue, dek);

          const encryptedAprs = item.aprs
            ? await Promise.all(
                item.aprs.map(async (apr) => ({
                  aprPercentage: await encryptValue(apr.apr_percentage, dek),
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

          const encryptedLoanTerm = await encryptValue(item.loan_term, dek);

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
              country: await encryptValue(item.property_address?.country, dek),
              postalCode: await encryptValue(
                item.property_address?.postal_code,
                dek
              ),
              region: await encryptValue(item.property_address?.region, dek),
              street: await encryptValue(item.property_address?.street, dek),
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

          const encryptedGuarantor = await encryptValue(item.guarantor, dek);

          const encryptedInterestRatePercentage = await encryptValue(
            item.interest_rate_percentage,
            dek
          );

          const encryptedLoanName = await encryptValue(item.loan_name, dek);
          let encryptedLoanStatus;
          if (item.loan_status) {
            encryptedLoanStatus = {
              endDate: await encryptValue(item.loan_status?.end_date, dek),
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
          const encryptedPslfStatus = await encryptValue(item.pslf_status, dek);
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
              country: await encryptValue(item.servicer_address?.country, dek),
              postalCode: await encryptValue(
                item.servicer_address?.postal_code,
                dek
              ),
              region: await encryptValue(item.servicer_address?.region, dek),
              street: await encryptValue(item.servicer_address?.street, dek),
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
            originationPrincipalAmount: encryptedOriginationPrincipalAmount,
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
    });
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
    const account = await PlaidAccount.findOne({ plaid_account_id: accountId });
    if (!account) continue;
    account.transactions.push(...transactionsByAccount[accountId]);
    account.nextCursor = nextCursor;
    await account.save();
  }

  return savedAccounts;
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

  const tokens = await plaidService.getUserAccessTokens(
    "galvanerick27@gmail.com"
  );
  console.log(tokens);

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

  return {
    depositoryAccounts,
    creditAccounts,
    investmentAccounts,
    loanAccounts,
    otherAccounts,
  };
};

const getAllUserAccounts = async (email, uid) => {
  console.time("getAllUserAccounts");
  const user = await User.findOne({
    authUid: uid,
  })
    .populate("plaidAccounts", "-transactions")
    .exec();
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.plaidAccounts.length) {
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

  console.timeEnd("getAllUserAccounts");
  return accounts;
};
const calculateCashFlowsWeekly = async (
  depositoryTransactions,
  creditTransactions
) => {
  const groupedTransactions = groupByWeek([
    ...depositoryTransactions,
    ...creditTransactions,
  ]);

  return calculateWeeklyTotals(groupedTransactions);
};

const weeklyCashFlowPlaidAccountSetUpTransactions = async (
  plaidAccounts,
  uid
) => {
  const dataKeyId = await connectEncryption(uid);

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

  for (const plaidAccount of plaidAccounts) {
    if (plaidAccount.account_type === "credit" && plaidAccount.currentBalance) {
      balanceCredit = balanceCredit += plaidAccount.currentBalance;
    } else if (
      plaidAccount.account_type === "depository" &&
      plaidAccount.availableBalance
    ) {
      balanceDebit = balanceDebit += plaidAccount.availableBalance;
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

    const transactions = await Transaction.find({
      plaidAccountId: plaidAccount.plaid_account_id,
      transactionDate: { $gte: ninetyDaysAgo },
      isInternal: false,
    })
      .sort({ transactionDate: 1 })
      .lean();

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
  return { depositoryTransactions, creditTransactions };
};

const getCashFlowsWeekly = async (profile, uid) => {
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  let plaidAccounts = [];

  const dataKeyId = await connectEncryption(uid);
  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await kmsDecrypt({
      value: plaidAccount.currentBalance,
      dataKeyId,
    });
    const decryptedAvailableBalance = await kmsDecrypt({
      value: plaidAccount.availableBalance,
      dataKeyId,
    });
    const decryptedAccountType = await kmsDecrypt({
      value: plaidAccount.account_type,
      dataKeyId,
    });
    const decryptedAccountSubtype = await kmsDecrypt({
      value: plaidAccount.account_subtype,
      dataKeyId,
    });

    plaidAccounts.push({
      ...plaidAccount,
      currentBalance: decryptedCurrentBalance,
      availableBalance: decryptedAvailableBalance,
      account_type: decryptedAccountType,
      account_subtype: decryptedAccountSubtype,
    });
  }

  const { depositoryTransactions, creditTransactions } =
    await weeklyCashFlowPlaidAccountSetUpTransactions(plaidAccounts, uid);

  const groupedTransactions = groupByWeek([
    ...depositoryTransactions,
    ...creditTransactions,
  ]);

  const result = calculateWeeklyTotals(groupedTransactions);
  return { weeklyCashFlow: result };
};

const getCashFlows = async (profile) => {
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

    if (plaidAccount.account_type === "credit" && plaidAccount.currentBalance) {
      balanceCredit = balanceCredit += currentBalance;
    } else if (plaidAccount.account_type === "depository") {
      if (plaidAccount.availableBalance) {
        balanceDebit = balanceDebit += availableBalance;
      } else if (plaidAccount.currentBalance) {
        balanceDebit = balanceDebit += currentBalance;
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

  const filteredOutIds = new Set(filteredTxns.map((txn) => String(txn._id)));

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
    const totalDeposits = depositoryDepositsAmount;
    averageDailyIncome = Math.abs(totalDeposits / 90).toFixed(2);
  }

  /// Calculate total cash balance

  const totalCashBalance = balanceDebit + balanceAvailableInvestment;

  /// Calculate net worth
  // (bank accounts + investments accounts + assets - credit accounts - loan accounts)
  //TODO: Add assets

  const netWorth =
    balanceDebit + allInvestmentsCurrentBalance - balanceCredit - balanceLoan;

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
  };
};

const getTransactions = async (accounts, uid) => {
  const allTransactions = [];

  for (const plaidAccount of accounts) {
    const transactionsResponse = await Transaction.find({
      plaidAccountId: plaidAccount.plaid_account_id,
    })
      .sort({ transactionDate: -1 })
      .lean();

    const transactions = [];
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
      transaction.institutionName = plaidAccount.institution_name;
      transaction.institutionId = plaidAccount.institution_id;
    });

    allTransactions.push(...transactions);
  }

  const sortedTransactions = allTransactions.sort(
    (a, b) => new Date(b.transactionDate) - new Date(a.transactionDate)
  );

  return sortedTransactions;
};

const getUserTransactions = async (email, uid) => {
  const user = await User.findOne({ authUid: uid })
    .populate("plaidAccounts")
    .exec();

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.plaidAccounts.length) {
    return [];
  }

  const accounts = user.plaidAccounts;

  return getTransactions(accounts, uid);
};

const getProfileTransactions = async (email, profileId, uid) => {
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

  return await getTransactions(plaidAccounts, uid);
};

const getTransactionsByAccount = async (accountId, uid) => {
  const account = await PlaidAccount.findOne({ plaid_account_id: accountId })
    .populate("transactions")
    .lean()
    .exec();

  if (!account) {
    throw new Error("Account not found");
  }

  let allTransactions = [];
  const dek = await getUserDek(uid);
  for (const transaction of account.transactions) {
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
  return sortedTransactions;
};

const findLiabilityByAccountId = (accountId, liabilities) => {
  for (const category in liabilities) {
    if (!liabilities[category]) {
      return null;
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

const getAccountDetails = async (accountId, profileId, uid) => {
  const access_token = await AccessToken.findOne({ userId: profileId })
    .lean()
    .exec();

  const dek = await getUserDek(uid);

  const decryptAccessToken = await decryptValue(access_token.accessToken, dek);

  const response = await plaidService.getLoanLiabilitiesWithAccessToken(
    decryptAccessToken
  );

  const accountPlaid = response.accounts.find(
    (account) => account.account_id === accountId
  );
  const decryptLiabilities = await decryptValue(response.liabilities, dek);
  const liabilityPlaid = await findLiabilityByAccountId(
    accountId,
    decryptLiabilities
  );

  const account = await PlaidAccount.findOne({ plaid_account_id: accountId })
    .lean()
    .exec();
  if (!account) {
    throw new Error("Account not found");
  }
  const deac = await getDecryptedAccount(account, dek);
  const accountPlaidDec = await decryptValue(accountPlaid, dek);

  const liabilityDec = await decryptValue(liabilityPlaid, dek);

  const result = {
    account: deac,
    accountPlaid: accountPlaidDec,
    liabilityPlaid: liabilityDec,
  };
  return { ...result };
};

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
    plaidWeeklyTransactions.creditTransactions
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
    const totalDeposits = depositoryDepositsAmount;
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
};

export default accountsService;
