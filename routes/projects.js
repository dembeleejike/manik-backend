const express = require("express");
const Project = require("../models/Project");
const { requireAdmin } = require("../middleware/auth");
const { upload, uploadAll } = require("../config/cloudinary");

const router = express.Router();

// GET /api/projects — public, feeds the "Our Projects" gallery
router.get("/", async (req, res) => {
  const projects = await Project.find().sort({ createdAt: -1 });
  res.json(projects);
});

// POST /api/projects — admin only
router.post("/", requireAdmin, upload.array("images", 6), async (req, res) => {
  try {
    const { name, location, tag } = req.body;
    if (!name || !location) {
      return res.status(400).json({ error: "name and location are required" });
    }
    const images = await uploadAll(req.files);
    const project = await Project.create({ name, location, tag, images });
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// PUT /api/projects/:id — admin only
router.put("/:id", requireAdmin, upload.array("images", 6), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (req.files && req.files.length > 0) {
      const newImages = await uploadAll(req.files);
      const existing = await Project.findById(req.params.id);
      updates.images = [...(existing?.images || []), ...newImages];
    }
    const project = await Project.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DELETE /api/projects/:id — admin only
router.delete("/:id", requireAdmin, async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ message: "Project deleted" });
});

module.exports = router;
