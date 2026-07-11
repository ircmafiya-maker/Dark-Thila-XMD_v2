import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import authRouter from "./auth";
import pairRouter from "./pair";
import { requireAuth } from "../lib/auth.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
// Bot & pair routes: authenticated users only
router.use(requireAuth as any, botRouter);
router.use("/pair", requireAuth as any, pairRouter);

export default router;
