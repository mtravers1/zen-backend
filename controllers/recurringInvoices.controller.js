import RecurringInvoice from "../database/models/RecurringInvoice.js";

const getCrud = (Model, name) => ({
  async getAll(req, res) {
    try {
      const { status, clientId } = req.query;
      const filter = { deleted: false };
      if (status) filter.status = status;
      if (clientId) filter.clientId = clientId;
      const items = await Model.find(filter).sort({ createdAt: -1 }).lean();
      res.status(200).json(items);
    } catch (error) { res.status(500).json({ message: error.message }); }
  },
  async getOne(req, res) {
    try {
      const item = await Model.findOne({ _id: req.params.id, deleted: false }).lean();
      if (!item) return res.status(404).json({ message: `${name} not found` });
      res.status(200).json(item);
    } catch (error) { res.status(500).json({ message: error.message }); }
  },
  async create(req, res) {
    try {
      const item = await Model.create(req.body);
      res.status(201).json(item);
    } catch (error) { res.status(500).json({ message: error.message }); }
  },
  async update(req, res) {
    try {
      const item = await Model.findOneAndUpdate(
        { _id: req.params.id, deleted: false },
        req.body,
        { new: true, runValidators: true }
      ).lean();
      if (!item) return res.status(404).json({ message: `${name} not found` });
      res.status(200).json(item);
    } catch (error) { res.status(500).json({ message: error.message }); }
  },
  async remove(req, res) {
    try {
      const item = await Model.findOneAndUpdate(
        { _id: req.params.id, deleted: false },
        { deleted: true },
        { new: true }
      );
      if (!item) return res.status(404).json({ message: `${name} not found` });
      res.status(200).json({ message: `${name} deleted` });
    } catch (error) { res.status(500).json({ message: error.message }); }
  },
});

const recurringInvoicesController = getCrud(RecurringInvoice, "Recurring invoice");
export default recurringInvoicesController;
