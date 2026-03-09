import Proposal from "../database/models/Proposal.js";
import Activity from "../database/models/Activity.js";

const getProposals = async (req, res) => {
  try {
    const { status, clientId, page = 1, limit = 50 } = req.query;
    const filter = { deleted: false };
    if (status) filter.status = status;
    if (clientId) filter.clientId = clientId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [proposals, total] = await Promise.all([
      Proposal.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Proposal.countDocuments(filter),
    ]);
    res.status(200).json({ proposals, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!proposal) return res.status(404).json({ message: "Proposal not found" });
    res.status(200).json(proposal);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createProposal = async (req, res) => {
  try {
    const proposal = await Proposal.create(req.body);
    await Activity.create({
      type: "Proposal", item: proposal.name, action: "created",
      clientId: proposal.clientId, clientName: proposal.clientName,
      userId: req.user?.userId, userName: req.user?.email,
    });
    res.status(201).json(proposal);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!proposal) return res.status(404).json({ message: "Proposal not found" });
    res.status(200).json(proposal);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!proposal) return res.status(404).json({ message: "Proposal not found" });
    res.status(200).json({ message: "Proposal deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const proposalsController = { getProposals, getProposal, createProposal, updateProposal, deleteProposal };
export default proposalsController;
