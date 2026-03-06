import Contact from "../database/models/Contact.js";
import ActivityLog from "../database/models/ActivityLog.js";

const logActivity = async (firmId, userId, action, entityId, entityName) => {
  try {
    await ActivityLog.create({ firmId, userId, action, entityType: "contact", entityId, entityName });
  } catch (_) {}
};

// GET /api/crm/contacts
const listContacts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.status) filter.status = req.query.status;

    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { firstName: { $regex: s, $options: "i" } },
        { lastName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { company: { $regex: s, $options: "i" } },
      ];
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const [contacts, total] = await Promise.all([
      Contact.find(filter)
        .populate("clientId", "companyName firstName lastName")
        .populate("assignedTo", "name.firstName name.lastName")
        .sort({ lastName: 1, firstName: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Contact.countDocuments(filter),
    ]);

    res.status(200).json({ contacts, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/crm/contacts/:id
const getContactById = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate("clientId")
      .populate("assignedTo", "name.firstName name.lastName email");
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.status(200).json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/crm/contacts
const createContact = async (req, res) => {
  try {
    const contact = await Contact.create(req.body);
    await logActivity(req.body.firmId, req.user?.userId, "created", contact._id, `${contact.firstName} ${contact.lastName}`);
    res.status(201).json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/crm/contacts/:id
const updateContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.status(200).json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/crm/contacts/:id
const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.status(200).json({ message: "Contact deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const contactsController = { listContacts, getContactById, createContact, updateContact, deleteContact };
export default contactsController;
