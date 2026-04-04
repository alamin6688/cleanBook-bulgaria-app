import { ZodError } from "zod";
import {
  IGenericErrorMessage,
  IGenericErrorResponse,
} from "../interfaces/common";

const handleZodError = (error: ZodError): IGenericErrorResponse => {
  const errors: IGenericErrorMessage[] = error.issues.map((issue) => {
    const lastPath = issue?.path[issue.path.length - 1];
    return {
      path: typeof lastPath === "number" ? lastPath : String(lastPath),
      message: issue?.message,
    };
  });

  const statusCode = 400;

  // Create a more meaningful main message by combining field names and messages
  const message = error.issues
    .map((issue) => issue.message)
    .join(", ");

  return {
    statusCode,
    message: message || "Validation Error",
    errorMessages: errors,
  };
};

export default handleZodError;
