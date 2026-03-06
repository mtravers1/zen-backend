import Task from "../database/models/Task.js";
import Client from "../database/models/Client.js";

const getTasks = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      status,
      priority,
      assignedTo,
      clientId,
      search,
      dueDateFrom,
      dueDateTo,
      page = 1,
      limit = 50,
    } = req.query;

    const query = { firmId: userId, deletedAt: null };

    if (status && status !== "all") {
      if (status === "open") {
        query.status = { $in: ["open", "in_progress"] };
      } else {
        query.status = status;
      }
    }
    if (priority && priority !== "all") query.priority = priority;
    if (assignedTo && assignedTo !== "all") query.assignedTo = assignedTo;
    if (clientId) query.clientId = clientId;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { accountName: { $regex: search, $options: "i" } },
        { assigneeName: { $regex: search, $options: "i" } },
      ];
    }
    if (dueDateFrom || dueDateTo) {
      query.dueDate = {};
      if (dueDateFrom) query.dueDate.$gte = new Date(dueDateFrom);
      if (dueDateTo) query.dueDate.$lte = new Date(dueDateTo);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("clientId", "name")
        .populate("assignedTo", "name.first name.last")
        .sort({ dueDate: 1, priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Task.countDocuments(query),
    ]);

    res.status(200).json({ tasks, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getTask = async (req, res) => {
  try {
    const { userId } = req.user;
    const { taskId } = req.params;

    const task = await Task.findOne({
      _id: taskId,
      firmId: userId,
      deletedAt: null,
    })
      .populate("clientId", "name")
      .populate("assignedTo createdBy", "name.first name.last email")
      .lean();

    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const createTask = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      name,
      description,
      clientId,
      assignedTo,
      priority,
      status,
      dueDate,
      accountName,
      assigneeName,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    // Verify client belongs to this firm if provided
    if (clientId) {
      const client = await Client.findOne({ _id: clientId, firmId: userId, deletedAt: null });
      if (!client) return res.status(404).json({ message: "Client not found" });
    }

    const task = new Task({
      firmId: userId,
      createdBy: userId,
      assignedTo: assignedTo || null,
      clientId: clientId || null,
      name,
      description,
      priority: priority || "medium",
      status: status || "open",
      dueDate: dueDate ? new Date(dueDate) : null,
      accountName,
      assigneeName,
    });

    await task.save();

    // Link task to client
    if (clientId) {
      await Client.findByIdAndUpdate(clientId, {
        $addToSet: { taskIds: task._id },
      });
    }

    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const { userId } = req.user;
    const { taskId } = req.params;
    const updates = req.body;

    if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);

    const task = await Task.findOneAndUpdate(
      { _id: taskId, firmId: userId, deletedAt: null },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const completeTask = async (req, res) => {
  try {
    const { userId } = req.user;
    const { taskId } = req.params;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, firmId: userId, deletedAt: null },
      { $set: { status: "completed", completedAt: new Date() } },
      { new: true }
    );

    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const { userId } = req.user;
    const { taskId } = req.params;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, firmId: userId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );

    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

export default {
  getTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
};
