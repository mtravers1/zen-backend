import { Router } from "express";
import {
  listTasks, getTaskById, createTask, updateTask, deleteTask, getTaskStats,
  listJobs, getJobById, createJob, updateJob, deleteJob, getJobStats,
  listPipelines, getPipelineById, createPipeline, updatePipeline, deletePipeline,
  listCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
  listRecurrences, createRecurrence, updateRecurrence, deleteRecurrence,
} from "../controllers/workflow.controller.js";

const router = Router();

// ── Tasks ──────────────────────────────────────────────────────
router.get("/tasks/stats", getTaskStats);
router.get("/tasks", listTasks);
router.get("/tasks/:id", getTaskById);
router.post("/tasks", createTask);
router.patch("/tasks/:id", updateTask);
router.delete("/tasks/:id", deleteTask);

// ── Jobs ───────────────────────────────────────────────────────
router.get("/jobs/stats", getJobStats);
router.get("/jobs", listJobs);
router.get("/jobs/:id", getJobById);
router.post("/jobs", createJob);
router.patch("/jobs/:id", updateJob);
router.delete("/jobs/:id", deleteJob);

// ── Pipelines ──────────────────────────────────────────────────
router.get("/pipelines", listPipelines);
router.get("/pipelines/:id", getPipelineById);
router.post("/pipelines", createPipeline);
router.patch("/pipelines/:id", updatePipeline);
router.delete("/pipelines/:id", deletePipeline);

// ── Calendar ───────────────────────────────────────────────────
router.get("/calendar", listCalendarEvents);
router.post("/calendar", createCalendarEvent);
router.patch("/calendar/:id", updateCalendarEvent);
router.delete("/calendar/:id", deleteCalendarEvent);

// ── Job Recurrences ────────────────────────────────────────────
router.get("/recurrences", listRecurrences);
router.post("/recurrences", createRecurrence);
router.patch("/recurrences/:id", updateRecurrence);
router.delete("/recurrences/:id", deleteRecurrence);

export default router;
