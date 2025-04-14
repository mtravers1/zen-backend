import { model, Schema } from "mongoose";

const addressSchema = new Schema({
  city: { type: String, default: null },
  country: { type: String, default: null },
  postalCode: { type: String, default: null },
  region: { type: String, default: null },
  street: { type: String, default: null },
});

const interestRateSchema = new Schema({
  percentage: { type: String, default: null },
  type: { type: String, default: null },
});

const loanStatusSchema = new Schema({
  endDate: { type: String, default: null },
  type: { type: String, default: null },
});

const repaymentPlanSchema = new Schema({
  description: { type: String, default: null },
  type: { type: String, default: null },
});

const liabilitySchema = new Schema({
  liabilityType: {
    type: String,
    enum: ["credit", "mortgage", "student"],
    required: true,
  },
  accountId: { type: String, default: null },
  accountNumber: { type: String, default: null },
  lastPaymentAmount: { type: String, default: null },
  lastPaymentDate: { type: String, default: null },
  nextPaymentDueDate: { type: String, default: null },
  minimumPaymentAmount: { type: String, default: null },
  lastStatementBalance: { type: String, default: null },
  lastStatementIssueDate: { type: String, default: null },
  isOverdue: { type: String, default: null },

  aprs: [
    {
      aprPercentage: { type: String, default: null },
      aprType: { type: String, default: null },
      balanceSubjectToApr: { type: String, default: null },
      interestChargeAmount: { type: String, default: null },
    },
  ],

  loanTypeDescription: { type: String, default: null },
  loanTerm: { type: String, default: null },
  maturityDate: { type: String, default: null },
  nextMonthlyPayment: { type: String, default: null },
  originationDate: { type: String, default: null },
  originationPrincipalAmount: { type: String, default: null },
  pastDueAmount: { type: String, default: null },
  escrowBalance: { type: String, default: null },
  hasPmi: { type: String, default: null },
  hasPrepaymentPenalty: { type: String, default: null },
  propertyAddress: addressSchema,
  interestRate: interestRateSchema,

  disbursementDates: [{ type: String, default: null }],
  expectedPayoffDate: { type: String, default: null },
  guarantor: { type: String, default: null },
  interestRatePercentage: { type: String, default: null },
  loanName: { type: String, default: null },
  loanStatus: loanStatusSchema,
  outstandingInterestAmount: { type: String, default: null },
  paymentReferenceNumber: { type: String, default: null },
  pslfStatus: { type: String, default: null },
  repaymentPlan: repaymentPlanSchema,
  sequenceNumber: { type: String, default: null },
  servicerAddress: addressSchema,

  ytdInterestPaid: { type: String, default: null },
  ytdPrincipalPaid: { type: String, default: null },
});

const Liability = model("Liability", liabilitySchema);

export default Liability;
