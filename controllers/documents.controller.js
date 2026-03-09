import Document from "../database/models/Document.js";
import Activity from "../database/models/Activity.js";

const getDocuments = async (req, res) => {
  try {
    const { clientId, scope, folder, search, page = 1, limit = 100 } = req.query;
    const filter = { deleted: false };
    if (clientId) filter.clientId = clientId;
    if (scope) filter.scope = scope;
    if (folder) filter.folder = folder;
    if (search) filter.name = { $regex: search, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [documents, total] = await Promise.all([
      Document.find(filter).sort({ type: 1, name: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      Document.countDocuments(filter),
    ]);
    res.status(200).json({ documents, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createDocument = async (req, res) => {
  try {
    const doc = await Document.create({
      ...req.body,
      uploadedById: req.user?.userId,
    });
    await Activity.create({
      type: "Document", item: doc.name, action: "uploaded",
      clientId: doc.clientId, clientName: doc.clientName,
      userId: req.user?.userId, userName: req.user?.email,
    });
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateDocument = async (req, res) => {
  try {
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.status(200).json({ message: "Document deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const documentsController = { getDocuments, getDocument, createDocument, updateDocument, deleteDocument };
export default documentsController;
