import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { InventoryOperations } from "@/components/inventory/inventory-operations";

export default async function InventoryDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  if (!["SUPER_ADMIN", "INVENTORY_MANAGER", "MD"].includes(user.role)) redirect("/dashboard");

  try {
    const items = await prisma.inventoryItem.findMany({
      where: { organizationId: user.organizationId },
      include: {
        balance: true,
        stockEntries: { orderBy: { expiryDate: "asc" }, take: 1 },
      },
      orderBy: { name: "asc" },
    });

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-base font-semibold text-slate-800">Inventory Dashboard</h1>
          <p className="mt-0.5 text-xs text-slate-400">Stock levels, low-stock alerts, and upcoming expiries.</p>
        </div>
        <InventoryOperations />

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Current</th>
                <th className="px-4 py-3">Minimum</th>
                <th className="px-4 py-3">Next Expiry</th>
                <th className="px-4 py-3">Alert</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const current = Number(item.balance?.currentQuantity ?? 0);
                const minimum = Number(item.minimumStockLevel);
                const expiry = item.stockEntries[0]?.expiryDate;
                const out = current <= 0;
                const low = current <= minimum;
                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.category}</td>
                    <td className="px-4 py-3 text-slate-700">{`${current} ${item.unit}`}</td>
                    <td className="px-4 py-3 text-slate-700">{`${minimum} ${item.unit}`}</td>
                    <td className="px-4 py-3 text-slate-600">{expiry ? new Date(expiry).toLocaleDateString() : "-"}</td>
                    <td className="px-4 py-3">
                      {out ? (
                        <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Out of stock</span>
                      ) : low ? (
                        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Low stock</span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Healthy</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    No inventory items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while loading inventory.";
    const migrationHint =
      message.includes("inventory_") || message.includes("does not exist")
        ? "Inventory tables are not available in this database yet. Apply the inventory migration and redeploy."
        : message;
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-base font-semibold text-slate-800">Inventory Dashboard</h1>
          <p className="mt-0.5 text-xs text-slate-400">Stock levels, low-stock alerts, and upcoming expiries.</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-semibold">Inventory is not ready yet</p>
          <p className="mt-1 text-xs">{migrationHint}</p>
        </div>
      </div>
    );
  }
}
