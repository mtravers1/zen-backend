import mongoose from 'mongoose';
import assert from 'assert';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import User from '../database/models/User.js';
import Liability from '../database/models/Liability.js';
import accountsService from '../services/accounts.service.js';
import { hashEmail } from '../database/encryption.js';
import { createSafeEncrypt } from '../lib/encryptionHelper.js';


async function createTestUser(uid) {
  const email = `${uid}@test.com`;
  const user = new User({
    email: [{ email: email, emailType: 'personal' }],
    authUid: uid,
    emailHash: hashEmail(email),
    role: 'individual',
    plaidAccounts: [],
  });
  await user.save();
  return user;
}

async function runTest() {
  let mongod;
  let user;

  try {
    // Setup MongoMemoryServer
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('MongoDB Memory Server started and connected.');

    const testUid = `test-uid-${Date.now()}`;
    user = await createTestUser(testUid);
    
    const fakeDek = crypto.randomBytes(32);
    const safeEncrypt = createSafeEncrypt(user.authUid, [fakeDek]);

    // --- Test Data --- 
    const testMaturityDate = '2030-01-01';
    const testInterestRatePercentage = '5.25'; // Schema expects a string
    const testLoanStatusType = 'active';

    // 1. Create a LEGACY (fully encrypted) Liability
    console.log('Creating legacy (encrypted) liability...');
    const encryptedMaturityDate = await safeEncrypt(testMaturityDate);
    const encryptedInterestRatePercentage = await safeEncrypt(testInterestRatePercentage);
    const legacyLoanStatus = { 
      type: await safeEncrypt(testLoanStatusType)
    };

    const legacyLiability = new Liability({
      accountId: 'legacy_acc_id_1',
      liabilityType: 'student', // Use valid enum
      maturityDate: encryptedMaturityDate,
      interestRatePercentage: encryptedInterestRatePercentage,
      loanStatus: legacyLoanStatus, // Pass object with encrypted properties
    });
    await legacyLiability.save();
    console.log('Legacy liability created.');

    // 2. Create a NEW (partially plaintext) Liability
    console.log('Creating new (partially plaintext) liability...');
    const newLiability = new Liability({
      accountId: 'new_acc_id_1',
      liabilityType: 'student', // Use valid enum
      maturityDate: testMaturityDate, // Plaintext
      interestRatePercentage: testInterestRatePercentage, // Plaintext
      loanStatus: { type: testLoanStatusType }, // Plaintext object
    });
    await newLiability.save();
    console.log('New liability created.');

    // 3. Fetch and process both liabilities using the service function
    console.log('Fetching and processing liabilities...');
    const fetchedLegacyLiabilities = await Liability.find({ accountId: 'legacy_acc_id_1' }).lean();
    const fetchedNewLiabilities = await Liability.find({ accountId: 'new_acc_id_1' }).lean();

    const processedLegacyLiability = await accountsService.getDecryptedLiabilitiesLoan(fetchedLegacyLiabilities, [fakeDek], user.authUid);
    const processedNewLiability = await accountsService.getDecryptedLiabilitiesLoan(fetchedNewLiabilities, [fakeDek], user.authUid);
    console.log('Liabilities processed.');

    // 4. Assertions
    console.log('Running assertions...');
    assert.strictEqual(processedLegacyLiability.maturityDate, testMaturityDate, 'Legacy maturityDate should be decrypted correctly.');
    assert.strictEqual(processedLegacyLiability.interestRatePercentage, testInterestRatePercentage, 'Legacy interestRatePercentage should be decrypted correctly.');
    assert.deepStrictEqual(processedLegacyLiability.loanStatus.type, testLoanStatusType, 'Legacy loanStatus.type should be decrypted correctly.');

    assert.strictEqual(processedNewLiability.maturityDate, testMaturityDate, 'New maturityDate should be retrieved correctly as plaintext.');
    assert.strictEqual(processedNewLiability.interestRatePercentage, testInterestRatePercentage, 'New interestRatePercentage should be retrieved correctly as plaintext.');
    assert.deepStrictEqual(processedNewLiability.loanStatus.type, testLoanStatusType, 'New loanStatus.type should be retrieved correctly as plaintext.');

    console.log('All tests passed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    // Teardown
    if (user) {
      try {
        await User.deleteOne({ _id: user._id });
        await Liability.deleteMany({ accountId: { $in: ['legacy_acc_id_1', 'new_acc_id_1'] } });
        console.log('Test user and liabilities cleaned up.');
      } catch(cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
    if (mongod) {
      await mongod.stop();
      console.log('MongoDB Memory Server stopped.');
    }
  }
}

runTest();
