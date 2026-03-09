import Contact from "../database/models/Contact.js";

const getContacts = async (req, res) => {
  try {
    const { clientId, search } = req.query;
    const filter = { deleted: false };
    if (clientId) filter.clientId = clientId;
    if (search) filter.name = { $regex: search, $options: "i" };

    const contacts = await Contact.find(filter).sort({ isPrimary: -1, name: 1 }).lean();
    res.status(200).json(contacts);
  } catch (error) {
    console.error("[CONTACTS] getContacts error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getContact = async (req, res) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.status(200).json(contact);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createContact = async (req, res) => {
  try {
    const data = req.body;
    // Auto-generate initials if not provided
    if (!data.initials && data.name) {
      const parts = data.name.trim().split(" ");
      data.initials = parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2);
    }
    const contact = await Contact.create(data);
    res.status(201).json(contact);
  } catch (error) {
    console.error("[CONTACTS] createContact error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateContact = async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.status(200).json(contact);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.status(200).json({ message: "Contact deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const contactsController = { getContacts, getContact, createContact, updateContact, deleteContact };
export default contactsController;
