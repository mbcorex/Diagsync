import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InventoryOperations } from "@/components/inventory/inventory-operations";

export default async function InventoryMappingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  if (!["SUPER_ADMIN", "INVENTORY_MANAGER"].includes(user.role)) redirect("/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-slate-800">Consumption Mapping</h1>
        <p className="mt-0.5 text-xs text-slate-400">Map inventory usage quantities to each diagnostic test.</p>
      </div>
      <InventoryOperations mode="mappings" />
    </div>
  );
}
