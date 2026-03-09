import Job from "../database/models/Job.js";
import Activity from "../database/models/Activity.js";

const getJobs = async (req, res) => {
  try {
    const { status, clientId, pipelineId, assignee, page = 1, limit = 50 } = req.query;
    const filter = { deleted: false };
    if (status) filter.status = status;
    if (clientId) filter.clientId = clientId;
    if (pipelineId) filter.pipelineId = pipelineId;
    if (assignee) filter.assignee = { $regex: assignee, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [jobs, total] = await Promise.all([
      Job.find(filter).sort({ dueDate: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      Job.countDocuments(filter),
    ]);
    res.status(200).json({ jobs, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getJob = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createJob = async (req, res) => {
  try {
    const job = await Job.create(req.body);
    await Activity.create({
      type: "Job", item: job.name, action: "created",
      clientId: job.clientId, clientName: job.clientName,
      userId: req.user?.userId, userName: req.user?.email,
    });
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateJob = async (req, res) => {
  try {
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteJob = async (req, res) => {
  try {
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json({ message: "Job deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const jobsController = { getJobs, getJob, createJob, updateJob, deleteJob };
export default jobsController;
