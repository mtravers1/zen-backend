import permissions from "../config/permissions.js";
import Business from "../database/models/Businesses.js";
import User from "../database/models/User.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Files from "../database/models/Files.js";
import Trips from "../database/models/Trips.js";
import upgradeResponseService from "./upgradeResponse.service.js";

const checkUserRole = async (user) => {
  if (!user.account_type) {
    user.account_type = "Free";
    await User.findByIdAndUpdate(
      user.id,
      { account_type: "Free" },
      { new: true }
    );
  }
  return user.account_type;
};

// Usage counting functions
const countUserInstitutions = async (userId) => {
  try {
    const institutions = await PlaidAccount.distinct("institution_id", {
      owner_id: userId,
    });
    return institutions.length;
  } catch (error) {
    console.error("Error counting institutions:", error);
    return 0;
  }
};

const countUserTrips = async (userId, month = null, year = null) => {
  try {
    let query = { user: userId };

    if (month !== null && year !== null) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    return await Trips.countDocuments(query);
  } catch (error) {
    console.error("Error counting trips:", error);
    return 0;
  }
};

const calculateStorageUsage = async (userId) => {
  try {
    // DEVELOPMENT: Always return limit exceeded in development environment
    if (process.env.NODE_ENV === "development") {
      return 999; // Always exceeds any plan limit in development
    }

    // Note: Files schema doesn't have file size field
    // This is a placeholder - would need to implement file size tracking
    const fileCount = await Files.countDocuments({ userId: userId });
    // Assuming average file size of 0.1MB for now
    return (fileCount * 0.1) / 1024; // Convert to GB
  } catch (error) {
    console.error("Error calculating storage usage:", error);
    return 0;
  }
};

const countUserBusinesses = async (userId) => {
  try {
    return await Business.countDocuments({ userId: userId });
  } catch (error) {
    console.error("Error counting businesses:", error);
    return 0;
  }
};

// Validation functions
const validateCreateTrips = async (createTripsMax, userId) => {
  if (createTripsMax === -1) return true; // Unlimited

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const tripsThisMonth = await countUserTrips(
    userId,
    currentMonth,
    currentYear
  );

  return tripsThisMonth < createTripsMax;
};

const validateBusinesses = async (businessesMax, userId) => {
  if (businessesMax === -1) return true; // Unlimited

  const currentBusinesses = await countUserBusinesses(userId);
  return currentBusinesses < businessesMax;
};

const validateStorage = async (storageMaxGb, userId) => {
  if (storageMaxGb === -1) return true; // Unlimited

  const currentUsage = await calculateStorageUsage(userId);
  return currentUsage < storageMaxGb;
};

const validateAccounts = async (accountsMax, userId) => {
  if (accountsMax === -1) return true; // Unlimited

  const currentInstitutions = await countUserInstitutions(userId);
  return currentInstitutions < accountsMax;
};

// Permission validation functions mapping
const permissionFunctions = {
  create_trips_max: validateCreateTrips,
  businesses_max: validateBusinesses,
  storage_max_gb: validateStorage,
  accounts_max: validateAccounts,
};

const checkPermission = async (email, permissionKey) => {
  const user = await User.findOne({ "email.email": email.toLowerCase() });
  const rolePermission = await checkUserRole(user);
  const rolePermissions = permissions[rolePermission];

  if (rolePermissions && permissionKey in rolePermissions) {
    const permissionValue = rolePermissions[permissionKey];
    const validationFunction = permissionFunctions[permissionKey];
    if (validationFunction) {
      return await validationFunction(permissionValue, user._id.toString());
    }
  }

  return false;
};

