import { Router } from "express";

const router = Router();

// Accepts raw body for upload bandwidth measurement
// The client sends 4MB in one POST; we consume it and return 200.
router.post("/speed-test", (req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    // Body fully consumed — client-side timing captures the upload Mbps
    res.json({ ok: true });
  });
  req.on("error", () => {
    res.status(500).json({ ok: false, error: "Upload interrupted" });
  });
});

export default router;
