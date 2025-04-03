import plaidService from "./plaid.service.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import businessService from "./businesses.service.js";
import { Storage } from "@google-cloud/storage";
import Liability from "../database/models/Liability.js";
import { kmsDecrypt, kmsEncrypt } from "../lib/encrypt.js";

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

const addAccount = async (accessToken, email) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
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
    const mask = await kmsEncrypt({
      value: account.mask,
    });
    const existingAccount = await PlaidAccount.findOne({
      institution_id: institutionId,
      institution_name: institutionName,
      mask: mask,
      owner_id: user._id,
    });

    console.log("EXISTING ACCOUNT", existingAccount);

    if (existingAccount) continue;

    const encryptedToken = await kmsEncrypt({
      value: accessToken,
    });

    const encriptedName = await kmsEncrypt({
      value: account.name,
    });

    let encriptedOfficialName;

    if (account.official_name) {
      encriptedOfficialName = await kmsEncrypt({
        value: account.official_name,
      });
    }

    const encriptedType = await kmsEncrypt({
      value: account.type,
    });

    const encriptedSubtype = await kmsEncrypt({
      value: account.subtype,
    });

    let encriptedInstitutionName;

    if (account.institution_name) {
      encriptedInstitutionName = await kmsEncrypt({
        value: account.institution_name,
      });
    }

    const encriptedMask = await kmsEncrypt({
      value: account.mask,
    });

    let encriptedCurrentBalance;
    let encriptedAvailableBalance;

    if (account.balances) {
      if (account.balances.current) {
        encriptedCurrentBalance = await kmsEncrypt({
          value: account.balances.current,
        });
      }

      if (account.balances.available) {
        encriptedAvailableBalance = await kmsEncrypt({
          value: account.balances.available.toString(),
        });
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
      mask: encriptedMask,
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
      merchantName = await kmsEncrypt({
        value: transaction.merchant_name,
      });
    }

    if (transaction.name) {
      name = await kmsEncrypt({
        value: transaction.name,
      });
    }

    const merchant = {
      merchantName: merchantName,
      name: name,
      merchantCategory: transaction.category?.[0],
      website: transaction.website,
      logo: transaction.logo_url,
    };

    let transactionCode;

    const encyptedAmount = await kmsEncrypt({
      value: transaction.amount,
    });

    if (transaction.transaction_code) {
      transactionCode = await kmsEncrypt({
        value: transaction.transaction_code,
      });
    }
    let encryptedAccountType;
    if (accountType) {
      encryptedAccountType = await kmsEncrypt({
        value: accountType,
      });
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

    const encryptedAmount = await kmsEncrypt({
      value: transaction.amount,
    });

    let name;
    let fees;
    let price;
    let quantity;
    let securityId;
    let type;
    let subtype;

    if (transaction.name) {
      name = await kmsEncrypt({
        value: transaction.name,
      });
    }

    if (transaction.fees) {
      fees = await kmsEncrypt({
        value: transaction.fees,
      });
    }

    if (transaction.price) {
      price = await kmsEncrypt({
        value: transaction.price,
      });
    }

    if (transaction.quantity) {
      quantity = await kmsEncrypt({
        value: transaction.quantity,
      });
    }

    if (transaction.security_id) {
      securityId = await kmsEncrypt({
        value: transaction.security_id,
      });
    }

    if (transaction.type) {
      type = await kmsEncrypt({
        value: transaction.type,
      });
    }

    if (transaction.subtype) {
      subtype = await kmsEncrypt({
        value: transaction.subtype,
      });
    }

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
      accountType: accountType ?? "",
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

          let encryptedAccountNumber;
          let encryptedLastPaymentAmount;
          let encryptedLastPaymentDate;
          let encryptedNextPaymentDueDate;
          let encryptedMinimumPaymentAmount;
          let encryptedLastStatementBalance;
          let encryptedLastStatementIssueDate;
          let encryptedIsOverdue;
          let encryptedAprs;
          let encryptedLoanTypeDescription;
          let encryptedLoanTerm;
          let encryptedMaturityDate;
          let encryptedNextMonthlyPayment;
          let encryptedOriginationDate;
          let encryptedOriginationPrincipalAmount;
          let encryptedPastDueAmount;
          let encryptedEscrowBalance;
          let encryptedHasPmi;
          let encryptedHasPrepaymentPenalty;
          let encryptedPropertyAddress;
          let encryptedInterestRate;
          let encryptedDisbursementDates;
          let encryptedExpectedPayoffDate;
          let encryptedGuarantor;
          let encryptedInterestRatePercentage;
          let encryptedLoanName;
          let encryptedLoanStatus;
          let encryptedOutstandingInterestAmount;
          let encryptedPaymentReferenceNumber;
          let encryptedPslfStatus;
          let encryptedRepaymentPlan;
          let encryptedSequenceNumber;
          let encryptedServicerAddress;
          let encryptedYtdInterestPaid;
          let encryptedYtdPrincipalPaid;

          if (item.account_number) {
            encryptedAccountNumber = await kmsEncrypt({
              value: item.account_number,
            });
          }

          if (item.last_payment_amount) {
            encryptedLastPaymentAmount = await kmsEncrypt({
              value: item.last_payment_amount,
            });
          }

          if (item.last_payment_date) {
            encryptedLastPaymentDate = await kmsEncrypt({
              value: item.last_payment_date,
            });
          }

          if (item.next_payment_due_date) {
            encryptedNextPaymentDueDate = await kmsEncrypt({
              value: item.next_payment_due_date,
            });
          }

          if (item.minimum_payment_amount) {
            encryptedMinimumPaymentAmount = await kmsEncrypt({
              value: item.minimum_payment_amount,
            });
          }

          if (item.last_statement_balance) {
            encryptedLastStatementBalance = await kmsEncrypt({
              value: item.last_statement_balance,
            });
          }

          if (item.last_statement_issue_date) {
            encryptedLastStatementIssueDate = await kmsEncrypt({
              value: item.last_statement_issue_date,
            });
          }

          if (item.is_overdue) {
            encryptedIsOverdue = await kmsEncrypt({
              value: item.is_overdue,
            });
          }

          if (item.aprs) {
            encryptedAprs = await kmsEncrypt({
              value: item.aprs,
            });
          }

          if (item.loan_type_description) {
            encryptedLoanTypeDescription = await kmsEncrypt({
              value: item.loan_type_description,
            });
          }

          if (item.loan_term) {
            encryptedLoanTerm = await kmsEncrypt({
              value: item.loan_term,
            });
          }

          if (item.maturity_date) {
            encryptedMaturityDate = await kmsEncrypt({
              value: item.maturity_date,
            });
          }

          if (item.next_monthly_payment) {
            encryptedNextMonthlyPayment = await kmsEncrypt({
              value: item.next_monthly_payment,
            });
          }

          if (item.origination_date) {
            encryptedOriginationDate = await kmsEncrypt({
              value: item.origination_date,
            });
          }

          if (item.origination_principal_amount) {
            encryptedOriginationPrincipalAmount = await kmsEncrypt({
              value: item.origination_principal_amount,
            });
          }

          if (item.past_due_amount) {
            encryptedPastDueAmount = await kmsEncrypt({
              value: item.past_due_amount,
            });
          }

          if (item.escrow_balance) {
            encryptedEscrowBalance = await kmsEncrypt({
              value: item.escrow_balance,
            });
          }

          if (item.has_pmi) {
            encryptedHasPmi = await kmsEncrypt({
              value: item.has_pmi,
            });
          }

          if (item.has_prepayment_penalty) {
            encryptedHasPrepaymentPenalty = await kmsEncrypt({
              value: item.has_prepayment_penalty,
            });
          }

          if (item.property_address) {
            encryptedPropertyAddress = await kmsEncrypt({
              value: item.property_address,
            });
          }

          if (item.interest_rate) {
            encryptedInterestRate = await kmsEncrypt({
              value: item.interest_rate,
            });
          }

          if (item.disbursement_dates) {
            encryptedDisbursementDates = await kmsEncrypt({
              value: item.disbursement_dates,
            });
          }

          if (item.expected_payoff_date) {
            encryptedExpectedPayoffDate = await kmsEncrypt({
              value: item.expected_payoff_date,
            });
          }

          if (item.guarantor) {
            encryptedGuarantor = await kmsEncrypt({
              value: item.guarantor,
            });
          }

          if (item.interest_rate_percentage) {
            encryptedInterestRatePercentage = await kmsEncrypt({
              value: item.interest_rate_percentage,
            });
          }

          if (item.loan_name) {
            encryptedLoanName = await kmsEncrypt({
              value: item.loan_name,
            });
          }

          if (item.loan_status) {
            encryptedLoanStatus = await kmsEncrypt({
              value: item.loan_status,
            });
          }

          if (item.outstanding_interest_amount) {
            encryptedOutstandingInterestAmount = await kmsEncrypt({
              value: item.outstanding_interest_amount,
            });
          }

          if (item.payment_reference_number) {
            encryptedPaymentReferenceNumber = await kmsEncrypt({
              value: item.payment_reference_number,
            });
          }

          if (item.pslf_status) {
            encryptedPslfStatus = await kmsEncrypt({
              value: item.pslf_status,
            });
          }

          if (item.repayment_plan) {
            encryptedRepaymentPlan = await kmsEncrypt({
              value: item.repayment_plan,
            });
          }

          if (item.sequence_number) {
            encryptedSequenceNumber = await kmsEncrypt({
              value: item.sequence_number,
            });
          }

          if (item.servicer_address) {
            encryptedServicerAddress = await kmsEncrypt({
              value: item.servicer_address,
            });
          }

          if (item.ytd_interest_paid) {
            encryptedYtdInterestPaid = await kmsEncrypt({
              value: item.ytd_interest_paid,
            });
          }

          if (item.ytd_principal_paid) {
            encryptedYtdPrincipalPaid = await kmsEncrypt({
              value: item.ytd_principal_paid,
            });
          }

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

  const internalTransfers = await plaidService.detectInternalTransfers(email);

  for (const transactionId of internalTransfers) {
    const transaction = await Transaction.findOne({
      plaidTransactionId: transactionId,
    });
    if (!transaction) continue;
    transaction.isInternal = true;
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

const getAccounts = async (profile) => {
  const plaidIds = profile.plaidAccounts;

  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  })
    .lean()
    .select("-accessToken")
    .exec();

  let plaidAccounts = [];

  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await kmsDecrypt({
      value: plaidAccount.currentBalance,
    });
    const decryptedAvailableBalance = await kmsDecrypt({
      value: plaidAccount.availableBalance,
    });
    const decryptedAccountType = await kmsDecrypt({
      value: plaidAccount.account_type,
    });
    const decryptedAccountSubtype = await kmsDecrypt({
      value: plaidAccount.account_subtype,
    });
    const decryptedAccountName = await kmsDecrypt({
      value: plaidAccount.account_name,
    });
    const decryptedAccountOfficialName = await kmsDecrypt({
      value: plaidAccount.account_official_name,
    });
    const decryptedMask = await kmsDecrypt({
      value: plaidAccount.mask,
    });

    plaidAccounts.push({
      ...plaidAccount,
      currentBalance: decryptedCurrentBalance,
      availableBalance: decryptedAvailableBalance,
      account_type: decryptedAccountType,
      account_subtype: decryptedAccountSubtype,
      account_name: decryptedAccountName,
      account_official_name: decryptedAccountOfficialName,
      mask: decryptedMask,
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

  return {
    depositoryAccounts,
    creditAccounts,
    investmentAccounts,
    loanAccounts,
    otherAccounts,
  };
};

const getAllUserAccounts = async (email) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
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

  for (const plaidAccount of accountsResponse) {
    const decryptedCurrentBalance = await kmsDecrypt({
      value: plaidAccount.currentBalance,
    });
    const decryptedAvailableBalance = await kmsDecrypt({
      value: plaidAccount.availableBalance,
    });
    const decryptedAccountType = await kmsDecrypt({
      value: plaidAccount.account_type,
    });
    const decryptedAccountSubtype = await kmsDecrypt({
      value: plaidAccount.account_subtype,
    });

    const decryptedAccountName = await kmsDecrypt({
      value: plaidAccount.account_name,
    });
    const decryptedAccountOfficialName = await kmsDecrypt({
      value: plaidAccount.account_official_name,
    });
    const decryptedMask = await kmsDecrypt({
      value: plaidAccount.mask,
    });

    accounts.push({
      ...plaidAccount._doc,
      currentBalance: decryptedCurrentBalance,
      availableBalance: decryptedAvailableBalance,
      account_type: decryptedAccountType,
      account_subtype: decryptedAccountSubtype,
      account_name: decryptedAccountName,
      account_official_name: decryptedAccountOfficialName,
      mask: decryptedMask,
    });
  }

  return accounts;
};

const getCashFlowsWeekly = async (profile) => {
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  let plaidAccounts = [];
  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await kmsDecrypt({
      value: plaidAccount.currentBalance,
    });
    const decryptedAvailableBalance = await kmsDecrypt({
      value: plaidAccount.availableBalance,
    });
    const decryptedAccountType = await kmsDecrypt({
      value: plaidAccount.account_type,
    });
    const decryptedAccountSubtype = await kmsDecrypt({
      value: plaidAccount.account_subtype,
    });

    plaidAccounts.push({
      ...plaidAccount,
      currentBalance: decryptedCurrentBalance,
      availableBalance: decryptedAvailableBalance,
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
  let balanceLoan = 0;
  const depositoryTransactions = [];
  const creditTransactions = [];

  for (const plaidAccount of plaidAccounts) {
    const currentBalance = Number(plaidAccount.currentBalance) || 0;
    const availableBalance = Number(plaidAccount.availableBalance) || 0;

    if (plaidAccount.account_type === "credit" && plaidAccount.currentBalance) {
      balanceCredit = balanceCredit += currentBalance;
    } else if (
      plaidAccount.account_type === "depository" &&
      plaidAccount.availableBalance
    ) {
      balanceDebit = balanceDebit += availableBalance;
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
      const decryptedAmount = await kmsDecrypt({
        value: transaction.amount,
      });

      transactions.push({
        ...transaction,
        amount: decryptedAmount,
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

  console.log("depositoryTransactions", depositoryTransactions);
  console.log("creditTransactions", creditTransactions);

  const groupedTransactions = groupByWeek([
    ...depositoryTransactions,
    ...creditTransactions,
  ]);

  const result = calculateWeeklyTotals(groupedTransactions);
  console.log("result", result);
  return { weeklyCashFlow: result };
};

const getCashFlows = async (profile) => {
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  let plaidAccounts = [];
  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await kmsDecrypt({
      value: plaidAccount.currentBalance,
    });
    const decryptedAvailableBalance = await kmsDecrypt({
      value: plaidAccount.availableBalance,
    });
    const decryptedAccountType = await kmsDecrypt({
      value: plaidAccount.account_type,
    });
    const decryptedAccountSubtype = await kmsDecrypt({
      value: plaidAccount.account_subtype,
    });

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
      const decryptedAmount = await kmsDecrypt({
        value: transaction.amount,
      });

      transactions.push({
        ...transaction,
        amount: decryptedAmount,
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
  if (totalDeposits !== 0 || totalWithdrawls !== 0) {
    currentCashFlow = (
      (totalDeposits - totalWithdrawls) /
      totalDeposits
    ).toFixed(2);
  } else {
    currentCashFlow = 0;
  }

  currentCashFlow = currentCashFlow * 100;

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

  return {
    currentCashFlow,
    totalCashBalance,
    averageDailySpend,
    averageDailyIncome,
    netWorth,
    cashRunway,
    advice,
  };
};

const getTransactions = async (accounts) => {
  const allTransactions = [];

  for (const plaidAccount of accounts) {
    const transactionsResponse = await Transaction.find({
      plaidAccountId: plaidAccount.plaid_account_id,
    })
      .sort({ transactionDate: -1 })
      .lean();

    const transactions = [];

    for (const transaction of transactionsResponse) {
      const decryptedAmount = await kmsDecrypt({
        value: transaction.amount,
      });
      const decryptedName = await kmsDecrypt({
        value: transaction.name,
      });

      let decryptedMerchantName;
      let decryptedMerchantMerchantName;
      if (transaction.merchant) {
        decryptedMerchantName = await kmsDecrypt({
          value: transaction.merchant.name,
        });

        decryptedMerchantMerchantName = await kmsDecrypt({
          value: transaction.merchant.merchantName,
        });
      }

      const decryptedFees = await kmsDecrypt({
        value: transaction.fees,
      });

      const decryptedPrice = await kmsDecrypt({
        value: transaction.price,
      });

      const decryptedType = await kmsDecrypt({
        value: transaction.type,
      });

      const decryptedSubtype = await kmsDecrypt({
        value: transaction.subtype,
      });

      const decryptedQuantity = await kmsDecrypt({
        value: transaction.quantity,
      });

      const decryptedSecurityId = await kmsDecrypt({
        value: transaction.securityId,
      });

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

const getUserTransactions = async (email) => {
  const user = await User.findOne({ "email.email": email.toLowerCase() })
    .populate("plaidAccounts")
    .exec();

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.plaidAccounts.length) {
    return [];
  }

  const accounts = user.plaidAccounts;

  return getTransactions(accounts);
};

const getProfileTransactions = async (email, profileId) => {
  const profiles = await businessService.getUserProfiles(email);
  const profile = profiles.find((p) => String(p.id) === profileId);
  if (!profile) {
    throw new Error("Profile not found");
  }
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  let plaidAccounts = [];

  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedCurrentBalance = await kmsDecrypt({
      value: plaidAccount.currentBalance,
    });
    const decryptedAvailableBalance = await kmsDecrypt({
      value: plaidAccount.availableBalance,
    });
    const decryptedAccountType = await kmsDecrypt({
      value: plaidAccount.account_type,
    });
    const decryptedAccountSubtype = await kmsDecrypt({
      value: plaidAccount.account_subtype,
    });

    plaidAccounts.push({
      ...plaidAccount,
      currentBalance: decryptedCurrentBalance,
      availableBalance: decryptedAvailableBalance,
      account_type: decryptedAccountType,
      account_subtype: decryptedAccountSubtype,
    });
  }

  return await getTransactions(plaidAccounts);
};

const getTransactionsByAccount = async (accountId) => {
  const account = await PlaidAccount.findOne({ plaid_account_id: accountId })
    .populate("transactions")
    .lean()
    .exec();

  if (!account) {
    throw new Error("Account not found");
  }

  let allTransactions = [];

  for (const transaction of account.transactions) {
    const decryptedAmount = await kmsDecrypt({
      value: transaction.amount,
    });
    const decryptedName = await kmsDecrypt({
      value: transaction.name,
    });

    let decryptedMerchantName;
    let decryptedMerchantMerchantName;
    if (transaction.merchant) {
      decryptedMerchantName = await kmsDecrypt({
        value: transaction.merchant.name,
      });

      decryptedMerchantMerchantName = await kmsDecrypt({
        value: transaction.merchant.merchantName,
      });
    }

    const decryptedFees = await kmsDecrypt({
      value: transaction.fees,
    });

    const decryptedPrice = await kmsDecrypt({
      value: transaction.price,
    });

    const decryptedType = await kmsDecrypt({
      value: transaction.type,
    });

    const decryptedSubtype = await kmsDecrypt({
      value: transaction.subtype,
    });

    const decryptedQuantity = await kmsDecrypt({
      value: transaction.quantity,
    });

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

const accountsService = {
  addAccount,
  getAccounts,
  getCashFlows,
  getUserTransactions,
  getTransactionsByAccount,
  getAllUserAccounts,
  generateUploadUrl,
  generateSignedUrl,
  getProfileTransactions,
};

export default accountsService;
