import Invoice from "../database/models/Invoice.js";
import Payment from "../database/models/Payment.js";
import Client from "../database/models/Client.js";
import Lead from "../database/models/Lead.js";
import Job from "../database/models/Job.js";
import TimeEntry from "../database/models/TimeEntry.js";

// GET /api/insights/summary
export const getInsightsSummary = async (req, res) => {
  try {
    const { firmId } = req.query;
    const filter = firmId ? { firmId } : {};

    const now = new Date();
    const currentYear = now.getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    // YTD revenue
    const ytdRevenue = await Payment.aggregate([
      { $match: { ...filter, status: "completed", paymentDate: { $gte: startOfYear } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Monthly revenue trend (last 12 months)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthlyRevenue = await Payment.aggregate([
      { $match: { ...filter, status: "completed", paymentDate: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: "$paymentDate" }, month: { $month: "$paymentDate" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Top clients by revenue
    const topClients = await Payment.aggregate([
      { $match: { ...filter, status: "completed" } },
      { $group: { _id: "$clientId", totalRevenue: { $sum: "$amount" }, paymentCount: { $sum: 1 } } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "clients",
          localField: "_id",
          foreignField: "_id",
          as: "client",
        },
      },
    ]);

    // Lead conversion rate
    const totalLeads = await Lead.countDocuments(filter);
    const convertedLeads = await Lead.countDocuments({ ...filter, status: "converted" });
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

    // Average invoice value
    const avgInvoice = await Invoice.aggregate([
      { $match: { ...filter, status: { $ne: "void" } } },
      { $group: { _id: null, avg: { $avg: "$total" }, count: { $sum: 1 } } },
    ]);

    // Job completion rate
    const totalJobs = await Job.countDocuments(filter);
    const completedJobs = await Job.countDocuments({ ...filter, status: "completed" });
    const jobCompletionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

    // Billable hours this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const billableTimeThisMonth = await TimeEntry.aggregate([
      { $match: { ...filter, billable: true, date: { $gte: startOfMonth } } },
      { $group: { _id: null, totalMinutes: { $sum: "$durationMinutes" }, totalAmount: { $sum: "$amount" } } },
    ]);

    res.status(200).json({
      ytdRevenue: ytdRevenue[0]?.total || 0,
      monthlyRevenue,
      topClients,
      leadConversionRate: Math.round(conversionRate * 10) / 10,
      totalLeads,
      convertedLeads,
      avgInvoiceValue: avgInvoice[0]?.avg || 0,
      totalInvoices: avgInvoice[0]?.count || 0,
      jobCompletionRate: Math.round(jobCompletionRate * 10) / 10,
      totalJobs,
      completedJobs,
      billableHoursThisMonth: {
        minutes: billableTimeThisMonth[0]?.totalMinutes || 0,
        amount: billableTimeThisMonth[0]?.totalAmount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/insights/client-performance
export const getClientPerformance = async (req, res) => {
  try {
    const { firmId } = req.query;
    const filter = firmId ? { firmId } : {};

    const clientMetrics = await Payment.aggregate([
      { $match: { ...filter, status: "completed" } },
      {
        $group: {
          _id: "$clientId",
          totalRevenue: { $sum: "$amount" },
          paymentCount: { $sum: 1 },
          lastPayment: { $max: "$paymentDate" },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "clients",
          localField: "_id",
          foreignField: "_id",
          as: "client",
        },
      },
      { $unwind: { path: "$client", preserveNullAndEmpty: true } },
    ]);

    res.status(200).json(clientMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
