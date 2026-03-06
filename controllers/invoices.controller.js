import Invoice from "../database/models/Invoice.js";
import Payment from "../database/models/Payment.js";
import FirmSettings from "../database/models/FirmSettings.js";
import ActivityLog from "../database/models/ActivityLog.js";

const logActivity = async (firmId, userId, action, entityId, entityName) => {
  try {
    await ActivityLog.create({ firmId, userId, action, entityType: "invoice", entityId, entityName });
  } catch (_) {}
};

// Generate next invoice number
const generateInvoiceNumber = async (firmId) => {
  const settings = await FirmSettings.findOne({ firmId });
  const prefix = settings?.invoicePrefix || "INV";
  const startNum = settings?.invoiceStartNumber || 1000;
  const count = await Invoice.countDocuments({ firmId });
  return `${prefix}-${startNum + count}`;
};

// GET /api/billing/invoices
const listInvoices = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.status) filter.status = req.query.status;

    if (req.query.search) {
      filter.invoiceNumber = { $regex: req.query.search, $options: "i" };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate("clientId", "firstName lastName companyName email")
        .populate("createdBy", "name.firstName name.lastName")
        .sort({ issueDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Invoice.countDocuments(filter),
    ]);

    res.status(200).json({ invoices, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/billing/invoices/stats
const getInvoiceStats = async (req, res) => {
  try {
    const filter = req.query.firmId ? { firmId: req.query.firmId } : {};

    const stats = await Invoice.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$total" },
          totalDue: { $sum: "$amountDue" },
        },
      },
    ]);

    const result = {
      draft: { count: 0, totalAmount: 0 },
      sent: { count: 0, totalAmount: 0 },
      paid: { count: 0, totalAmount: 0 },
      overdue: { count: 0, totalAmount: 0 },
      totalRevenue: 0,
      totalOutstanding: 0,
    };

    stats.forEach(({ _id, count, totalAmount, totalDue }) => {
      if (result[_id] !== undefined) {
        result[_id] = { count, totalAmount };
      }
      if (_id === "paid") result.totalRevenue += totalAmount;
      if (["sent", "partial", "overdue"].includes(_id)) result.totalOutstanding += totalDue;
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/billing/invoices/:id
const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("clientId")
      .populate("contactId")
      .populate("createdBy", "name.firstName name.lastName email");
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.status(200).json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/billing/invoices
const createInvoice = async (req, res) => {
  try {
    const invoiceData = { ...req.body };
    if (!invoiceData.invoiceNumber) {
      invoiceData.invoiceNumber = await generateInvoiceNumber(invoiceData.firmId);
    }
    // Calculate totals
    const subtotal = (invoiceData.lineItems || []).reduce((sum, item) => sum + (item.amount || 0), 0);
    const taxAmount = subtotal * ((invoiceData.taxRate || 0) / 100);
    const discountAmount = invoiceData.discountAmount || 0;
    const total = subtotal + taxAmount - discountAmount;

    invoiceData.subtotal = subtotal;
    invoiceData.taxAmount = taxAmount;
    invoiceData.total = total;
    invoiceData.amountDue = total - (invoiceData.amountPaid || 0);
    invoiceData.createdBy = req.user?.userId;

    const invoice = await Invoice.create(invoiceData);
    await logActivity(invoiceData.firmId, req.user?.userId, "created", invoice._id, invoice.invoiceNumber);
    res.status(201).json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/billing/invoices/:id
const updateInvoice = async (req, res) => {
  try {
    const updates = { ...req.body };
    // Recalculate totals if line items changed
    if (updates.lineItems) {
      const subtotal = updates.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      const invoice = await Invoice.findById(req.params.id);
      const taxRate = updates.taxRate ?? invoice?.taxRate ?? 0;
      const taxAmount = subtotal * (taxRate / 100);
      const discountAmount = updates.discountAmount ?? invoice?.discountAmount ?? 0;
      const total = subtotal + taxAmount - discountAmount;
      updates.subtotal = subtotal;
      updates.taxAmount = taxAmount;
      updates.total = total;
      updates.amountDue = total - (updates.amountPaid ?? invoice?.amountPaid ?? 0);
    }

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).populate("clientId");

    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.status(200).json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/billing/invoices/:id/send
const sendInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "sent" } },
      { new: true }
    ).populate("clientId");
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    // TODO: send email notification
    await logActivity(invoice.firmId, req.user?.userId, "sent", invoice._id, invoice.invoiceNumber);
    res.status(200).json({ message: "Invoice sent", invoice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/billing/invoices/:id/record-payment
const recordPayment = async (req, res) => {
  try {
    const { amount, method, paymentDate, reference, notes } = req.body;
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const payment = await Payment.create({
      firmId: invoice.firmId,
      clientId: invoice.clientId,
      invoiceId: invoice._id,
      recordedBy: req.user?.userId,
      amount,
      method,
      paymentDate: paymentDate || new Date(),
      reference,
      notes,
      status: "completed",
    });

    const newAmountPaid = (invoice.amountPaid || 0) + amount;
    const newAmountDue = invoice.total - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? "paid" : "partial";

    const updatedInvoice = await Invoice.findByIdAndUpdate(
      invoice._id,
      {
        $set: {
          amountPaid: newAmountPaid,
          amountDue: Math.max(0, newAmountDue),
          status: newStatus,
          paidDate: newStatus === "paid" ? new Date() : undefined,
        },
      },
      { new: true }
    );

    await logActivity(invoice.firmId, req.user?.userId, "payment_recorded", invoice._id, invoice.invoiceNumber);
    res.status(200).json({ invoice: updatedInvoice, payment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/billing/invoices/:id
const deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.status(200).json({ message: "Invoice deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const invoicesController = {
  listInvoices, getInvoiceStats, getInvoiceById,
  createInvoice, updateInvoice, sendInvoice, recordPayment, deleteInvoice,
};
export default invoicesController;
