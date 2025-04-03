import { model, Schema } from "mongoose";

const addressSchema = new Schema({
  city: { type: Buffer, default: null },
  country: { type: Buffer, default: null },
  postalCode: { type: Buffer, default: null },
  region: { type: Buffer, default: null },
  street: { type: Buffer, default: null },
});

const interestRateSchema = new Schema({
  percentage: { type: Buffer, default: null },
  type: { type: Buffer, default: null },
});

const loanStatusSchema = new Schema({
  endDate: { type: Buffer, default: null },
  type: { type: Buffer, default: null },
});

const repaymentPlanSchema = new Schema({
  description: { type: Buffer, default: null },
  type: { type: Buffer, default: null },
});

const liabilitySchema = new Schema({
  liabilityType: {
    type: String,
    enum: ["credit", "mortgage", "student"],
    required: true,
  },
  accountId: { type: Buffer, default: null },
  accountNumber: { type: Buffer, default: null },
  lastPaymentAmount: { type: Buffer, default: null },
  lastPaymentDate: { type: Buffer, default: null },
  nextPaymentDueDate: { type: Buffer, default: null },
  minimumPaymentAmount: { type: Buffer, default: null },
  lastStatementBalance: { type: Buffer, default: null },
  lastStatementIssueDate: { type: Buffer, default: null },
  isOverdue: { type: Buffer, default: null },

  aprs: [
    {
      aprPercentage: { type: Buffer, default: null },
      aprType: { type: Buffer, default: null },
      balanceSubjectToApr: { type: Buffer, default: null },
      interestChargeAmount: { type: Buffer, default: null },
    },
  ],

  loanTypeDescription: { type: Buffer, default: null },
  loanTerm: { type: Buffer, default: null },
  maturityDate: { type: Buffer, default: null },
  nextMonthlyPayment: { type: Buffer, default: null },
  originationDate: { type: Buffer, default: null },
  originationPrincipalAmount: { type: Buffer, default: null },
  pastDueAmount: { type: Buffer, default: null },
  escrowBalance: { type: Buffer, default: null },
  hasPmi: { type: Buffer, default: null },
  hasPrepaymentPenalty: { type: Buffer, default: null },
  propertyAddress: addressSchema,
  interestRate: interestRateSchema,

  disbursementDates: [{ type: Buffer, default: null }],
  expectedPayoffDate: { type: Buffer, default: null },
  guarantor: { type: Buffer, default: null },
  interestRatePercentage: { type: Buffer, default: null },
  loanName: { type: Buffer, default: null },
  loanStatus: loanStatusSchema,
  outstandingInterestAmount: { type: Buffer, default: null },
  paymentReferenceNumber: { type: Buffer, default: null },
  pslfStatus: { type: Buffer, default: null },
  repaymentPlan: repaymentPlanSchema,
  sequenceNumber: { type: Buffer, default: null },
  servicerAddress: addressSchema,

  ytdInterestPaid: { type: Buffer, default: null },
  ytdPrincipalPaid: { type: Buffer, default: null },
});

const Liability = model("Liability", liabilitySchema);

export default Liability;
