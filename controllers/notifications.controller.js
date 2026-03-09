import Notification from "../database/models/Notification.js";

const getNotifications = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.uid;
    const { read, page = 1, limit = 50 } = req.query;

    // Fetch notifications for this user OR broadcast ("all")
    const filter = { deleted: false, $or: [{ userId }, { userId: "all" }] };
    if (read !== undefined) filter.read = read === "true";

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, read: false }),
    ]);
    res.status(200).json({ notifications, total, unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const markRead = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.uid;
    const { ids } = req.body;   // array of notification IDs, or empty for "mark all"

    const filter = { deleted: false, $or: [{ userId }, { userId: "all" }] };
    if (ids && ids.length > 0) filter._id = { $in: ids };

    await Notification.updateMany(filter, { read: true });
    res.status(200).json({ message: "Marked as read" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createNotification = async (req, res) => {
  try {
    const notification = await Notification.create(req.body);
    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.status(200).json({ message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const notificationsController = { getNotifications, markRead, createNotification, deleteNotification };
export default notificationsController;
