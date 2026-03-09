/**
 * StaffMember model represents web-dashboard users (firm staff).
 * These are distinct from the mobile-app User model (business_owner / individual).
 * A staff member logs in via the web dashboard and manages client accounts.
 */
import { Schema, model } from "mongoose";

// Matches the frontend AppRole type in permissions.ts
const STAFF_ROLES = [
  "client",
  "executive_assistant",
  "account_manager",
  "relationship_manager",
  "executive_manager",
  "director",
  "super_admin",
];

const staffMemberSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    // bcrypt hash of password – populated only for email/password auth
    passwordHash: { type: String },
    // Firebase UID – populated when using Firebase auth
    authUid: { type: String, unique: true, sparse: true },
    role: {
      type: String,
      enum: STAFF_ROLES,
      default: "account_manager",
    },
    profilePhotoUrl: { type: String },
    phone: { type: String, trim: true },
    title: { type: String, trim: true },            // job title (e.g. "Senior Accountant")
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

staffMemberSchema.index({ email: 1 });
staffMemberSchema.index({ role: 1 });

/** Virtual: full name */
staffMemberSchema.virtual("name").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

/** Virtual: initials */
staffMemberSchema.virtual("initials").get(function () {
  return `${this.firstName[0] || ""}${this.lastName[0] || ""}`.toUpperCase();
});

const StaffMember = model("StaffMember", staffMemberSchema);
export { STAFF_ROLES };
export default StaffMember;
