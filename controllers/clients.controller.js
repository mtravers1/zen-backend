import Client from "../database/models/Client.js";
import Contact from "../database/models/Contact.js";
import ActivityLog from "../database/models/ActivityLog.js";

const logActivity = async (firmId, userId, action, entityId, entityName) => {
  try {
    await ActivityLog.create({ firmId, userId, action, entityType: "client", entityId, entityName });
  } catch (_) {}
};

// GET /api/crm/clients
const listClients = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;

    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { firstName: { $regex: s, $options: "i" } },
        { lastName: { $regex: s, $options: "i" } },
        { companyName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
      ];
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const [clients, total] = await Promise.all([
      Client.find(filter)
        .populate("assignedTo", "name.firstName name.lastName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Client.countDocuments(filter),
    ]);

    res.status(200).json({ clients, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/crm/clients/stats
const getClientStats = async (req, res) => {
  try {
    const filter = req.query.firmId ? { firmId: req.query.firmId } : {};

    const [byStatus, byType, total] = await Promise.all([
      Client.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Client.aggregate([
        { $match: filter },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      Client.countDocuments(filter),
    ]);

    res.status(200).json({ total, byStatus, byType });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/crm/clients/:id
const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate("assignedTo", "name.firstName name.lastName email")
      .populate("contacts");
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.status(200).json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/crm/clients
const createClient = async (req, res) => {
  try {
    const client = await Client.create(req.body);
    await logActivity(req.body.firmId, req.user?.userId, "created", client._id, client.companyName || `${client.firstName} ${client.lastName}`);
    res.status(201).json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/crm/clients/:id
const updateClient = async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.status(200).json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/crm/clients/:id
const deleteClient = async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.status(200).json({ message: "Client deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/crm/clients/:id/contacts
const getClientContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({ clientId: req.params.id }).sort({ lastName: 1 });
    res.status(200).json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const clientsController = {
  listClients, getClientStats, getClientById,
  createClient, updateClient, deleteClient, getClientContacts,
};
export default clientsController;
