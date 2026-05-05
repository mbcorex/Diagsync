import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InventoryOperations } from "@/components/inventory/inventory-operations";

export default async function InventoryItemsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  if (!["SUPER_ADMIN", "INVENTORY_MANAGER"].includes(user.role)) redirect("/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-slate-800">Inventory Item Setup</h1>
        <p className="mt-0.5 text-xs text-slate-400">Create items, add stock, and map consumption in one workflow.</p>
      </div>
      <InventoryOperations mode="setup" />
    </div>
  );
}
