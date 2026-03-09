#!/usr/bin/env node
/**
 * seed-dashboard.js
 *
 * Populates the MongoDB database with placeholder data that mirrors the
 * dummy/mock data used across the zen-frontend dashboard and portal pages.
 *
 * Run with:
 *   node scripts/seed-dashboard.js
 *   # or via package.json script:
 *   npm run seed:dashboard
 */

import "dotenv/config";
import mongoose from "mongoose";

// ── Model imports ─────────────────────────────────────────────────────────
import Client from "../database/models/Client.js";
import Contact from "../database/models/Contact.js";
import Invoice from "../database/models/Invoice.js";
import Payment from "../database/models/Payment.js";
import TimeEntry from "../database/models/TimeEntry.js";
import RecurringInvoice from "../database/models/RecurringInvoice.js";
import Proposal from "../database/models/Proposal.js";
import Pipeline from "../database/models/Pipeline.js";
import Job from "../database/models/Job.js";
import Task from "../database/models/Task.js";
import Message from "../database/models/Message.js";
import Activity from "../database/models/Activity.js";
import Template from "../database/models/Template.js";
import Report from "../database/models/Report.js";
import Offer from "../database/models/Offer.js";
import Notification from "../database/models/Notification.js";
import FirmService from "../database/models/FirmService.js";
import ClientService from "../database/models/ClientService.js";
import Document from "../database/models/Document.js";
import StaffMember from "../database/models/StaffMember.js";

// ─────────────────────────────────────────────────────────────────────────────

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const db = process.env.MONGODB_DB || "zentavos_dev";
  await mongoose.connect(`${uri}/${db}`, {
    auth: process.env.MONGODB_USER
      ? { username: process.env.MONGODB_USER, password: process.env.MONGODB_PASS }
      : undefined,
  });
  console.log(`✅  Connected to MongoDB: ${db}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SEED FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function seedStaffMembers() {
  const count = await StaffMember.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Staff members already seeded (${count} found). Skipping.`);
    return {};
  }

  const members = await StaffMember.insertMany([
    { firstName: "John",  lastName: "Director",  email: "john.director@zentavos.com",  role: "director",            title: "Managing Director",    isActive: true },
    { firstName: "Sarah", lastName: "Manager",   email: "sarah.manager@zentavos.com",  role: "executive_manager",   title: "Executive Manager",    isActive: true },
    { firstName: "Mike",  lastName: "Account",   email: "mike.account@zentavos.com",   role: "account_manager",     title: "Senior Accountant",    isActive: true },
    { firstName: "Lisa",  lastName: "Assistant", email: "lisa.assistant@zentavos.com", role: "executive_assistant", title: "Executive Assistant",  isActive: true },
    { firstName: "Tom",   lastName: "Analyst",   email: "tom.analyst@zentavos.com",    role: "account_manager",     title: "Financial Analyst",    isActive: true },
  ]);

  const byName = {};
  members.forEach((m) => { byName[`${m.firstName} ${m.lastName}`] = m; });
  console.log(`  ✅  Seeded ${members.length} staff members`);
  return byName;
}

