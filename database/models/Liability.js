import { model, Schema } from "mongoose";

const addressSchema = new Schema({
  city: { type: String, default: null },
  country: { type: String, default: null },
  postalCode: { type: String, default: null },
  region: { type: String, default: null },
  street: { type: String, default: null },
});

const interestRateSchema = new Schema({
  percentage: { type: Number, default: null },
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
  lastPaymentAmount: { type: Number, default: null },
  lastPaymentDate: { type: String, default: null },
  nextPaymentDueDate: { type: String, default: null },
  minimumPaymentAmount: { type: Number, default: null },
  lastStatementBalance: { type: Number, default: null },
  lastStatementIssueDate: { type: String, default: null },
  isOverdue: { type: Boolean, default: null },

  // Credit-specific fields
  aprs: [
    {
      aprPercentage: { type: Number, default: null },
      aprType: { type: String, default: null },
      balanceSubjectToApr: { type: Number, default: null },
      interestChargeAmount: { type: Number, default: null },
    },
  ],

  // Mortgage-specific fields
  loanTypeDescription: { type: String, default: null },
  loanTerm: { type: String, default: null },
  maturityDate: { type: String, default: null },
  nextMonthlyPayment: { type: Number, default: null },
  originationDate: { type: String, default: null },
  originationPrincipalAmount: { type: Number, default: null },
  pastDueAmount: { type: Number, default: null },
  escrowBalance: { type: Number, default: null },
  hasPmi: { type: Boolean, default: null },
  hasPrepaymentPenalty: { type: Boolean, default: null },
  propertyAddress: addressSchema,
  interestRate: interestRateSchema,

  // Student-specific fields
  disbursementDates: [{ type: String, default: null }],
  expectedPayoffDate: { type: String, default: null },
  guarantor: { type: String, default: null },
  interestRatePercentage: { type: Number, default: null },
  loanName: { type: String, default: null },
  loanStatus: loanStatusSchema,
  outstandingInterestAmount: { type: Number, default: null },
  paymentReferenceNumber: { type: String, default: null },
  pslfStatus: { type: Schema.Types.Mixed, default: null },
  repaymentPlan: repaymentPlanSchema,
  sequenceNumber: { type: String, default: null },
  servicerAddress: addressSchema,

  // YTD (Year-to-Date) fields
  ytdInterestPaid: { type: Number, default: null },
  ytdPrincipalPaid: { type: Number, default: null },
});

const Liability = model("Liability", liabilitySchema);

export default Liability;
