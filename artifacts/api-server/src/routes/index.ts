import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameRouter from "./game";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gameRouter);
router.use('/voice', voiceRouter);

export default router;
