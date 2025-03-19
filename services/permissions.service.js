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

// Funciones para validar permisos (TODO: llenar con validaciones)
const validateCreateTrips = (createTripsMax) => {
  // TODO: Verificar la validación del permiso 'create_trips_max'
  return createTripsMax > 0;
};

const validateBusinesses = async (businessesMax, userId) => {
  // TODO: Verificar la validación del permiso 'businesses_max'
  const businesses = await Business.find({ userId });
  return businessesMax > businesses.length;
};

const validateStorage = (storageMaxGb) => {
  // TODO: Verificar la validación del permiso 'storage_max_gb'
  return storageMaxGb > 0;
};

// Puedes seguir agregando más funciones según el JSON
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
