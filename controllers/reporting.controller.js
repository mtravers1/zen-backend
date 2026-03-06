import Report from "../database/models/Report.js";
import Alert from "../database/models/Alert.js";
import Invoice from "../database/models/Invoice.js";
import Payment from "../database/models/Payment.js";
import Lead from "../database/models/Lead.js";
import Client from "../database/models/Client.js";
import Job from "../database/models/Job.js";
import Task from "../database/models/Task.js";
import TimeEntry from "../database/models/TimeEntry.js";
import ActivityLog from "../database/models/ActivityLog.js";

// ── Dashboard Overview ─────────────────────────────────────────────
export const getDashboardOverview = async (req, res) => {
  try {
    const { firmId } = req.query;
    const filter = firmId ? { firmId } : {};

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      // Revenue
      currentMonthRevenue,
      lastMonthRevenue,
      // Outstanding
      outstandingInvoices,
      overdueInvoices,
      // Leads
      totalLeads,
      newLeadsThisMonth,
      // Clients
      activeClients,
      newClientsThisMonth,
      // Jobs
      activeJobs,
      completedJobsThisMonth,
      // Tasks
      overdueTasks,
      tasksDueToday,
      // Recent activity
      recentActivity,
    ] = await Promise.all([
      // Current month payments
      Payment.aggregate([
        { $match: { ...filter, status: "completed", paymentDate: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // Last month payments
      Payment.aggregate([
        { $match: { ...filter, status: "completed", paymentDate: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // Outstanding invoices
      Invoice.aggregate([
        { $match: { ...filter, status: { $in: ["sent", "partial", "viewed"] } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amountDue" } } },
      ]),
      // Overdue invoices
      Invoice.aggregate([
        { $match: { ...filter, status: "overdue" } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amountDue" } } },
      ]),
      Lead.countDocuments(filter),
      Lead.countDocuments({ ...filter, createdAt: { $gte: startOfMonth } }),
      Client.countDocuments({ ...filter, status: "active" }),
      Client.countDocuments({ ...filter, createdAt: { $gte: startOfMonth } }),
      Job.countDocuments({ ...filter, status: { $in: ["in_progress", "not_started"] } }),
      Job.countDocuments({ ...filter, status: "completed", completedAt: { $gte: startOfMonth } }),
      Task.countDocuments({ ...filter, dueDate: { $lt: now }, status: { $nin: ["done", "cancelled"] } }),
      Task.countDocuments({
        ...filter,
        dueDate: { $gte: new Date(now.setHours(0,0,0,0)), $lt: new Date(now.setHours(23,59,59,999)) },
        status: { $nin: ["done", "cancelled"] },
      }),
      ActivityLog.find(filter).sort({ createdAt: -1 }).limit(10)
        .populate("userId", "name.firstName name.lastName"),
    ]);

    const currentRevenue = currentMonthRevenue[0]?.total || 0;
    const lastRevenue = lastMonthRevenue[0]?.total || 0;
    const revenueGrowth = lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue) * 100 : 0;

    res.status(200).json({
      revenue: {
        currentMonth: currentRevenue,
        lastMonth: lastRevenue,
        growth: Math.round(revenueGrowth * 10) / 10,
      },
      invoices: {
        outstanding: {
          count: outstandingInvoices[0]?.count || 0,
          total: outstandingInvoices[0]?.total || 0,
        },
        overdue: {
          count: overdueInvoices[0]?.count || 0,
          total: overdueInvoices[0]?.total || 0,
        },
      },
      leads: {
        total: totalLeads,
        newThisMonth: newLeadsThisMonth,
      },
      clients: {
        active: activeClients,
        newThisMonth: newClientsThisMonth,
      },
      jobs: {
        active: activeJobs,
        completedThisMonth: completedJobsThisMonth,
      },
      tasks: {
        overdue: overdueTasks,
        dueToday: tasksDueToday,
      },
      recentActivity,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/reporting/revenue
export const getRevenueReport = async (req, res) => {
  try {
    const filter = req.query.firmId ? { firmId: req.query.firmId } : {};
    const months = parseInt(req.query.months) || 12;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months + 1);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const revenue = await Payment.aggregate([
      { $match: { ...filter, status: "completed", paymentDate: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" },
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.status(200).json(revenue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/reporting/lead-funnel
export const getLeadFunnelReport = async (req, res) => {
  try {
    const filter = req.query.firmId ? { firmId: req.query.firmId } : {};

    const funnel = await Lead.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const bySource = await Lead.aggregate([
      { $match: filter },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({ funnel, bySource });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/reporting/time-tracking
export const getTimeTrackingReport = async (req, res) => {
  try {
    const filter = req.query.firmId ? { firmId: req.query.firmId } : {};

    const byUser = await TimeEntry.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$userId",
          totalMinutes: { $sum: "$durationMinutes" },
          billableMinutes: { $sum: { $cond: ["$billable", "$durationMinutes", 0] } },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $sort: { totalMinutes: -1 } },
    ]);

    const byClient = await TimeEntry.aggregate([
      { $match: { ...filter, clientId: { $exists: true } } },
      {
        $group: {
          _id: "$clientId",
          totalMinutes: { $sum: "$durationMinutes" },
          billableMinutes: { $sum: { $cond: ["$billable", "$durationMinutes", 0] } },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $lookup: {
          from: "clients",
          localField: "_id",
          foreignField: "_id",
          as: "client",
        },
      },
      { $sort: { totalMinutes: -1 } },
    ]);

    res.status(200).json({ byUser, byClient });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Reports ───────────────────────────────────────────────────────
export const listReports = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.type) filter.type = req.query.type;

    const reports = await Report.find(filter)
      .populate("createdBy", "name.firstName name.lastName")
      .sort({ createdAt: -1 });

    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getReportById = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createReport = async (req, res) => {
  try {
    const report = await Report.create({ ...req.body, createdBy: req.user?.userId });
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateReport = async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteReport = async (req, res) => {
  try {
    await Report.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Report deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Alerts ────────────────────────────────────────────────────────
export const listAlerts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";

    const alerts = await Alert.find(filter)
      .populate("createdBy", "name.firstName name.lastName")
      .sort({ createdAt: -1 });

    res.status(200).json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createAlert = async (req, res) => {
  try {
    const alert = await Alert.create({ ...req.body, createdBy: req.user?.userId });
    res.status(201).json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.status(200).json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteAlert = async (req, res) => {
  try {
    await Alert.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Alert deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Activity Feed ─────────────────────────────────────────────────
export const getActivityFeed = async (req, res) => {
  try {
    const filter = {};
    if (req.query.firmId) filter.firmId = req.query.firmId;
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.entityType) filter.entityType = req.query.entityType;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    const [activities, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate("userId", "name.firstName name.lastName profilePhotoUrl")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ActivityLog.countDocuments(filter),
    ]);

    res.status(200).json({ activities, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
