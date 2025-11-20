import User from "../database/models/User.js";

const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    console.log(
      `[ROLE CONTROLLER] Updating user role for ID: ${userId} to role: ${role}`,
    );

    // TODO: Add authorization check - only allow self or admin
    // const requestingUserId = req.user.uid;

    const user = await User.findById(userId);

    if (!user) {
      console.log(`[ROLE CONTROLLER] User not found for ID: ${userId}`);
      return res.status(404).send("User not found");
    }

    // Update user role
    user.role = role;
    await user.save();

    console.log(
      `[ROLE CONTROLLER] User role updated successfully for ID: ${userId}`,
    );

    // Return updated user without sensitive data
    const updatedUser = {
      _id: user._id,
      role: user.role,
      authUid: user.authUid,
      account_type: user.account_type,
    };

    res.status(200).send(updatedUser);
  } catch (error) {
    console.error(
      `[ROLE CONTROLLER] Error updating user role for ID: ${req.params.userId}`,
      error,
    );
    res.status(500).send(error.message);
  }
};

const roleController = {
  updateUserRole,
};

export default roleController;
