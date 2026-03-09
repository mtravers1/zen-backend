import Message from "../database/models/Message.js";

const getMessages = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.uid;
    const { unread, starred, page = 1, limit = 50 } = req.query;
    const filter = { deleted: false, toUserId: userId };
    if (unread !== undefined) filter.unread = unread === "true";
    if (starred !== undefined) filter.starred = starred === "true";

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [messages, total, unreadCount] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Message.countDocuments(filter),
      Message.countDocuments({ ...filter, unread: true }),
    ]);
    res.status(200).json({ messages, total, unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMessage = async (req, res) => {
  try {
    const message = await Message.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!message) return res.status(404).json({ message: "Message not found" });
    // Mark as read
    await Message.findByIdAndUpdate(req.params.id, { unread: false });
    res.status(200).json({ ...message, unread: false });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createMessage = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.uid;
    const message = await Message.create({
      ...req.body,
      fromUserId: userId,
    });
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateMessage = async (req, res) => {
  try {
    // Only allow toggling starred / unread flags
    const { starred, unread } = req.body;
    const update = {};
    if (starred !== undefined) update.starred = starred;
    if (unread !== undefined) update.unread = unread;

    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      update,
      { new: true }
    ).lean();
    if (!message) return res.status(404).json({ message: "Message not found" });
    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: "Message not found" });
    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const messagesController = { getMessages, getMessage, createMessage, updateMessage, deleteMessage };
export default messagesController;
