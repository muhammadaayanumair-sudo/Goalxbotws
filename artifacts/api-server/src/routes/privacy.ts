import { Router, type IRouter } from "express";

const router: IRouter = Router();

const PRIVACY_URL =
  "https://docs.google.com/document/d/14ZfCc_Qr68_TQHEB1bdJ1gUFWnWasM9yIqGVoU3gS3U/edit?usp=sharing";

const TERMS_URL =
  "https://docs.google.com/document/d/1gvzwhWBs_hpieEQv_vTc2HS0hxMW_UmbOzoOwZhYRCQ/edit?usp=sharing";

router.get("/privacy", (_req, res) => {
  res.redirect(301, PRIVACY_URL);
});

router.get("/terms", (_req, res) => {
  res.redirect(301, TERMS_URL);
});

export default router;
