import Client from "../database/models/Client.js";
import Activity from "../database/models/Activity.js";

const getClients = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const filter = { deleted: false };

    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [clients, total] = await Promise.all([
      Client.find(filter).sort({ name: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      Client.countDocuments(filter),
    ]);

    res.status(200).json({ clients, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("[CLIENTS] getClients error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getClient = async (req, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.status(200).json(client);
  } catch (error) {
    console.error("[CLIENTS] getClient error:", error);
    res.status(500).json({ message: error.message });
  }
};

const createClient = async (req, res) => {
  try {
    const client = await Client.create({ ...req.body, createdById: req.user?.userId });
    await Activity.create({
      type: "Other", item: client.name, action: "created",
      userId: req.user?.userId, userName: req.user?.email,
    });
    res.status(201).json(client);
  } catch (error) {
    console.error("[CLIENTS] createClient error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateClient = async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.status(200).json(client);
  } catch (error) {
    console.error("[CLIENTS] updateClient error:", error);
    res.status(500).json({ message: error.message });
  }
};

const deleteClient = async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    ).lean();
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.status(200).json({ message: "Client deleted" });
  } catch (error) {
    console.error("[CLIENTS] deleteClient error:", error);
    res.status(500).json({ message: error.message });
  }
};

const clientsController = { getClients, getClient, createClient, updateClient, deleteClient };
export default clientsController;
