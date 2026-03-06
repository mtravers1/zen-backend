import Lead from "../database/models/Lead.js";
import Contact from "../database/models/Contact.js";
import ActivityLog from "../database/models/ActivityLog.js";

// Helper: log activity
const logActivity = async (firmId, userId, action, entityId, entityName, changes = {}) => {
  try {
    await ActivityLog.create({ firmId, userId, action, entityType: "lead", entityId, entityName, changes });
  } catch (_) { /* non-blocking */ }
};

// GET /api/crm/leads
const listLeads = async (req, res) => {
  try {
    const { firmId } = req.query;
    const filter = {};
    if (firmId) filter.firmId = firmId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;

    // Search
    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { name: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { company: { $regex: s, $options: "i" } },
      ];
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate("assignedTo", "name.firstName name.lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Lead.countDocuments(filter),
    ]);

    res.status(200).json({ leads, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/crm/leads/stats
const getLeadStats = async (req, res) => {
  try {
    const { firmId } = req.query;
    const filter = firmId ? { firmId } : {};

    const stats = await Lead.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const result = {
      total: 0,
      new: 0,
      contacted: 0,
      qualified: 0,
      converted: 0,
      lost: 0,
    };

    stats.forEach(({ _id, count }) => {
      result[_id] = count;
      result.total += count;
    });

    // Source breakdown
    const bySource = await Lead.aggregate([
      { $match: filter },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Recent (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCount = await Lead.countDocuments({ ...filter, createdAt: { $gte: thirtyDaysAgo } });

    res.status(200).json({ ...result, bySource, recentCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/crm/leads/:id
const getLeadById = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate("assignedTo", "name.firstName name.lastName email")
      .populate("convertedToContactId");

    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.status(200).json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/crm/leads
const createLead = async (req, res) => {
  try {
    const lead = await Lead.create(req.body);
    await logActivity(req.body.firmId, req.user?.userId, "created", lead._id, lead.name);
    res.status(201).json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/crm/leads/:id
const updateLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate("assignedTo", "name.firstName name.lastName email");

    if (!lead) return res.status(404).json({ error: "Lead not found" });
    await logActivity(lead.firmId, req.user?.userId, "updated", lead._id, lead.name, req.body);
    res.status(200).json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/crm/leads/:id/status
const updateLeadStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    await logActivity(lead.firmId, req.user?.userId, "status_changed", lead._id, lead.name, { status });
    res.status(200).json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/crm/leads/:id/convert
const convertLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    // Create contact from lead
    const contact = await Contact.create({
      firmId: lead.firmId,
      assignedTo: lead.assignedTo,
      firstName: lead.name.split(" ")[0] || lead.name,
      lastName: lead.name.split(" ").slice(1).join(" ") || "",
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      notes: lead.message,
      source: lead.source,
      leadId: lead._id,
      status: "active",
      ...req.body.contactData,
    });

    // Mark lead as converted
    lead.status = "converted";
    lead.convertedToContactId = contact._id;
    lead.convertedAt = new Date();
    await lead.save();

    await logActivity(lead.firmId, req.user?.userId, "converted", lead._id, lead.name);
    res.status(200).json({ lead, contact });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/crm/leads/:id
const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.status(200).json({ message: "Lead deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const leadsController = {
  listLeads,
  getLeadStats,
  getLeadById,
  createLead,
  updateLead,
  updateLeadStatus,
  convertLead,
  deleteLead,
};

export default leadsController;
