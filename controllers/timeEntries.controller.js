import TimeEntry from "../database/models/TimeEntry.js";

const getTimeEntries = async (req, res) => {
  try {
    const { clientId, billed, assignee, page = 1, limit = 50 } = req.query;
    const filter = { deleted: false };
    if (clientId) filter.clientId = clientId;
    if (billed !== undefined) filter.billed = billed === "true";
    if (assignee) filter.assignee = { $regex: assignee, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [entries, total] = await Promise.all([
      TimeEntry.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      TimeEntry.countDocuments(filter),
    ]);
    res.status(200).json({ entries, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!entry) return res.status(404).json({ message: "Time entry not found" });
    res.status(200).json(entry);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.create(req.body);
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!entry) return res.status(404).json({ message: "Time entry not found" });
    res.status(200).json(entry);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!entry) return res.status(404).json({ message: "Time entry not found" });
    res.status(200).json({ message: "Time entry deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const timeEntriesController = { getTimeEntries, getTimeEntry, createTimeEntry, updateTimeEntry, deleteTimeEntry };
export default timeEntriesController;
