import Message from "../database/models/Message.js";
import MessageThread from "../database/models/MessageThread.js";
import Notification from "../database/models/Notification.js";
import ActivityLog from "../database/models/ActivityLog.js";

// ── Message Threads ───────────────────────────────────────────────
export const listThreads = async (req, res) => {
  try {
    const { userId, firmId, type } = req.query;
    const filter = {};
    if (firmId) filter.firmId = firmId;
    if (type) filter.type = type;
    if (userId) filter["participants.userId"] = userId;
    filter.isArchived = false;

    const threads = await MessageThread.find(filter)
      .populate("participants.userId", "name.firstName name.lastName profilePhotoUrl")
      .populate("clientId", "firstName lastName companyName")
      .sort({ "lastMessage.sentAt": -1, updatedAt: -1 });

    res.status(200).json(threads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getThreadById = async (req, res) => {
  try {
    const thread = await MessageThread.findById(req.params.id)
      .populate("participants.userId", "name.firstName name.lastName profilePhotoUrl")
      .populate("clientId");
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.status(200).json(thread);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createThread = async (req, res) => {
  try {
    const thread = await MessageThread.create(req.body);
    res.status(201).json(thread);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateThread = async (req, res) => {
  try {
    const thread = await MessageThread.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.status(200).json(thread);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Messages ──────────────────────────────────────────────────────
export const listMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const [messages, total] = await Promise.all([
      Message.find({ threadId, deletedAt: null })
        .populate("sender", "name.firstName name.lastName profilePhotoUrl")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Message.countDocuments({ threadId, deletedAt: null }),
    ]);

    res.status(200).json({ messages: messages.reverse(), total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content, type, attachments, replyTo } = req.body;
    const senderId = req.body.sender || req.user?.userId;

    const message = await Message.create({
      threadId,
      firmId: req.body.firmId,
      sender: senderId,
      content,
      type: type || "text",
      attachments,
      replyTo,
      readBy: [{ userId: senderId, readAt: new Date() }],
    });

    // Update thread's last message
    await MessageThread.findByIdAndUpdate(threadId, {
      $set: {
        lastMessage: {
          content: type === "file" ? "📎 File attachment" : content,
          senderId,
          sentAt: new Date(),
        },
      },
    });

    const populated = await Message.findById(message._id)
      .populate("sender", "name.firstName name.lastName profilePhotoUrl");

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markMessagesRead = async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.body.userId || req.user?.userId;
    const now = new Date();

    await Message.updateMany(
      { threadId, "readBy.userId": { $ne: userId } },
      { $push: { readBy: { userId, readAt: now } } }
    );

    // Update participant's lastReadAt
    await MessageThread.findByIdAndUpdate(threadId, {
      $set: { "participants.$[elem].lastReadAt": now },
    }, {
      arrayFilters: [{ "elem.userId": userId }],
    });

    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    await Message.findByIdAndUpdate(req.params.id, { $set: { deletedAt: new Date() } });
    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Notifications ─────────────────────────────────────────────────
export const listNotifications = async (req, res) => {
  try {
    const { userId, firmId, read } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (firmId) filter.firmId = firmId;
    if (read !== undefined) filter.read = read === "true";

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, read: false }),
    ]);

    res.status(200).json({ notifications, total, unreadCount, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { $set: { read: true, readAt: new Date() } });
    res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const { userId } = req.body;
    await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createNotification = async (req, res) => {
  try {
    const notification = await Notification.create(req.body);
    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