async function seedClients() {
  const count = await Client.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Clients already seeded (${count} found). Skipping.`);
    const clients = await Client.find({ deleted: false }).lean();
    const map = {};
    clients.forEach((c) => { map[c.name] = c; });
    return map;
  }

  const clients = await Client.insertMany([
    { name: "Smith Corporation",   type: "Business",   assignee: "John Doe",    email: "contact@smithcorp.com",    phone: "(555) 123-4567", status: "active",   balance: 525000  },
    { name: "Johnson LLC",         type: "Business",   assignee: "Jane Smith",  email: "info@johnsonllc.com",      phone: "(555) 234-5678", status: "active",   balance: 0       },
    { name: "Brown & Associates",  type: "Business",   assignee: "Mike Johnson",email: "hello@brownassoc.com",     phone: "(555) 345-6789", status: "active",   balance: 120000  },
    { name: "Emily Davis",         type: "Individual", assignee: "Sarah Wilson",email: "emily@email.com",          phone: "(555) 456-7890", status: "inactive", balance: 0       },
    { name: "Wilson Group",        type: "Business",   assignee: "John Doe",    email: "contact@wilsongroup.com",  phone: "(555) 567-8901", status: "active",   balance: 350000  },
    // Additional clients referenced in other dummy data
    { name: "Acme Corp",           type: "Business",   assignee: "John D.",     email: "contact@acmecorp.com",     phone: "(555) 001-0001", status: "active",   balance: 0       },
    { name: "Tech Solutions",      type: "Business",   assignee: "Sarah M.",    email: "info@techsolutions.com",   phone: "(555) 001-0002", status: "active",   balance: 350000  },
    { name: "Global Industries",   type: "Business",   assignee: "Mike R.",     email: "info@globalind.com",       phone: "(555) 001-0003", status: "active",   balance: 820000  },
    { name: "StartUp Inc",         type: "Business",   assignee: "John D.",     email: "hello@startupinc.com",     phone: "(555) 001-0004", status: "active",   balance: 0       },
    { name: "Enterprise Ltd",      type: "Business",   assignee: "Sarah M.",    email: "info@enterpriseltd.com",   phone: "(555) 001-0005", status: "active",   balance: 680000  },
    { name: "Davis Industries",    type: "Business",   assignee: "Sarah Wilson",email: "info@davisind.com",        phone: "(555) 001-0006", status: "active",   balance: 0       },
  ]);

  const map = {};
  clients.forEach((c) => { map[c.name] = c; });
  console.log(`  ✅  Seeded ${clients.length} clients`);
  return map;
}

async function seedContacts(clientMap) {
  const count = await Contact.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Contacts already seeded (${count} found). Skipping.`);
    return;
  }

  await Contact.insertMany([
    { clientId: clientMap["Acme Corp"]?._id,          name: "John Smith",    initials: "JS", role: "CEO",        email: "john.smith@acmecorp.com",     phone: "(555) 100-0001", isPrimary: true  },
    { clientId: clientMap["Tech Solutions"]?._id,     name: "Sarah Johnson", initials: "SJ", role: "CFO",        email: "sarah.johnson@techsol.com",   phone: "(555) 100-0002", isPrimary: true  },
    { clientId: clientMap["Global Industries"]?._id,  name: "Michael Brown", initials: "MB", role: "Partner",    email: "michael.brown@globalind.com", phone: "(555) 100-0003", isPrimary: true  },
    { clientId: clientMap["Davis Industries"]?._id,   name: "Emily Davis",   initials: "ED", role: "Controller", email: "emily.davis@davisind.com",    phone: "(555) 100-0004", isPrimary: true  },
    { clientId: clientMap["Wilson Group"]?._id,       name: "Robert Wilson", initials: "RW", role: "Owner",      email: "robert.wilson@wilsongrp.com", phone: "(555) 100-0005", isPrimary: true  },
  ]);

  console.log("  ✅  Seeded contacts");
}

