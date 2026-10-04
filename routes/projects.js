const express = require("express");
const Project = require("../models/Project");
const { requireAdmin } = require("../middleware/auth");
const { upload, uploadAll, deleteImagesByUrls } = require("../config/cloudinary");
const { HttpError, validateIdParam, parseJsonField } = require("../utils/helpers");

const MAX_PHOTOS = 12; // per project

const { audit } = require("../utils/audit");
const router = express.Router();
router.param("id", validateIdParam);

// Copies only the whitelisted text fields from a request body.
function projectFields(body, { partial }) {
  const out = {};
  for (const [key, max] of [["name", 200], ["location", 200], ["tag", 100]]) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string") throw new HttpError(400, `${key} must be text`);
    out[key] = body[key].trim().slice(0, max);
  }
  if (!partial && (!out.name || !out.location)) throw new HttpError(400, "name and location are required");
  if (out.name === "" || out.location === "") throw new HttpError(400, "name and location can't be empty");
  return out;
}

// GET /api/projects — public, feeds the "Our Projects" gallery
router.get("/", async (req, res) => {
  const projects = await Project.find().sort({ createdAt: -1 });
  res.json(projects);
});

// POST /api/projects — admin only
router.post("/", requireAdmin, upload.array("images", 6), async (req, res) => {
  const fields = projectFields(req.body, { partial: false });
  if ((req.files || []).length > MAX_PHOTOS) throw new HttpError(400, `A project can have at most ${MAX_PHOTOS} photos.`);
  const images = await uploadAll(req.files);
  const project = await Project.create({ ...fields, images });
  res.status(201).json(project);
});

// PUT /api/projects/:id — admin only
router.put("/:id", requireAdmin, upload.array("images", 6), async (req, res) => {
  const updates = projectFields(req.body, { partial: true });
  const existing = await Project.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Project not found" });
  const removeList = parseJsonField(req.body.removeImages, "removeImages", []);
  if (!Array.isArray(removeList) || removeList.some((u) => typeof u !== "string")) throw new HttpError(400, "removeImages must be a list of photo links");
  const current = existing.images || [];
  const removed = current.filter((u) => removeList.includes(u));
  const kept = current.filter((u) => !removeList.includes(u));
  const incoming = (req.files || []).length;
  if (kept.length + incoming > MAX_PHOTOS) {
    throw new HttpError(400, `A project can have at most ${MAX_PHOTOS} photos (it has ${kept.length}; you tried to add ${incoming}). Remove some first.`);
  }
  if (removed.length || incoming) {
    updates.images = [...kept, ...(incoming ? await uploadAll(req.files) : [])];
  }
  const project = await Project.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (removed.length) deleteImagesByUrls(removed);
  res.json(project);
});

// DELETE /api/projects/:id — admin only
router.delete("/:id", requireAdmin, async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  deleteImagesByUrls(project.images); // fire-and-forget cleanup
  audit(req, "project.delete", `Deleted project: ${project.name}`);
  res.json({ message: "Project deleted" });
});

module.exports = router;
