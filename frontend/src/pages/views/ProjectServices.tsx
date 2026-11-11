import { useMemo, useState } from "react";
import { TOOLBAR_BUTTON_OUTLINE } from "@/lib/utils";
import { useProjectContext } from "../ProjectDetail";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { CardGridSkeleton } from "@/components/skeletons";
import { ServiceMappingList } from "@/components/services/ServiceMappingList";
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  type ServiceAssignmentInput,
  useCustomer,
  useUpdateProjectServices,
} from "@/lib/queries";

export function ProjectServices() {
  const { project } = useProjectContext();
  const { user } = useAuth();
  const canMutate = hasPermission(user, "project:write");
  // Adding a catalogue service is admin-only (the catalogue is global).
  const canCreateService = hasPermission(user, "*");

  const update = useUpdateProjectServices(project.id);
  const { data: customer, isLoading: customerLoading } = useCustomer(project.customerId);
  const [addAllError, setAddAllError] = useState<string | null>(null);

  const subscribedServiceIds = useMemo(() => {
    if (!project.customerId || !customer) return undefined;
    return new Set(customer.services.map((a) => a.serviceId));
  }, [project.customerId, customer]);

  // Subscribed services not yet assigned at the project level — the set the
  // "Add customer's services" bulk action fills in, carrying over the customer's
  // per-service tools for each newly-added row.
  const missingSubscribed = useMemo(() => {
    if (!customer) return [];
    const assignedIds = new Set(project.services.map((a) => a.serviceId));
    return customer.services.filter((a) => !assignedIds.has(a.serviceId));
  }, [customer, project.services]);

  const showAddAll = canMutate && Boolean(customer) && missingSubscribed.length > 0;

  async function handleAddAllSubscribed() {
    if (missingSubscribed.length === 0) return;
    setAddAllError(null);
    const merged: ServiceAssignmentInput[] = [
      ...project.services.map((a) => ({ serviceId: a.serviceId, tools: a.tools })),
      ...missingSubscribed.map((a) => ({ serviceId: a.serviceId, tools: a.tools })),
    ];
    try {
      await update.mutateAsync(merged);
    } catch (err) {
      setAddAllError(
        err instanceof ApiError ? err.message : "Could not add the customer's services.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
      {addAllError && (
        <Alert variant="destructive">
          <AlertDescription>{addAllError}</AlertDescription>
        </Alert>
      )}

      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {customerLoading ? (
          <CardGridSkeleton count={4} />
        ) : (
          <ServiceMappingList
            assignments={project.services}
            onSave={(assignments) => update.mutateAsync(assignments)}
            canMutate={canMutate}
            canCreateService={canCreateService}
            saving={update.isPending}
            subscribedServiceIds={subscribedServiceIds}
            title="Services in Scope"
            toolbarActions={
              showAddAll && (
                <button
                  type="button"
                  onClick={handleAddAllSubscribed}
                  disabled={update.isPending}
                  className={TOOLBAR_BUTTON_OUTLINE}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-base">playlist_add</span>
                  Add customer's services
                </button>
              )
            }
            description={'Tick the services this project delivers and list the tools used for each. "Subscribed" marks the ones the customer already subscribes to.'}
          />
        )}
      </div>
    </div>
  );
}
