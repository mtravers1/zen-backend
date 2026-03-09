import Task from "../database/models/Task.js";

const getTasks = async (req, res) => {
  try {
    const { status, clientId, assignee, priority, page = 1, limit = 50 } = req.query;
    const filter = { deleted: false };
    if (status) filter.status = status;
    if (clientId) filter.clientId = clientId;
    if (assignee) filter.assignee = { $regex: assignee, $options: "i" };
    if (priority) filter.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tasks, total] = await Promise.all([
      Task.find(filter).sort({ dueDate: 1, priority: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      Task.countDocuments(filter),
    ]);
    res.status(200).json({ tasks, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTask = async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createTask = async (req, res) => {
  try {
    const task = await Task.create(req.body);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const tasksController = { getTasks, getTask, createTask, updateTask, deleteTask };
export default tasksController;
