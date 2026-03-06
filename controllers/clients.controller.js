import Client from "../database/models/Client.js";
import Contact from "../database/models/Contact.js";
import User from "../database/models/User.js";

// ─── Clients ──────────────────────────────────────────────────────────────────

const getClients = async (req, res) => {
  try {
    const { userId } = req.user;
    const { status, type, search, page = 1, limit = 50 } = req.query;

    const query = { firmId: userId, deletedAt: null };
    if (status && status !== "all") query.status = status;
    if (type && type !== "all") query.type = type;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [clients, total] = await Promise.all([
      Client.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Client.countDocuments(query),
    ]);

    res.status(200).json({ clients, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getClient = async (req, res) => {
  try {
    const { userId } = req.user;
    const { clientId } = req.params;

    const client = await Client.findOne({
      _id: clientId,
      firmId: userId,
      deletedAt: null,
    })
      .populate("contactIds")
      .lean();

    if (!client) return res.status(404).json({ message: "Client not found" });
    res.status(200).json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const createClient = async (req, res) => {
  try {
    const { userId } = req.user;
    const { name, type, email, phone, assignee, status, address, notes } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "name and type are required" });
    }

    const client = new Client({
      firmId: userId,
      name,
      type,
      email,
      status: status || "active",
      phones: phone ? [{ phone, phoneType: "primary" }] : [],
      address: address ? { street: address } : undefined,
      notes,
    });

    await client.save();
    res.status(201).json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const updateClient = async (req, res) => {
  try {
    const { userId } = req.user;
    const { clientId } = req.params;
    const updates = req.body;

    const client = await Client.findOneAndUpdate(
      { _id: clientId, firmId: userId, deletedAt: null },
      { $set: updates },
      { new: true }
    );

    if (!client) return res.status(404).json({ message: "Client not found" });
    res.status(200).json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const deleteClient = async (req, res) => {
  try {
    const { userId } = req.user;
    const { clientId } = req.params;

    const client = await Client.findOneAndUpdate(
      { _id: clientId, firmId: userId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );

    if (!client) return res.status(404).json({ message: "Client not found" });
    res.status(200).json({ message: "Client deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// ─── Contacts ─────────────────────────────────────────────────────────────────

const getContacts = async (req, res) => {
  try {
    const { userId } = req.user;
    const { clientId, search } = req.query;

    const query = { firmId: userId, deletedAt: null };
    if (clientId) query.clientId = clientId;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const contacts = await Contact.find(query)
      .populate("clientId", "name")
      .sort({ isPrimary: -1, lastName: 1 })
      .lean();

    res.status(200).json(contacts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const createContact = async (req, res) => {
  try {
    const { userId } = req.user;
    const { clientId, firstName, lastName, role, email, phone, isPrimary, notes } = req.body;

    if (!firstName || !lastName || !clientId) {
      return res.status(400).json({ message: "firstName, lastName, and clientId are required" });
    }

    // Verify client belongs to this firm
    const client = await Client.findOne({ _id: clientId, firmId: userId, deletedAt: null });
    if (!client) return res.status(404).json({ message: "Client not found" });

    const contact = new Contact({
      firmId: userId,
      clientId,
      firstName,
      lastName,
      role,
      email,
      phone,
      isPrimary: isPrimary || false,
      notes,
    });

    await contact.save();

    // Add contact ref to client
    await Client.findByIdAndUpdate(clientId, {
      $addToSet: { contactIds: contact._id },
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const updateContact = async (req, res) => {
  try {
    const { userId } = req.user;
    const { contactId } = req.params;
    const updates = req.body;

    const contact = await Contact.findOneAndUpdate(
      { _id: contactId, firmId: userId, deletedAt: null },
      { $set: updates },
      { new: true }
    );

    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.status(200).json(contact);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const deleteContact = async (req, res) => {
  try {
    const { userId } = req.user;
    const { contactId } = req.params;

    const contact = await Contact.findOneAndUpdate(
      { _id: contactId, firmId: userId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );

    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.status(200).json({ message: "Contact deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

export default {
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getContacts,
  createContact,
  updateContact,
  deleteContact,
};
