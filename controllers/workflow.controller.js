import Task from "../database/models/Task.js";
import Job from "../database/models/Job.js";
import JobRecurrence from "../database/models/JobRecurrence.js";
import CalendarEvent from "../database/models/CalendarEvent.js";
import Pipeline from "../database/models/Pipeline.js";
import ActivityLog from "../database/models/ActivityLog.js";

const logActivity = async (firmId, userId, action, entityType, entityId, entityName) => {
  try {
    await ActivityLog.create({ firmId, userId, action, entityType, entityId, entityName });
  } catch (_) {}
};

// ── Tasks ────────────────────────────────────────────────────────
export const listTasks = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.jobId) filter.jobId = req.query.jobId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.pipelineId) filter.pipelineId = req.query.pipelineId;

    if (req.query.search) {
      filter.title = { $regex: req.query.search, $options: "i" };
    }

    // Due date range
    if (req.query.dueDateFrom || req.query.dueDateTo) {
      filter.dueDate = {};
      if (req.query.dueDateFrom) filter.dueDate.$gte = new Date(req.query.dueDateFrom);
      if (req.query.dueDateTo) filter.dueDate.$lte = new Date(req.query.dueDateTo);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate("assignedTo", "name.firstName name.lastName")
        .populate("clientId", "firstName lastName companyName")
        .populate("jobId", "title jobNumber")
        .sort(req.query.sortBy === "dueDate" ? { dueDate: 1 } : { position: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Task.countDocuments(filter),
    ]);

    res.status(200).json({ tasks, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assignedTo", "name.firstName name.lastName email")
      .populate("clientId")
      .populate("jobId");
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createTask = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user?.userId };
    const task = await Task.create(data);
    await logActivity(data.firmId, req.user?.userId, "created", "task", task._id, task.title);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.status === "done" && !updates.completedAt) {
      updates.completedAt = new Date();
    }
    const task = await Task.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTaskStats = async (req, res) => {
  try {
    const filter = req.query.firmId ? { firmId: req.query.firmId } : {};
    const stats = await Task.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const now = new Date();
    const overdue = await Task.countDocuments({
      ...filter, dueDate: { $lt: now }, status: { $nin: ["done", "cancelled"] },
    });
    res.status(200).json({ byStatus: stats, overdue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Jobs ─────────────────────────────────────────────────────────
export const listJobs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.pipelineId) filter.pipelineId = req.query.pipelineId;

    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { jobNumber: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("clientId", "firstName lastName companyName")
        .populate("assignedTo", "name.firstName name.lastName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Job.countDocuments(filter),
    ]);

    res.status(200).json({ jobs, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("clientId")
      .populate("assignedTo", "name.firstName name.lastName email")
      .populate("tasks")
      .populate("invoices", "invoiceNumber total status");
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createJob = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user?.userId };
    // Generate job number
    if (!data.jobNumber) {
      const count = await Job.countDocuments({ firmId: data.firmId });
      data.jobNumber = `JOB-${1000 + count}`;
    }
    const job = await Job.create(data);
    await logActivity(data.firmId, req.user?.userId, "created", "job", job._id, job.title);
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateJob = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.status === "completed" && !updates.completedAt) {
      updates.completedAt = new Date();
    }
    const job = await Job.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true })
      .populate("clientId", "firstName lastName companyName");
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteJob = async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.status(200).json({ message: "Job deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getJobStats = async (req, res) => {
  try {
    const filter = req.query.firmId ? { firmId: req.query.firmId } : {};
    const stats = await Job.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalBudget: { $sum: "$budgetAmount" },
        },
      },
    ]);
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Pipelines ─────────────────────────────────────────────────────
export const listPipelines = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.type) filter.type = req.query.type;

    const pipelines = await Pipeline.find(filter).sort({ isDefault: -1, name: 1 });
    res.status(200).json(pipelines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getPipelineById = async (req, res) => {
  try {
    const pipeline = await Pipeline.findById(req.params.id);
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

    // Get item counts per stage
    const jobCounts = await Job.aggregate([
      { $match: { pipelineId: pipeline._id } },
      { $group: { _id: "$pipelineStageId", count: { $sum: 1 } } },
    ]);

    res.status(200).json({ pipeline, stageCounts: jobCounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createPipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.create({ ...req.body, createdBy: req.user?.userId });
    res.status(201).json(pipeline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updatePipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
    res.status(200).json(pipeline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deletePipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.findByIdAndDelete(req.params.id);
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
    res.status(200).json({ message: "Pipeline deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Calendar ──────────────────────────────────────────────────────
export const listCalendarEvents = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.userId) filter.$or = [{ createdBy: req.query.userId }, { attendees: req.query.userId }];

    if (req.query.startFrom || req.query.startTo) {
      filter.startAt = {};
      if (req.query.startFrom) filter.startAt.$gte = new Date(req.query.startFrom);
      if (req.query.startTo) filter.startAt.$lte = new Date(req.query.startTo);
    }

    const events = await CalendarEvent.find(filter)
      .populate("createdBy", "name.firstName name.lastName")
      .populate("attendees", "name.firstName name.lastName")
      .populate("clientId", "firstName lastName companyName")
      .sort({ startAt: 1 });

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createCalendarEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.create({ ...req.body, createdBy: req.body.createdBy || req.user?.userId });
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateCalendarEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.status(200).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteCalendarEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.status(200).json({ message: "Event deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Job Recurrences ───────────────────────────────────────────────
export const listRecurrences = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.status) filter.status = req.query.status;

    const recurrences = await JobRecurrence.find(filter)
      .populate("clientId", "firstName lastName companyName")
      .sort({ createdAt: -1 });

    res.status(200).json(recurrences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createRecurrence = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user?.userId };
    data.nextDueDate = data.startDate;
    const recurrence = await JobRecurrence.create(data);
    res.status(201).json(recurrence);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateRecurrence = async (req, res) => {
  try {
    const recurrence = await JobRecurrence.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!recurrence) return res.status(404).json({ error: "Recurrence not found" });
    res.status(200).json(recurrence);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteRecurrence = async (req, res) => {
  try {
    const recurrence = await JobRecurrence.findByIdAndDelete(req.params.id);
    if (!recurrence) return res.status(404).json({ error: "Recurrence not found" });
    res.status(200).json({ message: "Recurrence deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
