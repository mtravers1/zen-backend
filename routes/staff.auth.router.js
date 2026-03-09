/**
 * Staff authentication routes.
 * Separate from the mobile-app auth routes to avoid conflicts.
 *
 * POST /api/staff-auth/signin  – sign in a staff member (email + password)
 * GET  /api/staff-auth/me      – get current staff member profile
 */
import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import StaffMember from "../database/models/StaffMember.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";

const router = Router();

/** POST /api/staff-auth/signin */
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const staff = await StaffMember.findOne({ email: email.toLowerCase().trim(), deleted: false });
    if (!staff) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!staff.isActive) {
      return res.status(403).json({ message: "Account is inactive. Contact your administrator." });
    }

    // Validate password
    if (!staff.passwordHash) {
      return res.status(401).json({ message: "Password login not configured for this account" });
    }

    const valid = await bcrypt.compare(password, staff.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Update lastLoginAt
    await StaffMember.findByIdAndUpdate(staff._id, { lastLoginAt: new Date() });

    // Generate JWT token (same format as mobile-app token so firebaseAuth middleware can decode it)
    const payload = {
      userId: staff._id.toString(),
      email: staff.email,
      staffRole: staff.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };
    const token = jwt.sign(payload, process.env.SECRET);

    return res.status(200).json({
      token,
      _id: staff._id,
      email: staff.email,
      name: { firstName: staff.firstName, lastName: staff.lastName },
      role: staff.role,
      account_type: staff.role,   // frontend looks at account_type ?? role
      profilePhotoUrl: staff.profilePhotoUrl,
    });
  } catch (error) {
    console.error("[STAFF AUTH] signin error:", error);
    return res.status(500).json({ message: error.message });
  }
});

/** GET /api/staff-auth/me – requires valid JWT */
router.get("/me", firebaseAuth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const staff = await StaffMember.findOne({ _id: userId, deleted: false })
      .select("-passwordHash")
      .lean();
    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    return res.status(200).json(staff);
  } catch (error) {
    console.error("[STAFF AUTH] me error:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
