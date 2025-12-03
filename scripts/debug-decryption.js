
import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import Business from '../database/models/Businesses.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import Liability from '../database/models/Liability.js';
import AccessToken from '../database/models/AccessToken.js';
import { getUserDek, decryptValue } from '../database/encryption.js';
import structuredLogger from '../lib/structuredLogger.js';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function run() {
  const argv = yargs(hideBin(process.argv))
    .option('firebase-uid', {
      alias: 'u',
      description: 'Firebase UID of the user to debug',
      type: 'string',
      demandOption: true,
    })
    .option('model', {
      alias: 'm',
      description: 'Specify a model to debug (PlaidAccount, Transaction, Liability, Business)',
      type: 'string',
    })
    .help()
    .alias('help', 'h')
    .argv;

  const { firebaseUid, model } = argv;

  await connectDB();
  console.log('MongoDB connected!');

  const user = await User.findOne({ authUid: firebaseUid });

  if (!user) {
    console.error('User not found.');
    process.exit(1);
  }

  console.log(`Starting decryption debug for user ${user._id} (Firebase UID: ${user.authUid})`);

  const deks = await getUserDek(user.authUid);
  if (!deks || deks.length === 0) {
    console.error('Could not retrieve DEK for user.');
    process.exit(1);
  }

  const errorLog = [];
  const decryptedLog = [];

  async function safeDecrypt(value, field, docId) {
    if (value === null || value === undefined || value === '') {
        decryptedLog.push({
            documentId: docId,
            field,
            value: value,
            status: 'empty'
        });
        return;
    }
    try {
      const decryptedValue = await decryptValue(value, deks);
      decryptedLog.push({
        documentId: docId,
        field,
        decryptedValue,
        status: 'decrypted'
      });
    } catch (error) {
        // Attempt to detect if it is a plaintext string
        if (typeof value === 'string' && value.length > 0 && !value.includes(' ')) {
            try {
                const decoded = Buffer.from(value, 'base64').toString('utf8');
                // If it decodes but is not valid JSON, it might be plaintext
                JSON.parse(decoded);
            } catch(e) {
                decryptedLog.push({
                    documentId: docId,
                    field,
                    value,
                    status: 'plaintext'
                });
                return;
            }
        }

      errorLog.push({
        documentId: docId,
        field,
        encryptedValue: value,
        error: error.message,
      });
    }
  }

  if (!model || model === 'Business') {
    console.log('\n--- Checking Business model ---');
    const businesses = await Business.find({ userId: user._id });
    for (const business of businesses) {
        await safeDecrypt(business.name, 'name', business._id);
    }
  }

  if (!model || model === 'PlaidAccount') {
    console.log('\n--- Checking PlaidAccount model ---');
    const plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
    for (const account of plaidAccounts) {
        await safeDecrypt(account.account_name, 'account_name', account._id);
    }
  }

  if (!model || model === 'Transaction') {
    console.log('\n--- Checking Transaction model ---');
    const plaidAccountIds = (await PlaidAccount.find({ owner_id: user._id })).map(a => a.plaid_account_id);
    const transactions = await Transaction.find({ plaidAccountId: { $in: plaidAccountIds } });
    for (const transaction of transactions) {
        await safeDecrypt(transaction.amount, 'amount', transaction._id);
        await safeDecrypt(transaction.description, 'description', transaction._id);
        await safeDecrypt(transaction.name, 'name', transaction._id);
        await safeDecrypt(transaction.notes, 'notes', transaction._id);
        await safeDecrypt(transaction.tags, 'tags', transaction._id);
        await safeDecrypt(transaction.fees, 'fees', transaction._id);
        await safeDecrypt(transaction.price, 'price', transaction._id);
        await safeDecrypt(transaction.quantity, 'quantity', transaction._id);
        await safeDecrypt(transaction.type, 'type', transaction._id);
        await safeDecrypt(transaction.subtype, 'subtype', transaction._id);
        await safeDecrypt(transaction.securityId, 'securityId', transaction._id);
        if (transaction.merchant) {
        await safeDecrypt(transaction.merchant.merchantName, 'merchant.merchantName', transaction._id);
        await safeDecrypt(transaction.merchant.name, 'merchant.name', transaction._id);
        }
    }
  }

  if (!model || model === 'Liability') {
    console.log('\n--- Checking Liability model ---');
    const plaidAccountIds = (await PlaidAccount.find({ owner_id: user._id })).map(a => a.plaid_account_id);
    const liabilities = await Liability.find({ accountId: { $in: plaidAccountIds } });

    for (const liability of liabilities) {
      await safeDecrypt(liability.liabilityType, 'liabilityType', liability._id);
      await safeDecrypt(liability.accountId, 'accountId', liability._id);
      await safeDecrypt(liability.accountNumber, 'accountNumber', liability._id);
      await safeDecrypt(liability.lastPaymentAmount, 'lastPaymentAmount', liability._id);
      await safeDecrypt(liability.lastPaymentDate, 'lastPaymentDate', liability._id);
      await safeDecrypt(liability.nextPaymentDueDate, 'nextPaymentDueDate', liability._id);
      await safeDecrypt(liability.minimumPaymentAmount, 'minimumPaymentAmount', liability._id);
      await safeDecrypt(liability.lastStatementBalance, 'lastStatementBalance', liability._id);
      await safeDecrypt(liability.lastStatementIssueDate, 'lastStatementIssueDate', liability._id);
      await safeDecrypt(liability.isOverdue, 'isOverdue', liability._id);
      if (liability.aprs) {
        for (const apr of liability.aprs) {
          await safeDecrypt(apr.aprPercentage, 'apr.aprPercentage', liability._id);
          await safeDecrypt(apr.aprType, 'apr.aprType', liability._id);
          await safeDecrypt(apr.balanceSubjectToApr, 'apr.balanceSubjectToApr', liability._id);
          await safeDecrypt(apr.interestChargeAmount, 'apr.interestChargeAmount', liability._id);
        }
      }
      await safeDecrypt(liability.loanTypeDescription, 'loanTypeDescription', liability._id);
      await safeDecrypt(liability.loanTerm, 'loanTerm', liability._id);
      await safeDecrypt(liability.maturityDate, 'maturityDate', liability._id);
      await safeDecrypt(liability.nextMonthlyPayment, 'nextMonthlyPayment', liability._id);
      await safeDecrypt(liability.originationDate, 'originationDate', liability._id);
      await safeDecrypt(liability.originationPrincipalAmount, 'originationPrincipalAmount', liability._id);
      await safeDecrypt(liability.pastDueAmount, 'pastDueAmount', liability._id);
      await safeDecrypt(liability.escrowBalance, 'escrowBalance', liability._id);
      await safeDecrypt(liability.hasPmi, 'hasPmi', liability._id);
      await safeDecrypt(liability.hasPrepaymentPenalty, 'hasPrepaymentPenalty', liability._id);
      if (liability.propertyAddress) {
        await safeDecrypt(liability.propertyAddress.city, 'propertyAddress.city', liability._id);
        await safeDecrypt(liability.propertyAddress.country, 'propertyAddress.country', liability._id);
        await safeDecrypt(liability.propertyAddress.postalCode, 'propertyAddress.postalCode', liability._id);
        await safeDecrypt(liability.propertyAddress.region, 'propertyAddress.region', liability._id);
        await safeDecrypt(liability.propertyAddress.street, 'propertyAddress.street', liability._id);
      }
      if (liability.interestRate) {
        await safeDecrypt(liability.interestRate.percentage, 'interestRate.percentage', liability._id);
        await safeDecrypt(liability.interestRate.type, 'interestRate.type', liability._id);
      }
      await safeDecrypt(liability.disbursementDates, 'disbursementDates', liability._id);
      await safeDecrypt(liability.expectedPayoffDate, 'expectedPayoffDate', liability._id);
      await safeDecrypt(liability.guarantor, 'guarantor', liability._id);
      await safeDecrypt(liability.interestRatePercentage, 'interestRatePercentage', liability._id);
      await safeDecrypt(liability.loanName, 'loanName', liability._id);
      if (liability.loanStatus) {
        await safeDecrypt(liability.loanStatus.endDate, 'loanStatus.endDate', liability._id);
        await safeDecrypt(liability.loanStatus.type, 'loanStatus.type', liability._id);
      }
      await safeDecrypt(liability.outstandingInterestAmount, 'outstandingInterestAmount', liability._id);
      await safeDecrypt(liability.paymentReferenceNumber, 'paymentReferenceNumber', liability._id);
      await safeDecrypt(liability.pslfStatus, 'pslfStatus', liability._id);
      if (liability.repaymentPlan) {
        await safeDecrypt(liability.repaymentPlan.type, 'repaymentPlan.type', liability._id);
        await safeDecrypt(liability.repaymentPlan.description, 'repaymentPlan.description', liability._id);
      }
      await safeDecrypt(liability.sequenceNumber, 'sequenceNumber', liability._id);
      if (liability.servicerAddress) {
        await safeDecrypt(liability.servicerAddress.city, 'servicerAddress.city', liability._id);
        await safeDecrypt(liability.servicerAddress.country, 'servicerAddress.country', liability._id);
        await safeDecrypt(liability.servicerAddress.postalCode, 'servicerAddress.postalCode', liability._id);
        await safeDecrypt(liability.servicerAddress.region, 'servicerAddress.region', liability._id);
        await safeDecrypt(liability.servicerAddress.street, 'servicerAddress.street', liability._id);
      }
      await safeDecrypt(liability.ytdInterestPaid, 'ytdInterestPaid', liability._id);
      await safeDecrypt(liability.ytdPrincipalPaid, 'ytdPrincipalPaid', liability._id);
    }
  }



  if (errorLog.length > 0) {
    console.error('Decryption errors found:');
    console.log(JSON.stringify(errorLog, null, 2));
  } else {
    console.log('No decryption errors found.');
  }

  if (decryptedLog.length > 0) {
    console.log('\nDecrypted and plaintext values:');
    console.log(JSON.stringify(decryptedLog, null, 2));
  }

  console.log('Decryption debug finished.');
  process.exit(0);
}

run();
