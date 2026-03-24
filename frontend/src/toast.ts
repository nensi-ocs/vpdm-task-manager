import { toast } from "react-toastify";

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error ? err.message : fallback;
}

export function toastApiError(err: unknown, fallback?: string): void {
  toast.error(errorMessage(err, fallback));
}

export function toastSuccess(message: string): void {
  toast.success(message);
}

