import User from "../database/models/User.js";
import Lead from "../database/models/Lead.js";
import Client from "../database/models/Client.js";
import Invoice from "../database/models/Invoice.js";
import Payment from "../database/models/Payment.js";
import Job from "../database/models/Job.js";
import Task from "../database/models/Task.js";
import ActivityLog from "../database/models/ActivityLog.js";
import { getUserDek, decryptValue } from "../database/encryption.js";
import admin from "../lib/firebaseAdmin.js";

// Middleware: check admin role
export const requireAdmin = async (req, res, next) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  try {
    const firebaseUser = await admin.auth().getUser(uid);
    const claims = firebaseUser.customClaims || {};
    if (claims.role !== "admin" && claims.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  } catch (error) {
    res.status(403).json({ error: "Admin access check failed" });
  }
};

// GET /api/admin/stats
export const getAdminStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      newUsersThisMonth,
      totalLeads,
      activeClients,
      totalInvoices,
      paidInvoices,
      totalRevenue,
      activeJobs,
    ] = await Promise.all([
      User.countDocuments({ deleted: { $ne: true } }),
      User.countDocuments({ deleted: { $ne: true }, createdAt: { $gte: startOfMonth } }),
      Lead.countDocuments({}),
      Client.countDocuments({ status: "active" }),
      Invoice.countDocuments({}),
      Invoice.countDocuments({ status: "paid" }),
      Payment.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Job.countDocuments({ status: { $in: ["in_progress", "not_started"] } }),
    ]);

    res.status(200).json({
      users: { total: totalUsers, newThisMonth: newUsersThisMonth },
      leads: { total: totalLeads },
      clients: { active: activeClients },
      invoices: { total: totalInvoices, paid: paidInvoices },
      revenue: { total: totalRevenue[0]?.total || 0 },
      jobs: { active: activeJobs },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/users
export const listAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const filter = { deleted: { $ne: true } };

    if (req.query.search) {
      filter.emailHash = { $exists: true }; // basic filter
    }
    if (req.query.role) filter.role = req.query.role;
    if (req.query.method) filter.method = req.query.method;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    // Decrypt user data
    const formatted = [];
    for (const user of users) {
      try {
        const dek = await getUserDek(user.authUid);
        let email = "N/A";
        let firstName = "N/A";
        let lastName = "N/A";

        if (user.email?.length > 0) {
          email = await decryptValue(user.email[0].email, dek).catch(() => "N/A");
        }
        if (user.name) {
          firstName = await decryptValue(user.name.firstName, dek).catch(() => "N/A");
          lastName = user.name.lastName
            ? await decryptValue(user.name.lastName, dek).catch(() => "")
            : "";
        }

        formatted.push({
          _id: user._id,
          authUid: user.authUid,
          email,
          firstName,
          lastName,
          role: user.role,
          method: user.method,
          account_type: user.account_type,
          subscription_metadata: user.subscription_metadata,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          deleted: user.deleted,
        });
      } catch (_) {
        formatted.push({
          _id: user._id,
          authUid: user.authUid,
          role: user.role,
          method: user.method,
          createdAt: user.createdAt,
        });
      }
    }

    res.status(200).json({ users: formatted, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/users/:userId
export const getAdminUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    const dek = await getUserDek(user.authUid);
    let email = "N/A";
    let firstName = "N/A";
    let lastName = "N/A";

    if (user.email?.length > 0) {
      email = await decryptValue(user.email[0].email, dek).catch(() => "N/A");
    }
    if (user.name) {
      firstName = await decryptValue(user.name.firstName, dek).catch(() => "N/A");
      lastName = user.name.lastName
        ? await decryptValue(user.name.lastName, dek).catch(() => "")
        : "";
    }

    res.status(200).json({
      _id: user._id,
      authUid: user.authUid,
      email,
      firstName,
      lastName,
      role: user.role,
      method: user.method,
      account_type: user.account_type,
      subscription_metadata: user.subscription_metadata,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/admin/users/:userId/role
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    const validRoles = ["user", "staff", "manager", "admin", "super_admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { account_type: role } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    // Update Firebase custom claims
    try {
      await admin.auth().setCustomUserClaims(user.authUid, { role });
    } catch (fbError) {
      console.error("[ADMIN] Failed to set Firebase claims:", fbError.message);
    }

    res.status(200).json({ message: "Role updated", userId, role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/admin/users/:userId
export const adminDeleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByIdAndUpdate(userId, { $set: { deleted: true } }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Optionally delete from Firebase
    try {
      await admin.auth().deleteUser(user.authUid);
    } catch (fbError) {
      console.error("[ADMIN] Failed to delete Firebase user:", fbError.message);
    }

    res.status(200).json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/activity
export const getAdminActivity = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const filter = {};
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.userId) filter.userId = req.query.userId;

    const [activities, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate("userId", "name.firstName name.lastName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ActivityLog.countDocuments(filter),
    ]);

    res.status(200).json({ activities, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/system/health
export const getSystemHealth = async (req, res) => {
  try {
    const mongoose = (await import("mongoose")).default;
    const dbState = mongoose.connection.readyState;
    const dbStateMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        state: dbStateMap[dbState] || "unknown",
        connected: dbState === 1,
      },
      environment: process.env.NODE_ENV || "unknown",
      version: process.env.npm_package_version || "unknown",
    });
  } catch (error) {
    res.status(500).json({ status: "error", error: error.message });
  }
};
