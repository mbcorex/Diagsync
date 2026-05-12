"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/index";

type InventoryItem = {
  id: string;
  name: string;
  category: "TEST_KIT" | "REAGENT" | "CONSUMABLE";
  unit: string;
  minimumStockLevel: string;
  balance?: {
    currentQuantity: string;
  } | null;
};

type TestRow = {
  id: string;
  name: string;
  code: string;
};

type MovementRow = {
  id: string;
  createdAt: string;
  quantityChange: string;
  actionType: string;
  sourceType: string;
  inventoryItem: { name: string; unit: string };
  performedBy: { fullName: string };
};

type AnalyticsRow = {
  inventoryItemId: string;
  itemName: string;
  unit: string;
  expectedUsage: string;
  actualUsage: string;
  discrepancy: string;
  flagged: boolean;
};

export function InventoryOperations({
  mode = "all",
}: {
  mode?: "all" | "setup" | "items" | "stock" | "mappings" | "movements" | "analytics";
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState<"TEST_KIT" | "REAGENT" | "CONSUMABLE">("TEST_KIT");
  const [itemUnit, setItemUnit] = useState("kit");
  const [itemMin, setItemMin] = useState("0");

  const [stockItemId, setStockItemId] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [stockExpiry, setStockExpiry] = useState("");
  const [stockBatch, setStockBatch] = useState("");
  const [stockSupplier, setStockSupplier] = useState("");

  const [mapItemId, setMapItemId] = useState("");
  const [mapTestId, setMapTestId] = useState("");
  const [mapQty, setMapQty] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<"TEST_KIT" | "REAGENT" | "CONSUMABLE">("TEST_KIT");
  const [editUnit, setEditUnit] = useState("");
  const [editMinimum, setEditMinimum] = useState("");
  const [analyticsFrom, setAnalyticsFrom] = useState("");
  const [analyticsTo, setAnalyticsTo] = useState("");

  async function loadAll() {
    const analyticsParams = new URLSearchParams();
    if (analyticsFrom) analyticsParams.set("from", analyticsFrom);
    if (analyticsTo) analyticsParams.set("to", analyticsTo);
    const analyticsUrl = analyticsParams.toString()
      ? `/api/inventory/analytics?${analyticsParams.toString()}`
      : "/api/inventory/analytics";

    const [itemsRes, testsRes, movementRes, analyticsRes] = await Promise.all([
      fetch("/api/inventory/items", { cache: "no-store" }),
      fetch("/api/tests", { cache: "no-store" }),
      fetch("/api/inventory/movements", { cache: "no-store" }),
      fetch(analyticsUrl, { cache: "no-store" }),
    ]);
    const itemsJson = await itemsRes.json();
    const testsJson = await testsRes.json();
    const movementJson = await movementRes.json();
    const analyticsJson = await analyticsRes.json();

    setItems(itemsJson.data ?? []);
    setTests(testsJson.data ?? []);
    setMovements(movementJson.data ?? []);
    setAnalytics(analyticsJson.data?.discrepancies ?? []);
  }

  useEffect(() => {
    void loadAll();
  }, [analyticsFrom, analyticsTo]);

  const itemOptions = useMemo(() => items.map((item) => ({ id: item.id, label: `${item.name} (${item.unit})` })), [items]);

  async function createItem() {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const res = await fetch("/api/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: itemName,
          category: itemCategory,
          unit: itemUnit,
          minimumStockLevel: Number(itemMin),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to create item");
      setFeedback("Inventory item created.");
      setItemName("");
      setItemUnit("kit");
      setItemMin("0");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create item");
    } finally {
      setBusy(false);
    }
  }

  async function addStock() {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const res = await fetch("/api/inventory/stock-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: stockItemId,
          quantityAdded: Number(stockQty),
          expiryDate: stockExpiry,
          batchNumber: stockBatch || null,
          supplier: stockSupplier || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to add stock");
      setFeedback("Stock added successfully.");
      setStockQty("");
      setStockExpiry("");
      setStockBatch("");
      setStockSupplier("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add stock");
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping() {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const res = await fetch("/api/inventory/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: [
            {
              inventoryItemId: mapItemId,
              testId: mapTestId,
              quantityPerTest: Number(mapQty),
            },
          ],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to save mapping");
      setFeedback("Consumption mapping saved.");
      setMapQty("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save mapping");
    } finally {
      setBusy(false);
    }
  }

  function startEditItem(item: InventoryItem) {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditUnit(item.unit);
    setEditMinimum(item.minimumStockLevel);
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setEditName("");
    setEditCategory("TEST_KIT");
    setEditUnit("");
    setEditMinimum("");
  }

  async function updateItem(itemId: string) {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const res = await fetch(`/api/inventory/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          category: editCategory,
          unit: editUnit,
          minimumStockLevel: Number(editMinimum),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to update item");
      setFeedback("Inventory item updated.");
      cancelEditItem();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update item");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(item: InventoryItem) {
    const confirmed = window.confirm(`Delete "${item.name}"?`);
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to delete item");
      setFeedback(json.message ?? "Inventory item deleted.");
      if (editingItemId === item.id) cancelEditItem();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div> : null}
      {feedback ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{feedback}</div> : null}

      {(mode === "all" || mode === "setup" || mode === "items" || mode === "stock" || mode === "mappings") ? (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {mode === "all" || mode === "setup" || mode === "items" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Add Inventory Item</h3>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="HIV Rapid Kit" />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={itemCategory} onValueChange={(v) => setItemCategory(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TEST_KIT">Test Kit</SelectItem>
                <SelectItem value="REAGENT">Reagent</SelectItem>
                <SelectItem value="CONSUMABLE">Consumable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Unit</Label>
              <Input value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} placeholder="kit" />
            </div>
            <div className="space-y-1">
              <Label>Minimum</Label>
              <Input type="number" value={itemMin} onChange={(e) => setItemMin(e.target.value)} placeholder="20" />
            </div>
          </div>
          <Button disabled={busy || !itemName.trim() || !itemUnit.trim()} onClick={createItem}>Save Item</Button>
        </section>
        ) : null}

        {mode === "all" || mode === "setup" || mode === "stock" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Add Stock</h3>
          <div className="space-y-1">
            <Label>Item</Label>
            <Select value={stockItemId} onValueChange={setStockItemId}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {itemOptions.map((opt) => <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input type="number" value={stockQty} onChange={(e) => setStockQty(e.target.value)} placeholder="100" />
            </div>
            <div className="space-y-1">
              <Label>Expiry Date</Label>
              <Input type="date" value={stockExpiry} onChange={(e) => setStockExpiry(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Batch (Optional)</Label>
              <Input value={stockBatch} onChange={(e) => setStockBatch(e.target.value)} placeholder="BATCH-001" />
            </div>
            <div className="space-y-1">
              <Label>Supplier (Optional)</Label>
              <Input value={stockSupplier} onChange={(e) => setStockSupplier(e.target.value)} placeholder="MedSupply Ltd" />
            </div>
          </div>
          <Button disabled={busy || !stockItemId || !stockQty || !stockExpiry} onClick={addStock}>Add Stock</Button>
        </section>
        ) : null}

        {mode === "all" || mode === "setup" || mode === "mappings" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Map Consumption To Test</h3>
          <div className="space-y-1">
            <Label>Item</Label>
            <Select value={mapItemId} onValueChange={setMapItemId}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {itemOptions.map((opt) => <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Test</Label>
            <Select value={mapTestId} onValueChange={setMapTestId}>
              <SelectTrigger><SelectValue placeholder="Select test" /></SelectTrigger>
              <SelectContent>
                {tests.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Quantity Per Test</Label>
            <Input type="number" value={mapQty} onChange={(e) => setMapQty(e.target.value)} placeholder="1" />
          </div>
          <Button disabled={busy || !mapItemId || !mapTestId || !mapQty} onClick={saveMapping}>Save Mapping</Button>
        </section>
        ) : null}
      </div>
      ) : null}

      {mode === "all" || mode === "movements" ? (
      <section className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Movement Log</h3>
        </div>
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Change</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">By</th>
            </tr>
          </thead>
          <tbody>
            {movements.slice(0, 12).map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{new Date(m.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">{m.inventoryItem.name}</td>
                <td className="px-3 py-2">{m.quantityChange} {m.inventoryItem.unit}</td>
                <td className="px-3 py-2">{m.actionType}</td>
                <td className="px-3 py-2">{m.sourceType}</td>
                <td className="px-3 py-2">{m.performedBy.fullName}</td>
              </tr>
            ))}
            {movements.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">No movement logs yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
      ) : null}

      {mode === "all" || mode === "analytics" ? (
      <section className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Discrepancy Analytics</h3>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={analyticsFrom} onChange={(e) => setAnalyticsFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={analyticsTo} onChange={(e) => setAnalyticsTo(e.target.value)} />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setAnalyticsFrom("");
                setAnalyticsTo("");
              }}
              disabled={!analyticsFrom && !analyticsTo}
            >
              Clear Filter
            </Button>
          </div>
        </div>
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Expected</th>
              <th className="px-3 py-2 text-left">Actual</th>
              <th className="px-3 py-2 text-left">Discrepancy</th>
              <th className="px-3 py-2 text-left">Flag</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((a) => (
              <tr key={a.inventoryItemId} className="border-t border-slate-100">
                <td className="px-3 py-2">{a.itemName}</td>
                <td className="px-3 py-2">{a.expectedUsage} {a.unit}</td>
                <td className="px-3 py-2">{a.actualUsage} {a.unit}</td>
                <td className="px-3 py-2">{a.discrepancy} {a.unit}</td>
                <td className="px-3 py-2">{a.flagged ? "⚠️ Possible discrepancy detected" : "-"}</td>
              </tr>
            ))}
            {analytics.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">No analytics yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
      ) : null}

      {mode === "all" || mode === "setup" || mode === "items" ? (
      <section className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manage Inventory Items</h3>
        </div>
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Unit</th>
              <th className="px-3 py-2 text-left">Min</th>
              <th className="px-3 py-2 text-left">Current</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = editingItemId === item.id;
              return (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    ) : item.name}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Select value={editCategory} onValueChange={(v) => setEditCategory(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TEST_KIT">Test Kit</SelectItem>
                          <SelectItem value="REAGENT">Reagent</SelectItem>
                          <SelectItem value="CONSUMABLE">Consumable</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : item.category}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} />
                    ) : item.unit}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input type="number" value={editMinimum} onChange={(e) => setEditMinimum(e.target.value)} />
                    ) : item.minimumStockLevel}
                  </td>
                  <td className="px-3 py-2">
                    {item.balance?.currentQuantity ?? "0"} {item.unit}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busy || !editName.trim() || !editUnit.trim() || editMinimum === ""}
                            onClick={() => updateItem(item.id)}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={cancelEditItem}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => startEditItem(item)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" disabled={busy} onClick={() => deleteItem(item)}>
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">No inventory items yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
      ) : null}
    </div>
  );
}
