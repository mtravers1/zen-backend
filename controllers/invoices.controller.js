import Invoice from "../database/models/Invoice.js";
import Activity from "../database/models/Activity.js";

const getInvoices = async (req, res) => {
  try {
    const { status, clientId, assignee, page = 1, limit = 50 } = req.query;
    const filter = { deleted: false };
    if (status) filter.status = status;
    if (clientId) filter.clientId = clientId;
    if (assignee) filter.assignee = { $regex: assignee, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(filter).sort({ postedDate: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Invoice.countDocuments(filter),
    ]);
    res.status(200).json({ invoices, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("[INVOICES] getInvoices error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.status(200).json(invoice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createInvoice = async (req, res) => {
  try {
    // Auto-generate invoice number if not provided
    if (!req.body.invoiceNumber) {
      const count = await Invoice.countDocuments();
      req.body.invoiceNumber = `INV-${String(count + 1).padStart(3, "0")}`;
    }
    const invoice = await Invoice.create(req.body);
    await Activity.create({
      type: "Invoice", item: invoice.invoiceNumber, action: "created",
      clientId: invoice.clientId, clientName: invoice.clientName,
      userId: req.user?.userId, userName: req.user?.email,
    });
    res.status(201).json(invoice);
  } catch (error) {
    console.error("[INVOICES] createInvoice error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.status(200).json(invoice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.status(200).json({ message: "Invoice deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const invoicesController = { getInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice };
export default invoicesController;
