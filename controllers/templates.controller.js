import Template from "../database/models/Template.js";

const getTemplates = async (req, res) => {
  try {
    const { category, search, isGlobal } = req.query;
    const filter = { deleted: false };
    if (category) filter.category = category;
    if (isGlobal !== undefined) filter.isGlobal = isGlobal === "true";
    if (search) filter.name = { $regex: search, $options: "i" };

    const templates = await Template.find(filter).sort({ category: 1, name: 1 }).lean();
    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createTemplate = async (req, res) => {
  try {
    const template = await Template.create({ ...req.body, createdById: req.user?.userId });
    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { ...req.body, updatedById: req.user?.userId },
      { new: true, runValidators: true }
    ).lean();
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json({ message: "Template deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const templatesController = { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate };
export default templatesController;
