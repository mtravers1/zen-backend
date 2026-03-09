import Activity from "../database/models/Activity.js";

const getActivities = async (req, res) => {
  try {
    const { clientId, type, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (clientId) filter.clientId = clientId;
    if (type) filter.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [activities, total] = await Promise.all([
      Activity.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Activity.countDocuments(filter),
    ]);
    res.status(200).json({ activities, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createActivity = async (req, res) => {
  try {
    const activity = await Activity.create({
      ...req.body,
      userId: req.user?.userId,
      userName: req.user?.email,
    });
    res.status(201).json(activity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const activitiesController = { getActivities, createActivity };
export default activitiesController;