// Check if user can add an account (considering existing institutions)
const canAddAccount = async (uid, institutionId) => {
  try {
    const user = await User.findOne({ authUid: uid });
    if (!user) {
      return upgradeResponseService.genericError("User not found");
    }

    const rolePermission = await checkUserRole(user);
    const rolePermissions = permissions[rolePermission];

    if (!rolePermissions) {
      return upgradeResponseService.genericError("Plan not found");
    }

    const userId = user._id.toString();

    // Check if user already has this institution
    const existingInstitution = await PlaidAccount.findOne({
      owner_id: userId,
      institution_id: institutionId,
    });

    if (existingInstitution) {
      // User already has this institution, allow additional accounts
      return upgradeResponseService.actionAllowed();
    }

    // This is a new institution, check limits
    const currentInstitutions = await countUserInstitutions(userId);
    const canAdd = await validateAccounts(rolePermissions.accounts_max, userId);

    if (canAdd) {
      return upgradeResponseService.actionAllowed();
    } else {
      return upgradeResponseService.institutionLimitExceeded(
        user,
        currentInstitutions,
        rolePermissions.accounts_max
      );
    }
  } catch (error) {
    console.error("Error checking account permission:", error);
    return upgradeResponseService.genericError("Permission check failed");
  }
};

// Additional helper functions for upgrade system
const canPerformAction = async (uid, action) => {
  try {
    const user = await User.findOne({ authUid: uid });
    if (!user) {
      return upgradeResponseService.genericError("User not found");
    }

    const rolePermission = await checkUserRole(user);
    const rolePermissions = permissions[rolePermission];

    if (!rolePermissions) {
      return upgradeResponseService.genericError("Plan not found");
    }

    const userId = user._id.toString();

    switch (action) {
      case "add_institution":
        const currentInstitutions = await countUserInstitutions(userId);
        const canAdd = await validateAccounts(
          rolePermissions.accounts_max,
          userId
        );

        if (canAdd) {
          return upgradeResponseService.actionAllowed();
        } else {
          return upgradeResponseService.institutionLimitExceeded(
            user,
            currentInstitutions,
            rolePermissions.accounts_max
          );
        }

      case "create_trip":
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const currentTrips = await countUserTrips(
          userId,
          currentMonth,
          currentYear
        );
        const canCreateTrip = await validateCreateTrips(
          rolePermissions.create_trips_max,
          userId
        );

        if (canCreateTrip) {
          return upgradeResponseService.actionAllowed();
        } else {
          return upgradeResponseService.tripLimitExceeded(
            user,
            currentTrips,
            rolePermissions.create_trips_max
          );
        }

      case "upload_file":
        const currentStorage = await calculateStorageUsage(userId);
        const canUpload = await validateStorage(
          rolePermissions.storage_max_gb,
          userId
        );

        if (canUpload) {
          return upgradeResponseService.actionAllowed();
        } else {
          return upgradeResponseService.storageLimitExceeded(
            user,
            currentStorage,
            rolePermissions.storage_max_gb
          );
        }

      case "create_business":
        const currentBusinesses = await countUserBusinesses(userId);
        const canCreateBusiness = await validateBusinesses(
          rolePermissions.businesses_max,
          userId
        );

        if (canCreateBusiness) {
          return upgradeResponseService.actionAllowed();
        } else {
          return upgradeResponseService.businessLimitExceeded(
            user,
            currentBusinesses,
            rolePermissions.businesses_max
          );
        }

      case "business_owner_signup":
        // Business owner signup requires upgrade from Free plan
        if (user.account_type === "Free") {
          return upgradeResponseService.businessOwnerUpgradeRequired(user);
        } else {
          return upgradeResponseService.actionAllowed();
        }

      default:
        return upgradeResponseService.genericError("Unknown action");
    }
  } catch (error) {
    console.error("Error checking account permission:", error);
    return upgradeResponseService.genericError("Permission check failed");
  }
};

const getCurrentUsage = async (userId) => {
  try {
    return {
      institutions: await countUserInstitutions(userId),
      businesses: await countUserBusinesses(userId),
      storage_gb: await calculateStorageUsage(userId),
      trips_this_month: await countUserTrips(
        userId,
        new Date().getMonth() + 1,
        new Date().getFullYear()
      ),
    };
  } catch (error) {
    console.error("Error getting current usage:", error);
    return {
      institutions: 0,
      businesses: 0,
      storage_gb: 0,
      trips_this_month: 0,
    };
  }
};

const permissionService = {
  checkPermission,
  canPerformAction,
  canAddAccount,
  getCurrentUsage,
  countUserInstitutions,
  countUserTrips,
  calculateStorageUsage,
  countUserBusinesses,
};

export default permissionService;
