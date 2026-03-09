import Payment from "../database/models/Payment.js";
import Activity from "../database/models/Activity.js";

const getPayments = async (req, res) => {
  try {
    const { status, clientId, page = 1, limit = 50 } = req.query;
    const filter = { deleted: false };
    if (status) filter.status = status;
    if (clientId) filter.clientId = clientId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Payment.countDocuments(filter),
    ]);
    res.status(200).json({ payments, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("[FIRM PAYMENTS] getPayments error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getPayment = async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createPayment = async (req, res) => {
  try {
    if (!req.body.paymentNumber) {
      const count = await Payment.countDocuments();
      req.body.paymentNumber = `PAY-${String(count + 1).padStart(3, "0")}`;
    }
    const payment = await Payment.create(req.body);
    await Activity.create({
      type: "Payment", item: payment.paymentNumber, action: "created",
      clientId: payment.clientId, clientName: payment.clientName,
      userId: req.user?.userId, userName: req.user?.email,
    });
    res.status(201).json(payment);
  } catch (error) {
    console.error("[FIRM PAYMENTS] createPayment error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.status(200).json({ message: "Payment deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const firmPaymentsController = { getPayments, getPayment, createPayment, updatePayment, deletePayment };
export default firmPaymentsController;
