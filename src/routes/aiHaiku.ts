import { Router } from "express";
import { generateHaiku } from "../services/haikuService";

const router = Router();

/**
 * 🤖 AI HAIKU (debug)
 * GET /ai/haiku
 */
router.get("/", async (req, res) => {
  const mock = req.query.mock === "1" || req.query.mock === "true";
  if (mock) {
    return res.json({
      haiku: ["Neural tides in code", "Answers bloom from silent logic", "AI learns to breathe"].join("\n"),
    });
  }

  try {
    const haiku = await generateHaiku();
    return res.json({ haiku });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate haiku";
    return res.status(500).json({ error: message });
  }
});

export default router;
