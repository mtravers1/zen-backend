import permissionService from "../services/permissions.service.js";

const checkUserPermission = async (req, res) => {
  try {
    const { email, permissionKey } = req.query;
    const hasPermission = await permissionService.checkPermission(
      email,
      permissionKey
    );

    if (hasPermission) {
      return res.status(200).json({ message: "Permiso válido" });
    } else {
      return res
        .status(403)
        .json({ message: "No tienes permisos suficientes para esta acción" });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error al verificar el permiso", error });
  }
};

const PermissionController = {
  checkUserPermission,
};
export default PermissionController;
