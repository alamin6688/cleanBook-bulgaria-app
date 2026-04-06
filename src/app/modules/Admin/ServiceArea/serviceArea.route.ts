import express from "express";
import auth from "../../../middlewares/auth";
import { ServiceAreaController } from "./serviceArea.controller";

const router = express.Router();

router.post("/", auth("ADMIN"), ServiceAreaController.createServiceArea);
router.get("/", auth("ADMIN", "CLEANER"), ServiceAreaController.getAllServiceAreas);
router.delete("/:id", auth("ADMIN"), ServiceAreaController.deleteServiceArea);

export const ServiceAreaRoutes = router;