async function seedInvoices(clientMap) {
  const count = await Invoice.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Invoices already seeded (${count} found). Skipping.`);
    const invs = await Invoice.find({ deleted: false }).lean();
    const map = {};
    invs.forEach((i) => { map[i.invoiceNumber] = i; });
    return map;
  }

  const invoices = await Invoice.insertMany([
    // Staff dashboard invoices (from DashboardDataContext)
    { invoiceNumber: "INV-001", clientId: clientMap["Acme Corp"]?._id,        clientName: "Acme Corp",       assignee: "John D.",  status: "paid",    postedDate: daysAgo(30), dueDate: daysAgo(20), total: 5000 },
    { invoiceNumber: "INV-002", clientId: clientMap["Tech Solutions"]?._id,   clientName: "Tech Solutions",  assignee: "Sarah M.", status: "unpaid",  postedDate: daysAgo(27), dueDate: daysFromNow(3), total: 3500 },
    { invoiceNumber: "INV-003", clientId: clientMap["Global Industries"]?._id,clientName: "Global Industries",assignee: "Mike R.",  status: "overdue", postedDate: daysAgo(35), dueDate: daysAgo(5),  total: 8200 },
    { invoiceNumber: "INV-004", clientId: clientMap["StartUp Inc"]?._id,      clientName: "StartUp Inc",     assignee: "John D.",  status: "paid",    postedDate: daysAgo(25), dueDate: daysAgo(15), total: 2100 },
    { invoiceNumber: "INV-005", clientId: clientMap["Enterprise Ltd"]?._id,   clientName: "Enterprise Ltd",  assignee: "Sarah M.", status: "unpaid",  postedDate: daysAgo(23), dueDate: daysFromNow(7), total: 6800 },
    // Portal billing invoices
    { invoiceNumber: "INV-042", clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", assignee: "John D.", status: "unpaid", postedDate: daysAgo(5),  dueDate: daysFromNow(25), total: 2500 },
    { invoiceNumber: "INV-038", clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", assignee: "John D.", status: "paid",   postedDate: daysAgo(35), dueDate: daysAgo(5),  total: 1200 },
    { invoiceNumber: "INV-035", clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", assignee: "John D.", status: "paid",   postedDate: daysAgo(65), dueDate: daysAgo(35), total: 899  },
    { invoiceNumber: "INV-031", clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", assignee: "John D.", status: "paid",   postedDate: daysAgo(95), dueDate: daysAgo(65), total: 750  },
  ]);

  const map = {};
  invoices.forEach((i) => { map[i.invoiceNumber] = i; });
  console.log(`  ✅  Seeded ${invoices.length} invoices`);
  return map;
}

async function seedPayments(clientMap, invoiceMap) {
  const count = await Payment.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Payments already seeded (${count} found). Skipping.`);
    return;
  }

  await Payment.insertMany([
    // Staff dashboard payments
    { paymentNumber: "PAY-001", clientId: clientMap["Acme Corp"]?._id,        clientName: "Acme Corp",       date: daysAgo(20), status: "completed", amount: 5000, paymentMethod: "Credit Card" },
    { paymentNumber: "PAY-002", clientId: clientMap["Tech Solutions"]?._id,   clientName: "Tech Solutions",  date: daysAgo(15), status: "pending",   amount: 3500, paymentMethod: "ACH" },
    { paymentNumber: "PAY-003", clientId: clientMap["Global Industries"]?._id,clientName: "Global Industries",date: daysAgo(10), status: "refunded",  amount: 8200, paymentMethod: "Wire" },
    { paymentNumber: "PAY-004", clientId: clientMap["StartUp Inc"]?._id,      clientName: "StartUp Inc",     date: daysAgo(8),  status: "completed", amount: 2100, paymentMethod: "Credit Card" },
    { paymentNumber: "PAY-005", clientId: clientMap["Enterprise Ltd"]?._id,   clientName: "Enterprise Ltd",  date: daysAgo(3),  status: "pending",   amount: 6800, paymentMethod: "ACH" },
    // Portal payments
    { paymentNumber: "PAY-015", clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", invoiceId: invoiceMap?.["INV-038"]?._id, invoiceNumber: "INV-038", date: daysAgo(30), status: "completed", amount: 1200, paymentMethod: "Credit Card" },
    { paymentNumber: "PAY-012", clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", invoiceId: invoiceMap?.["INV-035"]?._id, invoiceNumber: "INV-035", date: daysAgo(60), status: "completed", amount: 899,  paymentMethod: "ACH" },
    { paymentNumber: "PAY-009", clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", invoiceId: invoiceMap?.["INV-031"]?._id, invoiceNumber: "INV-031", date: daysAgo(90), status: "completed", amount: 750,  paymentMethod: "ACH" },
  ]);

  console.log("  ✅  Seeded payments");
}

async function seedTimeEntries(clientMap) {
  const count = await TimeEntry.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Time entries already seeded (${count} found). Skipping.`);
    return;
  }

  await TimeEntry.insertMany([
    { name: "Project Research",    clientId: clientMap["Acme Corp"]?._id,        clientName: "Acme Corp",       assignee: "John D.",  date: daysAgo(7),  type: "Billable",     service: "Research",     duration: "2:30", durationMinutes: 150, timerStatus: "idle", billed: true  },
    { name: "Client Meeting",      clientId: clientMap["Tech Solutions"]?._id,   clientName: "Tech Solutions",  assignee: "Sarah M.", date: daysAgo(6),  type: "Billable",     service: "Consulting",   duration: "1:00", durationMinutes: 60,  timerStatus: "idle", billed: false },
    { name: "Documentation",       clientId: clientMap["Global Industries"]?._id,clientName: "Global Industries",assignee: "Mike R.", date: daysAgo(5),  type: "Non-billable", service: "Admin",        duration: "0:45", durationMinutes: 45,  timerStatus: "idle", billed: false },
    { name: "Code Review",         clientId: clientMap["StartUp Inc"]?._id,      clientName: "StartUp Inc",     assignee: "John D.",  date: daysAgo(4),  type: "Billable",     service: "Development",  duration: "1:30", durationMinutes: 90,  timerStatus: "idle", billed: false },
    { name: "Strategy Session",    clientId: clientMap["Enterprise Ltd"]?._id,   clientName: "Enterprise Ltd",  assignee: "Sarah M.", date: daysAgo(3),  type: "Billable",     service: "Advisory",     duration: "2:00", durationMinutes: 120, timerStatus: "idle", billed: true  },
  ]);

  console.log("  ✅  Seeded time entries");
}

async function seedRecurringInvoices(clientMap) {
  const count = await RecurringInvoice.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Recurring invoices already seeded (${count} found). Skipping.`);
    return;
  }

  await RecurringInvoice.insertMany([
    { name: "Monthly Retainer",     clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", status: "active",   paymentMethod: "ACH",         amount: 2500, balance: 0,    frequency: "monthly",   nextBilling: daysFromNow(15) },
    { name: "Support Plan",         clientId: clientMap["Johnson LLC"]?._id,       clientName: "Johnson LLC",       status: "active",   paymentMethod: "Credit Card", amount: 1500, balance: 1500, frequency: "monthly",   nextBilling: daysFromNow(7)  },
    { name: "Enterprise License",   clientId: clientMap["Enterprise Ltd"]?._id,    clientName: "Enterprise Ltd",    status: "active",   paymentMethod: "Wire",        amount: 5000, balance: 0,    frequency: "monthly",   nextBilling: daysFromNow(1)  },
    { name: "Starter Package",      clientId: clientMap["StartUp Inc"]?._id,       clientName: "StartUp Inc",       status: "inactive", paymentMethod: "ACH",         amount: 500,  balance: 500,  frequency: "monthly",   nextBilling: null            },
  ]);

  console.log("  ✅  Seeded recurring invoices");
}

async function seedProposals(clientMap) {
  const count = await Proposal.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Proposals already seeded (${count} found). Skipping.`);
    return;
  }

  await Proposal.insertMany([
    { name: "Q1 Service Package",  clientId: clientMap["Acme Corp"]?._id,        clientName: "Acme Corp",       status: "sent",   paymentMethod: "ACH",  date: daysAgo(10), signed: false, totalAmount: 12000 },
    { name: "Annual Retainer",     clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation",status: "signed", paymentMethod: "Wire", date: daysAgo(30), signed: true,  signedAt: daysAgo(25), totalAmount: 36000 },
    { name: "Enterprise Deal",     clientId: clientMap["Enterprise Ltd"]?._id,   clientName: "Enterprise Ltd",  status: "draft",  paymentMethod: "Wire", date: daysAgo(5),  signed: false, totalAmount: 60000 },
    { name: "Starter Plan",        clientId: clientMap["StartUp Inc"]?._id,      clientName: "StartUp Inc",     status: "viewed", paymentMethod: "ACH",  date: daysAgo(7),  signed: false, totalAmount: 6000  },
  ]);

  console.log("  ✅  Seeded proposals");
}

async function seedPipelinesAndJobs(clientMap) {
  const pipelineCount = await Pipeline.countDocuments({ deleted: false });
  if (pipelineCount > 0) {
    console.log(`  ⏭  Pipelines already seeded (${pipelineCount} found). Skipping.`);
    const pipelines = await Pipeline.find({ deleted: false }).lean();
    const map = {};
    pipelines.forEach((p) => { map[p.name] = p; });
    return map;
  }

  const pipelines = await Pipeline.insertMany([
    {
      name: "CFO Client Workflow", numJobs: 89,
      stages: [
        { name: "Receive Client Documents", order: 0 },
        { name: "Bookkeeping Transactions",  order: 1 },
        { name: "Journal Entries",           order: 2 },
        { name: "Account Reconciliations",   order: 3 },
        { name: "Monthly Reporting",         order: 4 },
      ],
    },
    {
      name: "Tax Client Workflow", numJobs: 156,
      stages: [
        { name: "Receive Client Documents", order: 0 },
        { name: "Prepare Tax File",         order: 1 },
        { name: "Prepare Tax Return",       order: 2 },
        { name: "Customer Review",          order: 3 },
        { name: "Adjustments",             order: 4 },
        { name: "Manager Review",          order: 5 },
        { name: "Final Delivery",          order: 6 },
        { name: "E-File",                  order: 7 },
      ],
    },
    {
      name: "Audit Pipeline", numJobs: 23,
      stages: [
        { name: "Planning",          order: 0 },
        { name: "Fieldwork",         order: 1 },
        { name: "Draft Report",      order: 2 },
        { name: "Management Review", order: 3 },
        { name: "Client Review",     order: 4 },
        { name: "Final Report",      order: 5 },
        { name: "Follow-up",         order: 6 },
      ],
    },
    {
      name: "Payroll Pipeline", numJobs: 45,
      stages: [
        { name: "Collect Timesheets", order: 0 },
        { name: "Process Payroll",    order: 1 },
        { name: "Review & Approve",   order: 2 },
        { name: "Distribute",         order: 3 },
      ],
    },
    {
      name: "Advisory Pipeline", numJobs: 12,
      stages: [
        { name: "Initial Consultation",    order: 0 },
        { name: "Analysis",               order: 1 },
        { name: "Strategy Development",   order: 2 },
        { name: "Presentation",           order: 3 },
        { name: "Implementation",         order: 4 },
        { name: "Follow-up",              order: 5 },
      ],
    },
  ]);

  const pMap = {};
  pipelines.forEach((p) => { pMap[p.name] = p; });
  console.log(`  ✅  Seeded ${pipelines.length} pipelines`);

  // Seed jobs
  const jobCount = await Job.countDocuments({ deleted: false });
  if (jobCount === 0) {
    await Job.insertMany([
      { name: "2023 Tax Return",       clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", assignee: "John D.",  pipelineId: pMap["Tax Client Workflow"]?._id, pipelineName: "Tax Returns",  stage: "Prepare Tax Return", priority: "high",   status: "in_progress", clientStatus: "In Progress",  startDate: daysAgo(30), dueDate: daysFromNow(10) },
      { name: "Annual Audit 2023",     clientId: clientMap["Johnson LLC"]?._id,       clientName: "Johnson LLC",       assignee: "Sarah M.", pipelineId: pMap["Audit Pipeline"]?._id,      pipelineName: "Audits",       stage: "Fieldwork",          priority: "high",   status: "in_progress", clientStatus: "Awaiting Info", startDate: daysAgo(20), dueDate: daysFromNow(20) },
      { name: "Quarterly Bookkeeping", clientId: clientMap["Brown & Associates"]?._id,clientName: "Brown & Associates",assignee: "Mike R.",  pipelineId: pMap["CFO Client Workflow"]?._id, pipelineName: "Bookkeeping",  stage: "Bookkeeping Transactions", priority: "medium", status: "open", clientStatus: "On Track", startDate: daysAgo(5), dueDate: daysFromNow(15) },
      { name: "Payroll Setup",         clientId: clientMap["Enterprise Ltd"]?._id,    clientName: "Enterprise Ltd",    assignee: "Sarah M.", pipelineId: pMap["Payroll Pipeline"]?._id,    pipelineName: "Payroll",      stage: "Collect Timesheets", priority: "low",    status: "open",        clientStatus: "Completed",     startDate: daysAgo(10), dueDate: daysFromNow(5)  },
    ]);
    console.log("  ✅  Seeded jobs");
  }

  return pMap;
}

async function seedTasks(clientMap) {
  const count = await Task.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Tasks already seeded (${count} found). Skipping.`);
    return;
  }

  await Task.insertMany([
    { name: "Review Q4 Tax Return",         clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", assignee: "John Doe",    priority: "high",   status: "in_progress", dueDate: daysFromNow(5)  },
    { name: "Complete Audit Checklist",     clientId: clientMap["Johnson LLC"]?._id,       clientName: "Johnson LLC",       assignee: "Jane Smith",  priority: "medium", status: "open",        dueDate: daysFromNow(7)  },
    { name: "Send Invoice Reminder",        clientId: clientMap["Brown & Associates"]?._id,clientName: "Brown & Associates",assignee: "Mike Johnson",priority: "low",    status: "open",        dueDate: daysFromNow(3)  },
    { name: "Prepare Financial Statements", clientId: clientMap["Davis Industries"]?._id,  clientName: "Davis Industries",  assignee: "Sarah Wilson",priority: "high",   status: "open",        dueDate: daysFromNow(10) },
    { name: "Client Meeting Follow-up",     clientId: clientMap["Wilson Group"]?._id,      clientName: "Wilson Group",      assignee: "John Doe",    priority: "medium", status: "completed",   dueDate: daysAgo(3)      },
  ]);

  console.log("  ✅  Seeded tasks");
}

