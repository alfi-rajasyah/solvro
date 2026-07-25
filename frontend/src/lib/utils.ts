import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-convention class combiner — vendored ui components import this. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
