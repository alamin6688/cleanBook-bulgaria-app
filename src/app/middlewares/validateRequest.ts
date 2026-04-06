import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

const validateRequest =
  (schema: ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result: any = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
        cookies: req.cookies,
      });

      // Update the request object with our validated/formatted data
      // For query and params, we use Object.assign because they may be read-only getters in Express 5
      if (result.body) req.body = result.body;
      if (result.query) Object.assign(req.query, result.query);
      if (result.params) Object.assign(req.params, result.params);

      return next();
    } catch (error) {
      next(error);
    }
  };

export const RequestValidation = {
  validateRequest,
};