async function seedMessages() {
  const count = await Message.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Messages already seeded (${count} found). Skipping.`);
    return;
  }

  await Message.insertMany([
    { fromName: "John Smith",    fromEmail: "john.smith@acmecorp.com",      toUserId: "staff_all", subject: "Q4 Documents Ready",         preview: "Hi, I have uploaded all required documents for Q4...", unread: true,  starred: false, createdAt: daysAgo(0) },
    { fromName: "Sarah Johnson", fromEmail: "sarah.j@techsolutions.com",    toUserId: "staff_all", subject: "Invoice Query",               preview: "Could you please clarify the line items on INV-002...", unread: true, starred: true,  createdAt: daysAgo(1) },
    { fromName: "Michael Brown", fromEmail: "michael.b@globalind.com",      toUserId: "staff_all", subject: "Meeting Request",             preview: "I would like to schedule a call to discuss the audit...", unread: false, starred: false, createdAt: daysAgo(2) },
    { fromName: "Emily Davis",   fromEmail: "emily.davis@davisind.com",     toUserId: "staff_all", subject: "Tax Return Status",           preview: "Could you provide an update on our 2023 tax return...", unread: false, starred: false, createdAt: daysAgo(3) },
    { fromName: "Robert Wilson", fromEmail: "robert.wilson@wilsongrp.com",  toUserId: "staff_all", subject: "New Business Formation",      preview: "We are planning to open a subsidiary and need assistance...", unread: true, starred: false, createdAt: daysAgo(5) },
  ]);

  console.log("  ✅  Seeded messages");
}

async function seedActivities(clientMap) {
  const count = await Activity.countDocuments();
  if (count > 0) {
    console.log(`  ⏭  Activities already seeded (${count} found). Skipping.`);
    return;
  }

  await Activity.insertMany([
    { date: daysAgo(0), clientId: clientMap["Acme Corp"]?._id,        clientName: "Acme Corp",       type: "Invoice",    item: "INV-001",     action: "marked as paid",    userName: "John D."  },
    { date: daysAgo(1), clientId: clientMap["Smith Corporation"]?._id,clientName: "Smith Corporation",type: "Document",   item: "W-2 Form",    action: "uploaded",          userName: "Mike R."  },
    { date: daysAgo(1), clientId: clientMap["Johnson LLC"]?._id,      clientName: "Johnson LLC",      type: "Proposal",   item: "Annual Retainer",action: "signed",          userName: "Sarah M." },
    { date: daysAgo(2), clientId: clientMap["Enterprise Ltd"]?._id,   clientName: "Enterprise Ltd",  type: "Payment",    item: "PAY-001",     action: "received",          userName: "John D."  },
    { date: daysAgo(3), type: "Lead",        item: "Contact Form",  action: "submitted",          userName: "System"   },
    { date: daysAgo(4), clientId: clientMap["Brown & Associates"]?._id,clientName: "Brown & Associates",type: "Time Entry",item: "Strategy Session",action: "logged",      userName: "Sarah M." },
  ]);

  console.log("  ✅  Seeded activities");
}

async function seedTemplates() {
  const count = await Template.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Templates already seeded (${count} found). Skipping.`);
    return;
  }

  await Template.insertMany([
    { name: "Standard Proposal",   category: "proposals", description: "General service proposal template", isGlobal: false },
    { name: "Enterprise Package",  category: "proposals", description: "Full-service enterprise proposal",   isGlobal: false },
    { name: "Tax Return Job",      category: "jobs",      description: "Standard tax return job workflow",   isGlobal: false },
    { name: "Audit Preparation",   category: "jobs",      description: "Audit preparation job template",     isGlobal: false },
    { name: "Welcome Email",       category: "emails",    description: "New client welcome email",           isGlobal: false, content: "Dear {{client_name}},\n\nWelcome to Zentavos! We are thrilled to have you as a client.\n\nBest regards,\nThe Zentavos Team" },
    { name: "Invoice Reminder",    category: "emails",    description: "Past-due invoice reminder",          isGlobal: false, content: "Dear {{client_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} is past due.\n\nPlease contact us if you have any questions.\n\nBest regards,\nThe Zentavos Team" },
    { name: "Document Request",    category: "requests",  description: "Client document request template",   isGlobal: false },
    { name: "Engagement Letter",   category: "signatures",description: "Standard engagement letter",         isGlobal: false },
    { name: "Recurring Invoice",   category: "recurring", description: "Monthly retainer recurring template", isGlobal: false },
    { name: "Task Checklist",      category: "tasks",     description: "Standard task checklist",            isGlobal: false },
    { name: "Folder Structure",    category: "folders",   description: "Client document folder structure",   isGlobal: false },
    { name: "SMS Follow-up",       category: "sms",       description: "Post-meeting SMS follow-up",         isGlobal: false },
  ]);

  console.log("  ✅  Seeded templates");
}

