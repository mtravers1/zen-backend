import Report from "../database/models/Report.js";
import Invoice from "../database/models/Invoice.js";
import Client from "../database/models/Client.js";
import Task from "../database/models/Task.js";

const getReports = async (req, res) => {
  try {
    const { reportType, search } = req.query;
    const filter = { deleted: false };
    if (reportType) filter.reportType = reportType;
    if (search) filter.name = { $regex: search, $options: "i" };

    const reports = await Report.find(filter).sort({ name: 1 }).lean();
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReport = async (req, res) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!report) return res.status(404).json({ message: "Report not found" });
    // Update lastViewed
    await Report.findByIdAndUpdate(req.params.id, { lastViewed: new Date() });
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createReport = async (req, res) => {
  try {
    const report = await Report.create({ ...req.body, createdById: req.user?.userId });
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateReport = async (req, res) => {
  try {
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteReport = async (req, res) => {
  try {
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.status(200).json({ message: "Report deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /api/reports/insights – aggregated KPI data for the Insights page */
const getInsights = async (req, res) => {
  try {
    const { period = "30d" } = req.query;

    // Determine date range
    const now = new Date();
    const periodMap = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
    const days = periodMap[period] || 30;
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [totalRevenue, activeClients, paidInvoices, totalTasks] = await Promise.all([
      Invoice.aggregate([
        { $match: { status: "paid", deleted: false, postedDate: { $gte: since } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Client.countDocuments({ status: "active", deleted: false }),
      Invoice.countDocuments({ status: "paid", deleted: false, postedDate: { $gte: since } }),
      Task.countDocuments({ deleted: false }),
    ]);

    const revenue = totalRevenue[0]?.total ?? 0;
    const avgRevenuePerClient = activeClients > 0 ? revenue / activeClients : 0;

    res.status(200).json({
      period,
      stats: {
        totalRevenue: revenue,
        activeClients,
        paidInvoices,
        totalTasks,
        avgRevenuePerClient: Math.round(avgRevenuePerClient * 100) / 100,
      },
    });
  } catch (error) {
    console.error("[REPORTS] getInsights error:", error);
    res.status(500).json({ message: error.message });
  }
};

const reportsController = { getReports, getReport, createReport, updateReport, deleteReport, getInsights };
export default reportsController;
