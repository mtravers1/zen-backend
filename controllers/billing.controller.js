import Payment from "../database/models/Payment.js";
import Proposal from "../database/models/Proposal.js";
import TimeEntry from "../database/models/TimeEntry.js";
import RecurringInvoice from "../database/models/RecurringInvoice.js";
import Invoice from "../database/models/Invoice.js";
import FirmSettings from "../database/models/FirmSettings.js";

// ── Payments ────────────────────────────────────────────────────
export const listPayments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.status) filter.status = req.query.status;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("clientId", "firstName lastName companyName")
        .populate("invoiceId", "invoiceNumber total")
        .sort({ paymentDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    res.status(200).json({ payments, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("clientId")
      .populate("invoiceId");
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createPayment = async (req, res) => {
  try {
    const payment = await Payment.create({ ...req.body, recordedBy: req.user?.userId });
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    res.status(200).json({ message: "Payment deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Proposals ───────────────────────────────────────────────────
const generateProposalNumber = async (firmId) => {
  const settings = await FirmSettings.findOne({ firmId });
  const prefix = settings?.proposalPrefix || "PROP";
  const startNum = settings?.proposalStartNumber || 1000;
  const count = await Proposal.countDocuments({ firmId });
  return `${prefix}-${startNum + count}`;
};

export const listProposals = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.status) filter.status = req.query.status;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const [proposals, total] = await Promise.all([
      Proposal.find(filter)
        .populate("clientId", "firstName lastName companyName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Proposal.countDocuments(filter),
    ]);

    res.status(200).json({ proposals, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProposalById = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate("clientId")
      .populate("contactId");
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });
    res.status(200).json(proposal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createProposal = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user?.userId };
    if (!data.proposalNumber) {
      data.proposalNumber = await generateProposalNumber(data.firmId);
    }
    const subtotal = (data.lineItems || []).reduce((s, i) => s + (i.amount || 0), 0);
    const taxAmount = subtotal * ((data.taxRate || 0) / 100);
    data.subtotal = subtotal;
    data.taxAmount = taxAmount;
    data.total = subtotal + taxAmount - (data.discountAmount || 0);

    const proposal = await Proposal.create(data);
    res.status(201).json(proposal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });
    res.status(200).json(proposal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const acceptProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "accepted", acceptedAt: new Date(), signedAt: req.body.signedAt, signatureData: req.body.signatureData } },
      { new: true }
    );
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });
    res.status(200).json(proposal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const convertProposalToInvoice = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });

    const invoiceData = {
      firmId: proposal.firmId,
      clientId: proposal.clientId,
      contactId: proposal.contactId,
      createdBy: req.user?.userId,
      proposalId: proposal._id,
      lineItems: proposal.lineItems,
      subtotal: proposal.subtotal,
      taxRate: proposal.taxRate || 0,
      taxAmount: proposal.taxAmount || 0,
      total: proposal.total,
      amountDue: proposal.total,
      notes: proposal.notes,
      status: "draft",
    };

    const settings = await FirmSettings.findOne({ firmId: proposal.firmId });
    const prefix = settings?.invoicePrefix || "INV";
    const startNum = settings?.invoiceStartNumber || 1000;
    const count = await Invoice.countDocuments({ firmId: proposal.firmId });
    invoiceData.invoiceNumber = `${prefix}-${startNum + count}`;

    const invoice = await Invoice.create(invoiceData);
    await Proposal.findByIdAndUpdate(proposal._id, { $set: { convertedToInvoiceId: invoice._id } });

    res.status(201).json({ invoice, proposal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findByIdAndDelete(req.params.id);
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });
    res.status(200).json({ message: "Proposal deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Time Entries ─────────────────────────────────────────────────
export const listTimeEntries = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.jobId) filter.jobId = req.query.jobId;
    if (req.query.billable) filter.billable = req.query.billable === "true";
    if (req.query.billed) filter.billed = req.query.billed === "true";
    if (req.query.status) filter.status = req.query.status;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    const [entries, total] = await Promise.all([
      TimeEntry.find(filter)
        .populate("userId", "name.firstName name.lastName")
        .populate("clientId", "firstName lastName companyName")
        .populate("jobId", "title jobNumber")
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      TimeEntry.countDocuments(filter),
    ]);

    const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
    const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0);

    res.status(200).json({ entries, total, page, limit, totalMinutes, totalAmount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createTimeEntry = async (req, res) => {
  try {
    const data = { ...req.body, userId: req.body.userId || req.user?.userId };
    // Calculate amount
    if (data.billable && data.hourlyRate && data.durationMinutes) {
      data.amount = (data.durationMinutes / 60) * data.hourlyRate;
    }
    const entry = await TimeEntry.create(data);
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!entry) return res.status(404).json({ error: "Time entry not found" });
    res.status(200).json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.findByIdAndDelete(req.params.id);
    if (!entry) return res.status(404).json({ error: "Time entry not found" });
    res.status(200).json({ message: "Time entry deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Recurring Invoices ───────────────────────────────────────────
export const listRecurringInvoices = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.status) filter.status = req.query.status;

    const recurring = await RecurringInvoice.find(filter)
      .populate("clientId", "firstName lastName companyName")
      .sort({ createdAt: -1 });

    res.status(200).json(recurring);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createRecurringInvoice = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user?.userId };
    // Set first invoice date
    data.nextInvoiceDate = data.startDate;
    const subtotal = (data.lineItems || []).reduce((s, i) => s + (i.amount || 0), 0);
    data.subtotal = subtotal;
    data.total = subtotal + subtotal * ((data.taxRate || 0) / 100);

    const recurring = await RecurringInvoice.create(data);
    res.status(201).json(recurring);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateRecurringInvoice = async (req, res) => {
  try {
    const recurring = await RecurringInvoice.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!recurring) return res.status(404).json({ error: "Recurring invoice not found" });
    res.status(200).json(recurring);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteRecurringInvoice = async (req, res) => {
  try {
    const recurring = await RecurringInvoice.findByIdAndDelete(req.params.id);
    if (!recurring) return res.status(404).json({ error: "Recurring invoice not found" });
    res.status(200).json({ message: "Recurring invoice deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── WIP (Work In Progress) ───────────────────────────────────────
export const getWIP = async (req, res) => {
  try {
    const filter = req.query.firmId ? { firmId: req.query.firmId } : {};

    // Unbilled time entries
    const unbilledTime = await TimeEntry.find({ ...filter, billable: true, billed: false })
      .populate("clientId", "firstName lastName companyName")
      .populate("userId", "name.firstName name.lastName")
      .sort({ date: -1 });

    // Draft invoices
    const draftInvoices = await Invoice.find({ ...filter, status: "draft" })
      .populate("clientId", "firstName lastName companyName")
      .sort({ createdAt: -1 });

    // Summary
    const totalUnbilledAmount = unbilledTime.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalUnbilledMinutes = unbilledTime.reduce((sum, e) => sum + e.durationMinutes, 0);
    const totalDraftAmount = draftInvoices.reduce((sum, i) => sum + i.total, 0);

    res.status(200).json({
      unbilledTime,
      draftInvoices,
      summary: {
        unbilledEntries: unbilledTime.length,
        totalUnbilledAmount,
        totalUnbilledMinutes,
        draftInvoiceCount: draftInvoices.length,
        totalDraftAmount,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
