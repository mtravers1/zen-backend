import Document from "../database/models/Document.js";
import Client from "../database/models/Client.js";

const getDocuments = async (req, res) => {
  try {
    const { userId } = req.user;
    const { clientId, type, folder, status, search, page = 1, limit = 50 } = req.query;

    const query = { firmId: userId, deletedAt: null };
    if (clientId) query.clientId = clientId;
    if (type && type !== "all") query.type = type;
    if (folder && folder !== "all") query.folder = folder;
    if (status && status !== "all") query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [documents, total] = await Promise.all([
      Document.find(query)
        .populate("clientId", "name")
        .populate("uploadedBy", "name.first name.last")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Document.countDocuments(query),
    ]);

    res.status(200).json({ documents, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getDocument = async (req, res) => {
  try {
    const { userId } = req.user;
    const { documentId } = req.params;

    const document = await Document.findOne({
      _id: documentId,
      firmId: userId,
      deletedAt: null,
    })
      .populate("clientId", "name")
      .lean();

    if (!document) return res.status(404).json({ message: "Document not found" });
    res.status(200).json(document);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const createDocument = async (req, res) => {
  try {
    const { userId } = req.user;
    const { name, type, clientId, folder, description, tags, fileName, fileUrl, fileSize, mimeType } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "name and type are required" });
    }

    // Verify client belongs to this firm if provided
    if (clientId) {
      const client = await Client.findOne({ _id: clientId, firmId: userId, deletedAt: null });
      if (!client) return res.status(404).json({ message: "Client not found" });
    }

    const parsedTags = tags
      ? tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const document = new Document({
      firmId: userId,
      uploadedBy: userId,
      clientId: clientId || null,
      name,
      type,
      folder: folder || "General",
      description,
      tags: parsedTags,
      fileName,
      fileUrl,
      fileSize: fileSize || 0,
      mimeType,
    });

    await document.save();

    // Link document to client
    if (clientId) {
      await Client.findByIdAndUpdate(clientId, {
        $addToSet: { documentIds: document._id },
      });
    }

    res.status(201).json(document);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const updateDocument = async (req, res) => {
  try {
    const { userId } = req.user;
    const { documentId } = req.params;
    const updates = req.body;

    const document = await Document.findOneAndUpdate(
      { _id: documentId, firmId: userId, deletedAt: null },
      { $set: updates },
      { new: true }
    );

    if (!document) return res.status(404).json({ message: "Document not found" });
    res.status(200).json(document);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const archiveDocument = async (req, res) => {
  try {
    const { userId } = req.user;
    const { documentId } = req.params;

    const document = await Document.findOneAndUpdate(
      { _id: documentId, firmId: userId, deletedAt: null },
      { $set: { status: "archived" } },
      { new: true }
    );

    if (!document) return res.status(404).json({ message: "Document not found" });
    res.status(200).json(document);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { userId } = req.user;
    const { documentId } = req.params;

    const document = await Document.findOneAndUpdate(
      { _id: documentId, firmId: userId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );

    if (!document) return res.status(404).json({ message: "Document not found" });
    res.status(200).json({ message: "Document deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

export default {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  archiveDocument,
  deleteDocument,
};
