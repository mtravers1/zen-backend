import permissions from "../config/permissions.js";
import Business from "../database/models/Businesses.js";
import User from "../database/models/User.js";

const checkUserRole = async (user) => {
  if (!user.rolePermission) {
    user.rolePermission = "Free";
    await User.findByIdAndUpdate(
      user.id,
      { rolePermission: "Free" },
      { new: true }
    );
  }
  return user.rolePermission;
};

// Functions to validate permissions (TODO: fill with validations)
// TODO: Check the validation of the 'create_trips_max' permission
// TODO: Check the validation of the 'businesses_max' permission
// TODO: Check the validation of the 'storage_max_gb' permission
// You can keep adding more functions according to the JSON
const validateCreateTrips = (createTripsMax) => {
  // TODO: Verify the validation of the 'create_trips_max' permission
  return createTripsMax > 0;
};

const validateBusinesses = async (businessesMax, userId) => {
  // TODO: Verify the validation of the 'businesses_max' permission
  const businesses = await Business.find({ userId });
  return businessesMax > businesses.length;
};

const validateStorage = (storageMaxGb) => {
  // TODO: Verify the validation of the 'storage_max_gb' permission
  return storageMaxGb > 0;
};

// You can keep adding more functions according to the JSON
const permissionFunctions = {
  create_trips_max: validateCreateTrips,
  businesses_max: validateBusinesses,
  storage_max_gb: validateStorage,
};

const checkPermission = async (email, permissionKey) => {
  const user = await User.findOne({ "email.email": email.toLowerCase() });
  const rolePermission = await checkUserRole(user);
  const rolePermissions = permissions[rolePermission];

  if (rolePermissions && permissionKey in rolePermissions) {
    const permissionValue = rolePermissions[permissionKey];
    const validationFunction = permissionFunctions[permissionKey];
    if (validationFunction) {
      return validationFunction(permissionValue, user._id.toString());
    }
  }

  return false;
};

const permissionService = {
  checkPermission,
};

export default permissionService;
