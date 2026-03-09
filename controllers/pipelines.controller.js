import Pipeline from "../database/models/Pipeline.js";

const getPipelines = async (req, res) => {
  try {
    const pipelines = await Pipeline.find({ deleted: false }).sort({ name: 1 }).lean();
    res.status(200).json(pipelines);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!pipeline) return res.status(404).json({ message: "Pipeline not found" });
    res.status(200).json(pipeline);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createPipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.create({ ...req.body, createdById: req.user?.userId });
    res.status(201).json(pipeline);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updatePipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!pipeline) return res.status(404).json({ message: "Pipeline not found" });
    res.status(200).json(pipeline);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deletePipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!pipeline) return res.status(404).json({ message: "Pipeline not found" });
    res.status(200).json({ message: "Pipeline deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const pipelinesController = { getPipelines, getPipeline, createPipeline, updatePipeline, deletePipeline };
export default pipelinesController;
