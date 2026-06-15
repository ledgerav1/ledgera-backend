import { Router } from "express";

const router = Router();

const checkoutUrl = "https://buy.stripe.com/3cIeVccCLeJb6Zu0cy8AE00";

router.get("/checkout", (_req, res) => {
  return res.redirect(302, checkoutUrl);
});

router.get("/", (_req, res) => {
  return res.json({
    checkoutUrl,
  });
});

export default router;
