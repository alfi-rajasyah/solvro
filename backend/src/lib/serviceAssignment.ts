import { prisma } from "../prisma.js";
import { HttpError } from "../http/errors.js";

/**
 * An inactive service cannot be newly linked to a project or customer. Links
 * that already exist stay allowed, so a PUT that keeps an inactive service it
 * already holds passes.
 */
export async function assertNoNewInactiveServices(
  requestedIds: number[],
  existingIds: number[],
): Promise<void> {
  const existing = new Set(existingIds);
  const added = requestedIds.filter((id) => !existing.has(id));
  if (added.length === 0) return;
  const inactive = await prisma.service.count({ where: { id: { in: added }, active: false } });
  if (inactive > 0) {
    throw new HttpError(400, "service_inactive", "An inactive service cannot be newly linked");
  }
}