async function seedReports() {
  const count = await Report.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Reports already seeded (${count} found). Skipping.`);
    return;
  }

  await Report.insertMany([
    { name: "Client Engagement Report", verified: true,  tags: ["Weekly", "Clients"],  author: "Sarah M.", reportType: "clients",  lastViewed: daysAgo(1), description: "Weekly overview of client engagement metrics" },
    { name: "Revenue by Service",       verified: true,  tags: ["Monthly", "Revenue"], author: "John D.",  reportType: "revenue",  lastViewed: daysAgo(3), description: "Monthly breakdown of revenue by service category" },
    { name: "Team Performance",         verified: false, tags: ["Weekly"],            author: "Mike R.",  reportType: "team",     lastViewed: daysAgo(2), description: "Weekly team productivity and performance metrics" },
    { name: "Invoice Aging Report",     verified: true,  tags: ["Monthly", "Billing"],author: "Sarah M.", reportType: "billing",  lastViewed: daysAgo(7), description: "Outstanding invoice aging analysis" },
    { name: "Workflow Status",          verified: false, tags: ["Weekly", "Workflow"],author: "Tom A.",   reportType: "workflow", lastViewed: daysAgo(1), description: "Current status of all active jobs and pipelines" },
  ]);

  console.log("  ✅  Seeded reports");
}

async function seedOffers() {
  const count = await Offer.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Offers already seeded (${count} found). Skipping.`);
    return;
  }

  await Offer.insertMany([
    { title: "401(k) for Your Firm",   partner: "Guideline",        description: "Easily offer a 401(k) to your team with automated administration.", discount: "First 3 months free",       category: "Retirement",     isActive: true },
    { title: "Cloud Hosting",          partner: "Right Networks",   description: "Secure cloud hosting for accounting applications.",                  discount: "20% off first year",         category: "Cloud hosting",  isActive: true },
    { title: "Practice Management",    partner: "Partner Software", description: "Streamline your firm operations with leading practice management.",   discount: "15% lifetime discount",      category: "Software",       isActive: true },
    { title: "Cybersecurity Suite",    partner: "CyberGuard",       description: "Comprehensive cybersecurity protection for your firm.",               discount: "25% off annual plan",        category: "Security",       isActive: true },
  ]);

  console.log("  ✅  Seeded offers");
}

