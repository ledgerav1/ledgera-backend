import { Request, Response, Router } from "express";
import { onboardCompany } from "../services/onboardingService";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  res.json(await onboardCompany(req.body.name));
});

export default router;
