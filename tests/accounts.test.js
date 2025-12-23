import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../app.js";
import User from "../database/models/User.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Transaction from "../database/models/Transaction.js";
import Liability from "../database/models/Liability.js";
import jwt from "jsonwebtoken";

let mongoServer;
let mongoUri;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Accounts Controller", () => {
  describe("DELETE /api/account/:accountId", () => {
    let user;
    let token;
    let plaidAccount;

    beforeEach(async () => {
      // Create a user
      user = await User.create({
        authUid: "test-uid-123",
        email: "test@example.com",
        name: {
          firstName: "Test",
          lastName: "User",
        },
        plaidAccounts: [],
      });

      // Create a Plaid account associated with the user
      plaidAccount = await PlaidAccount.create({
        owner_id: user._id,
        itemId: "test-item-id",
        accessToken: "encrypted-access-token",
        owner_type: "user",
        plaid_account_id: "plaid-account-id-123",
        account_name: "encrypted-account-name",
        account_official_name: "encrypted-official-name",
        account_type: "depository",
        account_subtype: "checking",
        institution_name: "encrypted-institution-name",
        institution_id: "test-institution-id",
        currentBalance: "encrypted-current-balance",
        availableBalance: "encrypted-available-balance",
        currency: "USD",
        transactions: [],
        nextCursor: null,
        mask: "encrypted-mask",
        hashAccountName: "hashed-account-name",
        hashAccountInstitutionId: "hashed-institution-id",
        hashAccountMask: "hashed-mask",
      });

      user.plaidAccounts.push(plaidAccount._id);
      await user.save();

      // Create a transaction associated with the Plaid account
      await Transaction.create({
        accountId: plaidAccount._id,
        plaidTransactionId: "test-transaction-id",
        plaidAccountId: plaidAccount.plaid_account_id,
        transactionDate: new Date(),
        amount: "encrypted-amount",
        currency: "USD",
        notes: null,
        merchant: { merchantName: "encrypted-merchant-name" },
        description: null,
        transactionCode: null,
        tags: [],
        accountType: "encrypted-account-type",
      });

      // Create a liability associated with the Plaid account
      await Liability.create({
        liabilityType: "credit",
        accountId: plaidAccount.plaid_account_id,
        accountNumber: "encrypted-account-number",
        lastPaymentAmount: "encrypted-last-payment-amount",
        lastPaymentDate: new Date(),
        nextPaymentDueDate: new Date(),
        minimumPaymentAmount: "encrypted-minimum-payment-amount",
        lastStatementBalance: "encrypted-last-statement-balance",
        lastStatementIssueDate: new Date(),
        isOverdue: false,
      });

      token = jwt.sign({ uid: user.authUid }, process.env.SECRET);
    });

    afterEach(async () => {
      await User.deleteMany({});
      await PlaidAccount.deleteMany({});
      await Transaction.deleteMany({});
      await Liability.deleteMany({});
    });

    it("should delete the Plaid account and its associated data", async () => {
      const res = await request(app)
        .delete(`/api/account/${plaidAccount._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toBe("Account deleted successfully.");

      // Verify that the Plaid account is deleted
      const deletedAccount = await PlaidAccount.findById(plaidAccount._id);
      expect(deletedAccount).toBeNull();

      // Verify that the transactions are deleted
      const deletedTransactions = await Transaction.find({ accountId: plaidAccount._id });
      expect(deletedTransactions.length).toEqual(0);

      // Verify that the liabilities are deleted
      const deletedLiabilities = await Liability.find({ accountId: plaidAccount.plaid_account_id });
      expect(deletedLiabilities.length).toEqual(0);

      // Verify that the account is removed from the user's plaidAccounts array
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.plaidAccounts).not.toContain(plaidAccount._id);
    });

    it("should return 404 if the account is not found", async () => {
      const nonExistentAccountId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/account/${nonExistentAccountId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toBe("Account not found or user does not have permission to delete it.");
    });

    it("should return 401 if no token is provided", async () => {
      const res = await request(app)
        .delete(`/api/account/${plaidAccount._id}`);

      expect(res.statusCode).toEqual(401);
    });

    it("should return 403 if the user does not own the account", async () => {
      const otherUser = await User.create({
        authUid: "other-uid",
        email: "other@example.com",
        name: { firstName: "Other", lastName: "User" },
      });
      const otherUserToken = jwt.sign({ uid: otherUser.authUid }, process.env.SECRET);

      const res = await request(app)
        .delete(`/api/account/${plaidAccount._id}`)
        .set("Authorization", `Bearer ${otherUserToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toBe("Account not found or user does not have permission to delete it.");
    });
  });
});
