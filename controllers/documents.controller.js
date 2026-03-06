import Document from "../database/models/Document.js";
import ActivityLog from "../database/models/ActivityLog.js";

const logActivity = async (firmId, userId, action, entityId, entityName) => {
  try {
    await ActivityLog.create({ firmId, userId, action, entityType: "document", entityId, entityName });
  } catch (_) {}
};

// GET /api/documents
export const listDocuments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.jobId) filter.jobId = req.query.jobId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.visibility) filter.visibility = req.query.visibility;
    if (req.query.isOrganizer !== undefined) filter.isOrganizer = req.query.isOrganizer === "true";
    if (req.query.organizerYear) filter.organizerYear = parseInt(req.query.organizerYear);
    filter.status = req.query.status || "active";

    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const [docs, total] = await Promise.all([
      Document.find(filter)
        .populate("clientId", "firstName lastName companyName")
        .populate("uploadedBy", "name.firstName name.lastName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Document.countDocuments(filter),
    ]);

    res.status(200).json({ documents: docs, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/documents/:id
export const getDocumentById = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate("clientId")
      .populate("uploadedBy", "name.firstName name.lastName");
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/documents
export const createDocument = async (req, res) => {
  try {
    const data = { ...req.body, uploadedBy: req.body.uploadedBy || req.user?.userId };
    const doc = await Document.create(data);
    await logActivity(data.firmId, req.user?.userId, "uploaded", doc._id, doc.name);
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/documents/:id
export const updateDocument = async (req, res) => {
  try {
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/documents/:id (soft delete)
export const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "deleted" } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.status(200).json({ message: "Document deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/documents/organizers
export const listOrganizers = async (req, res) => {
  try {
    const filter = { isOrganizer: true, status: "active" };
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.year) filter.organizerYear = parseInt(req.query.year);
    if (req.query.organizerStatus) filter.organizerStatus = req.query.organizerStatus;

    const organizers = await Document.find(filter)
      .populate("clientId", "firstName lastName companyName")
      .sort({ organizerYear: -1, createdAt: -1 });

    res.status(200).json(organizers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/documents/client/:clientId
export const listClientDocuments = async (req, res) => {
  try {
    const docs = await Document.find({
      clientId: req.params.clientId,
      status: "active",
    })
      .populate("uploadedBy", "name.firstName name.lastName")
      .sort({ createdAt: -1 });
    res.status(200).json(docs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
