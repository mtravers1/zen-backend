### User Model Schema (`database/models/User.js`)

The `User` model represents individual users and their profiles.

```javascript
const userSchema = new Schema({
  role: {
    type: String,
    required: true,
    enum: ["business_owner", "individual"],
  },
  email: [emailSchema], // Array of embedded email schemas
  emailHash: {
    type: String,
    required: true,
    unique: true,
  },
  authUid: {
    type: String,
    required: true,
    unique: true,
  },
  method: {
    type: String,
    required: true,
    enum: ["google", "apple", "email"],
    default: "email",
  },
  name: nameSchema, // Embedded name schema
  phones: [phoneNumbersSchema], // Array of embedded phone number schemas
  deleted: {
    type: Boolean,
    default: false,
  },
  plaidAccounts: [
    {
      type: Schema.Types.ObjectId,
      ref: "PlaidAccount",
    },
  ],
  numAccounts: {
    type: Number,
  },
  profilePhotoUrl: {
    type: String,
  },
  dateOfBirth: {
    type: Date,
  },
  annualIncome: {
    type: String,
  },
  maritalStatus: {
    type: String,
    enum: [
      "single",
      "married",
      "divorced",
      "widowed",
      "domestic_partner",
      "other",
    ],
  },
  occupation: {
    type: String,
  },
  encryptedSSN: {
    type: String,
  },
  dependents: {
    type: Number,
  },
  address: [addressSchema], // Array of embedded address schemas
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
  },
  lastLoginAt: {
    type: Date,
  },
  id_uuid: {
    type: String,
  },
  account_type: {
    type: String,
  },
  subscription_metadata: {
    type: Object,
    default: null,
  },
});
```

#### Nested Schemas for User Model:

```javascript
const numAccountsSchema = new Schema({
  banking: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  investment: { type: Number, default: 0 },
  loan: { type: Number, default: 0 },
  other: { type: Number, default: 0 },
});

const emailSchema = new Schema({
  email: { type: String, required: true, trim: true, toLowerCase: true, unique: true },
  emailType: { type: String, required: true, enum: ["personal", "work"] },
  isPrimary: { type: Boolean, default: false },
});

const nameSchema = new Schema({
  prefix: { type: String },
  firstName: { type: String },
  middleName: { type: String },
  lastName: { type: String },
  suffix: { type: String },
});

const phoneNumbersSchema = new Schema({
  phone: { type: String },
  phoneType: { type: String },
});

const addressSchema = new Schema({
  street: { type: String },
  city: { type: String },
  state: { type: String },
  postalCode: { type: String },
  country: { type: String },
  type: { type: String },
});
```

### Business Model Schema (`database/models/Businesses.js`)

The `Business` model represents business accounts and their associated information.

```javascript
const businessSchema = new Schema({
  userId: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],
  name: {
    type: String,
    required: true,
  },
  legalName: {
    type: String,
  },
  encryptedEin: {
    type: String,
  },
  businessLogo: String,
  numAccounts: Number,
  businessDesc: String,
  businessDescription: {
    type: String,
    default: null,
  },
  businessCode: String,
  entityType: String,
  businessType: {
    type: String,
    default: null,
  },
  addresses: [addressSchema], // Array of embedded address schemas
  website: String,
  phoneNumbers: [phoneNumberSchema], // Array of embedded phone number schemas
  industryDesc: String,
  plaidAccountIds: [{ type: Schema.Types.ObjectId, ref: "PlaidAccount" }],
  documentIds: [{ type: Schema.Types.ObjectId, ref: "Document" }],
  goalIds: [{ type: Schema.Types.ObjectId, ref: "Goal" }],
  subsidiaries: [String],
  businessLocations: [addressSchema], // Array of embedded address schemas
  accountingInfo: Schema.Types.Mixed,
  fiscalYearStart: String,
  taxInformation: Schema.Types.Mixed,
  payrollDetails: Schema.Types.Mixed,
  formationDate: Date,
  businessHours: [String],
  ownership: businessOwnershipSchema, // Embedded business ownership schema
  businessOwners: [String],
  businessOwnersDetails: [businessOwnersDetailsSchema], // Array of embedded business owners details schemas
  timezone: String,
  color: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date,
});
```

#### Nested Schemas for Business Model:

```javascript
const addressSchema = new Schema({
  name: { type: String, default: null },
  street: { type: String, default: null },
  city: { type: String, default: null },
  state: { type: String, default: null },
  postalCode: { type: String, default: null },
  country: { type: String, default: null },
  addressLine1: { type: String, default: null },
  addressLine2: { type: String, default: null },
  type: { type: String, default: null },
});

const phoneNumberSchema = new Schema({
  phone: { type: String, default: null },
  phoneType: { type: String, default: null },
});

const businessOwnershipSchema = new Schema({
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  percentage: Number,
});

const businessOwnersDetailsSchema = new Schema([
  {
    name: { type: String, default: null },
    percentOwned: { type: String, default: null },
    email: { type: String, default: null },
    position: { type: String, default: null },
  },
]);
```

### PlaidAccount Model Schema (`database/models/PlaidAccount.js`)

The `PlaidAccount` model stores information about financial accounts linked via Plaid.

```javascript
const plaidAccountSchema = new Schema({
  owner_id: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  itemId: {
    type: String,
    required: true,
  },
  
  owner_type: {
    type: String,
    enum: ["business_owner", "individual"],
    required: true,
  },
  plaid_account_id: {
    type: String,
    required: true,
  },
  account_name: {
    type: String,
    required: true,
  },
  account_official_name: {
    type: String,
  },
  account_type: {
    type: String,
    required: true,
  },
  account_subtype: {
    type: String,
    required: true,
  },
  institution_name: {
    type: String,
  },
  institution_id: {
    type: String,
    required: true,
  },
  hashAccountInstitutionId: {
    type: String,
    required: true,
  },
  hashAccountName: {
    type: String,
    required: true,
  },
  hashAccountMask: {
    type: String,
    required: true,
  },
  image_url: {
    type: String,
  },
  currentBalance: {
    type: String,
  },
  availableBalance: {
    type: String,
  },
  currency: {
    type: String,
    required: true,
  },
  mask: {
    type: String,
  },
  transactions: [
    {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
    },
  ],
  nextCursor: {
    type: String,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
  },
});
```