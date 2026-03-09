import bcrypt from "bcrypt";
import StaffMember from "../database/models/StaffMember.js";
import { STAFF_ROLES } from "../database/models/StaffMember.js";
import Activity from "../database/models/Activity.js";

const getStaffMembers = async (req, res) => {
  try {
    const { role, isActive, search } = req.query;
    const filter = { deleted: false };
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const staff = await StaffMember.find(filter)
      .select("-passwordHash")
      .sort({ role: 1, firstName: 1 })
      .lean();
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getStaffMember = async (req, res) => {
  try {
    const staff = await StaffMember.findOne({ _id: req.params.id, deleted: false })
      .select("-passwordHash")
      .lean();
    if (!staff) return res.status(404).json({ message: "Staff member not found" });
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createStaffMember = async (req, res) => {
  try {
    const { password, ...data } = req.body;

    // Only directors/super_admin can create staff
    if (!["director", "super_admin"].includes(req.staffRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const staff = await StaffMember.create(data);
    const result = staff.toObject();
    delete result.passwordHash;

    await Activity.create({
      type: "User", item: `${staff.firstName} ${staff.lastName}`, action: "invited",
      userId: req.user?.userId, userName: req.user?.email,
    });

    res.status(201).json(result);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: error.message });
  }
};

const updateStaffMember = async (req, res) => {
  try {
    const { password, ...data } = req.body;

    // Only directors/super_admin can change roles
    if (data.role && !["director", "super_admin"].includes(req.staffRole)) {
      delete data.role;
    }

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const staff = await StaffMember.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      data,
      { new: true, runValidators: true }
    ).select("-passwordHash").lean();

    if (!staff) return res.status(404).json({ message: "Staff member not found" });
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteStaffMember = async (req, res) => {
  try {
    if (!["director", "super_admin"].includes(req.staffRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    const staff = await StaffMember.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!staff) return res.status(404).json({ message: "Staff member not found" });
    res.status(200).json({ message: "Staff member removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRoles = async (req, res) => {
  res.status(200).json(STAFF_ROLES);
};

const staffController = {
  getStaffMembers, getStaffMember, createStaffMember, updateStaffMember, deleteStaffMember, getRoles,
};
export default staffController;
