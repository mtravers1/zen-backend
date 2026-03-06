import { Schema, model } from "mongoose";

const firmSettingsSchema = new Schema({
  firmId: {
    type: Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    unique: true,
    index: true,
  },
  // Firm branding
  logo: { type: String },
  primaryColor: { type: String, default: "#006847" },
  accentColor: { type: String },
  // Contact
  email: { type: String },
  phone: { type: String },
  website: { type: String },
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
  },
  // Invoice settings
  invoicePrefix: { type: String, default: "INV" },
  invoiceStartNumber: { type: Number, default: 1000 },
  invoiceFooterNote: { type: String },
  defaultPaymentTerms: { type: String, default: "net30" },
  defaultTaxRate: { type: Number, default: 0 },
  currency: { type: String, default: "USD" },
  // Proposal settings
  proposalPrefix: { type: String, default: "PROP" },
  proposalStartNumber: { type: Number, default: 1000 },
  defaultProposalExpiry: { type: Number, default: 30 }, // days
  // Client portal settings
  clientPortalEnabled: { type: Boolean, default: false },
  clientPortalSubdomain: { type: String },
  clientPortalCustomDomain: { type: String },
  // Notification settings
  notifications: {
    emailOnNewLead: { type: Boolean, default: true },
    emailOnPayment: { type: Boolean, default: true },
    emailOnInvoiceOverdue: { type: Boolean, default: true },
    emailOnTaskDue: { type: Boolean, default: true },
  },
  // Integrations
  integrations: {
    stripe: {
      connected: { type: Boolean, default: false },
      accountId: String,
      publishableKey: String,
    },
    google: {
      connected: { type: Boolean, default: false },
      calendarSync: { type: Boolean, default: false },
    },
    quickbooks: {
      connected: { type: Boolean, default: false },
      realmId: String,
    },
    salesforce: {
      connected: { type: Boolean, default: false },
    },
  },
  // Team settings
  defaultWorkingHours: { type: Number, default: 8 },
  timezone: { type: String, default: "America/New_York" },
  // Signup
  clientSignupEnabled: { type: Boolean, default: false },
  clientSignupFields: [{ type: String }],
  // Site builder
  siteBuilderEnabled: { type: Boolean, default: false },
  siteBuilderConfig: { type: Schema.Types.Mixed },
}, {
  timestamps: true,
});

const FirmSettings = model("FirmSettings", firmSettingsSchema);
export default FirmSettings;
