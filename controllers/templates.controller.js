import Template from "../database/models/Template.js";
import CustomField from "../database/models/CustomField.js";
import Tag from "../database/models/Tag.js";
import Service from "../database/models/Service.js";
import Pipeline from "../database/models/Pipeline.js";

// ── Templates ────────────────────────────────────────────────────
export const listTemplates = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) {
      filter.$or = [{ firmId: req.query.firmId }, { isGlobal: true }];
    }
    if (req.query.type) filter.type = req.query.type;
    if (req.query.isGlobal !== undefined) filter.isGlobal = req.query.isGlobal === "true";
    filter.isActive = true;

    const templates = await Template.find(filter)
      .populate("createdBy", "name.firstName name.lastName")
      .sort({ isGlobal: -1, usageCount: -1, name: 1 });

    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTemplateById = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.status(200).json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createTemplate = async (req, res) => {
  try {
    const template = await Template.create({ ...req.body, createdBy: req.user?.userId });
    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.status(200).json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    await Template.findByIdAndUpdate(req.params.id, { $set: { isActive: false } });
    res.status(200).json({ message: "Template deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Custom Fields ────────────────────────────────────────────────
export const listCustomFields = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.appliesTo) filter.appliesTo = req.query.appliesTo;

    const fields = await CustomField.find(filter).sort({ position: 1, name: 1 });
    res.status(200).json(fields);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createCustomField = async (req, res) => {
  try {
    const field = await CustomField.create({ ...req.body, createdBy: req.user?.userId });
    res.status(201).json(field);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateCustomField = async (req, res) => {
  try {
    const field = await CustomField.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!field) return res.status(404).json({ error: "Custom field not found" });
    res.status(200).json(field);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteCustomField = async (req, res) => {
  try {
    await CustomField.findByIdAndUpdate(req.params.id, { $set: { isActive: false } });
    res.status(200).json({ message: "Custom field deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Tags ──────────────────────────────────────────────────────────
export const listTags = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.appliesTo) filter.appliesTo = req.query.appliesTo;

    const tags = await Tag.find(filter).sort({ usageCount: -1, name: 1 });
    res.status(200).json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createTag = async (req, res) => {
  try {
    const tag = await Tag.create({ ...req.body, createdBy: req.user?.userId });
    res.status(201).json(tag);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Tag with this name already exists" });
    }
    res.status(500).json({ error: error.message });
  }
};

export const updateTag = async (req, res) => {
  try {
    const tag = await Tag.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!tag) return res.status(404).json({ error: "Tag not found" });
    res.status(200).json(tag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTag = async (req, res) => {
  try {
    await Tag.findByIdAndUpdate(req.params.id, { $set: { isActive: false } });
    res.status(200).json({ message: "Tag deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Services ──────────────────────────────────────────────────────
export const listServices = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.firmId) {
      filter.$or = [{ firmId: req.query.firmId }, { isGlobal: true }];
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.isPublic !== undefined) filter.isPublic = req.query.isPublic === "true";

    const services = await Service.find(filter).sort({ isGlobal: -1, name: 1 });
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createService = async (req, res) => {
  try {
    const service = await Service.create({ ...req.body, createdBy: req.user?.userId });
    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateService = async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteService = async (req, res) => {
  try {
    await Service.findByIdAndUpdate(req.params.id, { $set: { isActive: false } });
    res.status(200).json({ message: "Service deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