async function seedNotifications() {
  const count = await Notification.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Notifications already seeded (${count} found). Skipping.`);
    return;
  }

  await Notification.insertMany([
    { userId: "all", title: "Welcome to Zentavos!",      message: "Your dashboard is ready. Explore the features and get started.",   type: "info",    read: false },
    { userId: "all", title: "New Invoice Generated",      message: "Invoice INV-042 for Smith Corporation has been generated.",         type: "invoice", read: false },
    { userId: "all", title: "Task Due Tomorrow",          message: "Review Q4 Tax Return is due tomorrow.",                             type: "task",    read: false },
    { userId: "all", title: "New Message Received",       message: "John Smith sent you a message about Q4 Documents.",                 type: "message", read: true  },
    { userId: "all", title: "Proposal Signed",            message: "Annual Retainer proposal has been signed by Smith Corporation.",    type: "success", read: true  },
    { userId: "all", title: "Payment Received",           message: "Payment of $1,200 received from Smith Corporation.",               type: "success", read: true  },
  ]);

  console.log("  ✅  Seeded notifications");
}

async function seedFirmServices() {
  const count = await FirmService.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Firm services already seeded (${count} found). Skipping.`);
    const services = await FirmService.find({ deleted: false }).lean();
    const map = {};
    services.forEach((s) => { map[s.name] = s; });
    return map;
  }

  const services = await FirmService.insertMany([
    { name: "Monthly CFO Service",          short_description: "Outsourced CFO with monthly reporting",   category: "CFO Services",      price: 2500, pricingModel: "monthly", isActive: true, features: ["Monthly P&L", "Balance Sheet Review", "Cash Flow Analysis", "Strategic Planning"] },
    { name: "Tax Return Preparation",       short_description: "Individual and business tax return prep", category: "Tax Services",      price: 1200, pricingModel: "fixed",   isActive: true, features: ["Federal Return", "State Return", "E-Filing", "Year-round Support"] },
    { name: "Business Formation Service",   short_description: "Complete business formation package",     category: "Business Services", price: 899,  pricingModel: "fixed",   isActive: true, features: ["Entity Selection", "State Filing", "EIN Application", "Operating Agreement"] },
    { name: "Quarterly Bookkeeping",        short_description: "Full bookkeeping services quarterly",     category: "Bookkeeping",       price: 750,  pricingModel: "monthly", isActive: true, features: ["Transaction Categorization", "Bank Reconciliation", "Financial Reports"] },
    { name: "Payroll Management",           short_description: "End-to-end payroll processing",           category: "Payroll",           price: 500,  pricingModel: "monthly", isActive: true, features: ["Payroll Processing", "Tax Filings", "Direct Deposit", "Employee Portal"] },
    { name: "Financial Advisory",           short_description: "Strategic financial consulting",           category: "Advisory",          price: 300,  pricingModel: "hourly",  isActive: true, features: ["Financial Planning", "Budget Analysis", "Investment Strategy", "Risk Assessment"] },
    { name: "Audit Services",              short_description: "Independent audit and assurance",          category: "Audit",             price: 5000, pricingModel: "fixed",   isActive: true, features: ["Financial Statement Audit", "Compliance Review", "Internal Controls"] },
    { name: "Business Support Plan",       short_description: "Monthly ongoing business support",         category: "Support",           price: 1500, pricingModel: "monthly", isActive: true, features: ["Dedicated Advisor", "Priority Support", "Quarterly Reviews"] },
  ]);

  const map = {};
  services.forEach((s) => { map[s.name] = s; });
  console.log(`  ✅  Seeded ${services.length} firm services`);
  return map;
}

