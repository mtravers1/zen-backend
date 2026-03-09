/**
 * Staff role permission middleware.
 *
 * Role hierarchy (lowest → highest):
 *   client < executive_assistant < account_manager < relationship_manager
 *   < executive_manager < director < super_admin
 *
 * Usage:
 *   router.get("/protected", checkStaffRole("account_manager"), handler);
 *   router.delete("/admin-only", checkStaffRole("director"), handler);
 */

import User from "../database/models/User.js";
import StaffMember from "../database/models/StaffMember.js";

const ROLE_HIERARCHY = [
  "client",
  "executive_assistant",
  "account_manager",
  "relationship_manager",
  "executive_manager",
  "director",
  "super_admin",
];

/**
 * Returns the numeric level of a given role (higher = more permissions).
 * Returns -1 for unknown roles.
 */
export function roleLevel(role) {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Returns true if `userRole` is >= `requiredRole` in the hierarchy.
 */
export function hasMinimumRole(userRole, requiredRole) {
  return roleLevel(userRole) >= roleLevel(requiredRole);
}

/**
 * Express middleware factory.
 * Requires the authenticated user to have at least `minimumRole`.
 *
 * Resolves the role from:
 *   1. StaffMember collection (web-dashboard staff)
 *   2. User.staffRole field (mobile-app users who also have a dashboard role)
 *
 * Attaches `req.staffRole` for downstream use.
 */
export function checkStaffRole(minimumRole = "executive_assistant") {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      const uid = req.user?.uid;

      if (!userId && !uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Fast path: firebaseAuth already resolved the role from the token
      let role = req.user?.staffRole ?? null;

      if (!role) {
        // Slow path: look up StaffMember by userId
        if (userId) {
          const staff = await StaffMember.findById(userId).lean();
          if (staff && !staff.deleted) {
            role = staff.role;
          }
        }

        // Final fallback: User.staffRole
        if (!role) {
          const query = userId ? { _id: userId } : { authUid: uid };
          const user = await User.findOne(query).lean();
          if (user) {
            role = user.staffRole;
          }
        }
      }

      if (!role) {
        return res.status(403).json({ error: "No dashboard role assigned" });
      }

      if (!hasMinimumRole(role, minimumRole)) {
        return res.status(403).json({
          error: `Insufficient permissions. Required: ${minimumRole}, current: ${role}`,
        });
      }

      req.staffRole = role;
      return next();
    } catch (error) {
      console.error("[CHECK STAFF ROLE] Error:", error);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}

export default checkStaffRole;
