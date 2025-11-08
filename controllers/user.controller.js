import { createSafeEncrypt } from "../lib/encryptionHelper.js";
import User from "../database/models/User.js";
import {
  decryptValue,
  getUserDek,
  encryptValue,
} from "../database/encryption.js";

/**
 * List all users for admin interface
 */
const listUsers = async (req, res) => {
  try {
    console.log("[USER CONTROLLER] Listing all users");

    // Get all users from database
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 });

    console.log(`[USER CONTROLLER] Found ${users.length} users`);

    // Decrypt and format user data for display
    const formattedUsers = [];

    for (const user of users) {
      try {
        const dek = await getUserDek(user.authUid);

        // Decrypt email
        let email = "N/A";
        if (user.email && user.email.length > 0) {
          try {
            email = await decryptValue(user.email[0].email, dek);
          } catch (error) {
            console.log(
              `[USER CONTROLLER] Error decrypting email for user ${user._id}:`,
              error.message,
            );
            email = "Error decrypting email"; // Show error message if decryption fails
          }
        }

        // Decrypt name
        let firstName = "N/A";
        let lastName = "N/A";
        if (user.name) {
          try {
            firstName = await decryptValue(user.name.firstName, dek);
            if (user.name.lastName) {
              lastName = await decryptValue(user.name.lastName, dek);
            }
          } catch (error) {
            console.log(
              `[USER CONTROLLER] Error decrypting name for user ${user._id}:`,
              error.message,
            );
            firstName = "Error decrypting name";
            lastName = "";
          }
        }

        formattedUsers.push({
          _id: user._id,
          email: email,
          firstName: firstName,
          lastName: lastName,
          role: user.role,
          method: user.method || "email",
          authUid: user.authUid,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          account_type: user.account_type,
        });
      } catch (error) {
        console.error(
          `[USER CONTROLLER] Error processing user ${user._id}:`,
          error,
        );
        // Add user with basic info if decryption fails
        formattedUsers.push({
          _id: user._id,
          email: "Error decrypting",
          firstName: "Error",
          lastName: "Decrypting",
          role: user.role,
          method: user.method || "email",
          authUid: user.authUid,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          account_type: user.account_type,
        });
      }
    }

    console.log(
      `[USER CONTROLLER] Successfully formatted ${formattedUsers.length} users`,
    );
    res.status(200).json(formattedUsers);
  } catch (error) {
    console.error("[USER CONTROLLER] Error listing users:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get user by ID
 */
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Decrypt user data for display
    const dek = await getUserDek(user.authUid);

    let email = "N/A";
    if (user.email && user.email.length > 0) {
      email = await decryptValue(user.email[0].email, dek);
    }

    let firstName = "N/A";
    let lastName = "N/A";
    if (user.name) {
      firstName = await decryptValue(user.name.firstName, dek);
      if (user.name.lastName) {
        lastName = await decryptValue(user.name.lastName, dek);
      }
    }

    const formattedUser = {
      _id: user._id,
      email: email,
      firstName: firstName,
      lastName: lastName,
      role: user.role,
      method: user.method || "email",
      authUid: user.authUid,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      account_type: user.account_type,
    };

    res.status(200).json(formattedUser);
  } catch (error) {
    console.error("[USER CONTROLLER] Error getting user:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update user method/provider
 */
const updateUserMethod = async (req, res) => {
  try {
    const { userId } = req.params;
    const { method } = req.body;

    if (!["google", "apple", "email"].includes(method)) {
      return res.status(400).json({ error: "Invalid method" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.method = method;
    const savedUser = await user.save();
    if (!savedUser) {
      throw new Error("User method could not be updated.");
    }

    console.log(
      `[USER CONTROLLER] Updated method for user ${userId} to ${method}`,
    );

    res.status(200).json({
      _id: user._id,
      method: user.method,
      authUid: user.authUid,
    });
  } catch (error) {
    console.error("[USER CONTROLLER] Error updating user method:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get current user session info (for compatibility)
 */
const getMyUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Decrypt user data for response
    const dek = await getUserDek(user.authUid);

    let email = "N/A";
    if (user.email && user.email.length > 0) {
      email = await decryptValue(user.email[0].email, dek);
    }

    let firstName = "N/A";
    let lastName = "N/A";
    if (user.name) {
      firstName = await decryptValue(user.name.firstName, dek);
      if (user.name.lastName) {
        lastName = await decryptValue(user.name.lastName, dek);
      }
    }

    const formattedUser = {
      _id: user._id,
      email: email,
      firstName: firstName,
      lastName: lastName,
      role: user.role,
      method: user.method || "email",
      authUid: user.authUid,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      account_type: user.account_type,
    };

    res.status(200).json(formattedUser);
  } catch (error) {
    console.error("[USER CONTROLLER] Error getting current user:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Check user permission (for compatibility)
 */
const checkUserPermission = async (req, res) => {
  try {
    const { permissionName } = req.body;

    // Use the existing permission service
    const { checkPermission } = await import(
      "../services/permissions.service.js"
    );
    const hasPermission = await checkPermission(req.user.email, permissionName);

    res.status(200).json({ hasPermission });
  } catch (error) {
    console.error("[USER CONTROLLER] Error checking permission:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update user info (firstName, lastName, etc.)
 */
const updateUserInfo = async (req, res) => {
  const { userId } = req.params;
  const { firstName, lastName, middleName, prefix, suffix, photoUrl } =
    req.body;

  try {
    console.log("[USER CONTROLLER] Updating user info for:", userId);

    const user = await User.findById(userId);
    if (!user) {
      console.error("[USER CONTROLLER] User not found:", userId);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get DEK for encryption
    const dek = await getUserDek(user.authUid);
    const safeEncrypt = createSafeEncrypt(user.authUid);

    // Build update object with encrypted values
    const updateData = {};

    if (firstName !== undefined) {
      updateData["name.firstName"] = await safeEncrypt(firstName, dek);
    }
    if (lastName !== undefined) {
      updateData["name.lastName"] = await safeEncrypt(lastName, dek);
    }
    if (middleName !== undefined) {
      updateData["name.middleName"] = await safeEncrypt(middleName, dek);
    }
    if (prefix !== undefined) {
      updateData["name.prefix"] = await safeEncrypt(prefix, dek);
    }
    if (suffix !== undefined) {
      updateData["name.suffix"] = await safeEncrypt(suffix, dek);
    }
    if (photoUrl !== undefined) {
      updateData.photoUrl = photoUrl; // photoUrl is not encrypted
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }, // Return updated document
    ).select("-password");

    if (!updatedUser) {
      throw new Error("User info could not be updated.");
    }

    console.log("[USER CONTROLLER] User info updated successfully:", userId);

    res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error("[USER CONTROLLER] Error updating user info:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const userController = {
  listUsers,
  getUserById,
  updateUserMethod,
  updateUserInfo,
  getMyUser, // ← Added for compatibility
  checkUserPermission, // ← Added for compatibility
};

export default userController;