async function seedClientServices(clientMap, serviceMap) {
  const count = await ClientService.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Client services already seeded (${count} found). Skipping.`);
    return;
  }

  await ClientService.insertMany([
    { clientId: clientMap["Smith Corporation"]?._id, serviceId: serviceMap?.["Monthly CFO Service"]?._id,        status: "active",   purchasedAt: daysAgo(90) },
    { clientId: clientMap["Smith Corporation"]?._id, serviceId: serviceMap?.["Tax Return Preparation"]?._id,      status: "active",   purchasedAt: daysAgo(60) },
    { clientId: clientMap["Smith Corporation"]?._id, serviceId: serviceMap?.["Business Formation Service"]?._id,  status: "active",   purchasedAt: daysAgo(120) },
    { clientId: clientMap["Smith Corporation"]?._id, serviceId: serviceMap?.["Quarterly Bookkeeping"]?._id,       status: "active",   purchasedAt: daysAgo(45) },
    { clientId: clientMap["Acme Corp"]?._id,         serviceId: serviceMap?.["Audit Services"]?._id,              status: "active",   purchasedAt: daysAgo(30) },
    { clientId: clientMap["Enterprise Ltd"]?._id,    serviceId: serviceMap?.["Business Support Plan"]?._id,       status: "active",   purchasedAt: daysAgo(60) },
    { clientId: clientMap["Johnson LLC"]?._id,       serviceId: serviceMap?.["Payroll Management"]?._id,          status: "active",   purchasedAt: daysAgo(45) },
  ]);

  console.log("  ✅  Seeded client services");
}

async function seedDocuments(clientMap) {
  const count = await Document.countDocuments({ deleted: false });
  if (count > 0) {
    console.log(`  ⏭  Documents already seeded (${count} found). Skipping.`);
    return;
  }

  await Document.insertMany([
    { name: "Tax Documents 2023",     clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", type: "folder",   folder: "Tax Returns",    scope: "client",   uploadedByName: "Mike R." },
    { name: "W-2 Form",               clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", type: "document", docType: "Tax Form",      folder: "Tax Returns",    scope: "client",   fileName: "W2_2023.pdf",       uploadedByName: "Mike R.", createdAt: daysAgo(5)  },
    { name: "1099 Form",              clientId: clientMap["Smith Corporation"]?._id, clientName: "Smith Corporation", type: "document", docType: "Tax Form",      folder: "Tax Returns",    scope: "client",   fileName: "1099_2023.pdf",     uploadedByName: "Mike R.", createdAt: daysAgo(5)  },
    { name: "Financial Statements",   clientId: clientMap["Acme Corp"]?._id,         clientName: "Acme Corp",         type: "folder",   folder: "Financial",      scope: "client",   uploadedByName: "Sarah M." },
    { name: "Balance Sheet Q4",       clientId: clientMap["Acme Corp"]?._id,         clientName: "Acme Corp",         type: "document", docType: "Financial",     folder: "Financial",      scope: "client",   fileName: "BalanceSheet_Q4.pdf",uploadedByName: "Sarah M.", createdAt: daysAgo(10) },
    { name: "Internal Memo - Q4",     type: "document", docType: "Internal",      folder: "Internal",       scope: "internal", fileName: "Q4_Memo.pdf",       uploadedByName: "John D.",  createdAt: daysAgo(7)  },
    { name: "Client Organizer 2024",  clientId: clientMap["Johnson LLC"]?._id,       clientName: "Johnson LLC",       type: "document", docType: "Organizer",     folder: "Organizers",     scope: "organizer",fileName: "Organizer_2024.pdf", uploadedByName: "Jane S.",  createdAt: daysAgo(14) },
  ]);

  console.log("  ✅  Seeded documents");
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱  Starting dashboard seed script...\n");

  await connectDB();

  console.log("\n📋  Seeding reference data...");
  await seedStaffMembers();

  console.log("\n👥  Seeding clients & contacts...");
  const clientMap = await seedClients();
  await seedContacts(clientMap);

  console.log("\n💰  Seeding billing data...");
  const invoiceMap = await seedInvoices(clientMap);
  await seedPayments(clientMap, invoiceMap);
  await seedTimeEntries(clientMap);
  await seedRecurringInvoices(clientMap);
  await seedProposals(clientMap);

  console.log("\n📋  Seeding workflow data...");
  await seedPipelinesAndJobs(clientMap);
  await seedTasks(clientMap);

  console.log("\n💬  Seeding communications...");
  await seedMessages();
  await seedActivities(clientMap);
  await seedNotifications();

  console.log("\n📄  Seeding content & templates...");
  await seedTemplates();
  await seedReports();
  await seedOffers();

  console.log("\n🛠️  Seeding services...");
  const serviceMap = await seedFirmServices();
  await seedClientServices(clientMap, serviceMap);

  console.log("\n📁  Seeding documents...");
  await seedDocuments(clientMap);

  console.log("\n✅  Dashboard seed complete!\n");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌  Seed failed:", err);
  mongoose.disconnect();
  process.exit(1);
});
