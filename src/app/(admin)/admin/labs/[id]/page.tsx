import Link from "next/link";
import { notFound } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { getOrganizationDetail } from "@/lib/admin-data";
import { requireMegaAdmin } from "@/lib/admin-auth";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import {
  activateLabAction,
  approvePaymentRequestAction,
  rejectPaymentRequestAction,
  suspendLabAction,
  syncLabCatalogAction,
  enrichLabProfileAction,
  forceEnrichLabProfileAction,
  setOrganizationPlanAction,
} from "../actions";

function asNumber(value: Decimal | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

function getAiFetchReasonLabel(aiReason: string | undefined, aiStatus: string | undefined) {
  if (!aiReason) return "";
  if (aiReason === "MISSING_API_KEY") return "SERPER_API_KEY is missing in server environment.";
  if (aiReason === "TIMEOUT") return "Serper request timed out after 10 seconds.";
  if (aiReason === "HTTP_ERROR") return `Serper API returned HTTP ${aiStatus ?? "error"}.`;
  if (aiReason === "EMPTY_RESPONSE") return "Serper returned no useful search results.";
  if (aiReason === "INVALID_JSON") return "Upstream response format was invalid.";
  if (aiReason === "REQUEST_FAILED") return "Network/request failed while contacting Serper.";
  return `AI fetch failed: ${aiReason}.`;
}

function getAiMessage(ai: string | undefined, confidence: string | undefined, aiReason: string | undefined, aiStatus: string | undefined) {
  if (!ai) return null;
  if (ai === "success") return { tone: "green", text: `AI enrichment saved successfully${confidence ? ` (confidence ${Number(confidence).toFixed(2)})` : ""}.` };
  if (ai === "force_success") return { tone: "green", text: `Force AI enrichment saved successfully${confidence ? ` (confidence ${Number(confidence).toFixed(2)})` : ""}.` };
  if (ai === "RATE_LIMITED") return { tone: "amber", text: "AI fetch skipped: this lab can only be enriched once per hour." };
  if (ai === "force_LOW_CONFIDENCE") return { tone: "amber", text: `Force AI fetch completed but confidence was too low to overwrite data${confidence ? ` (${Number(confidence).toFixed(2)})` : ""}.` };
  if (ai === "force_NO_AI_DATA") return { tone: "amber", text: `Force AI fetch returned no usable data. ${getAiFetchReasonLabel(aiReason, aiStatus)}`.trim() };
  if (ai === "force_NOT_FOUND") return { tone: "red", text: "Lab not found for force enrichment." };
  if (ai === "LOW_CONFIDENCE") return { tone: "amber", text: `AI fetch completed but confidence was too low to overwrite data${confidence ? ` (${Number(confidence).toFixed(2)})` : ""}.` };
  if (ai === "NO_AI_DATA") return { tone: "amber", text: `AI fetch returned no usable data. ${getAiFetchReasonLabel(aiReason, aiStatus)}`.trim() };
  if (ai === "NOT_FOUND") return { tone: "red", text: "Lab not found for enrichment." };
  return { tone: "amber", text: "AI enrichment completed with partial result." };
}

export default async function AdminLabDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    ai?: string;
    confidence?: string;
    aiReason?: string;
    aiStatus?: string;
    planSet?: string;
    plan?: string;
    duration?: string;
    unit?: string;
  };
}) {
  await requireMegaAdmin();
  const detail = await getOrganizationDetail(params.id);

  if (!detail) {
    notFound();
  }

  const { organization, users, paymentRequests, stats } = detail;
  const planSetSuccess = searchParams?.planSet === "success";
  const planSetName = searchParams?.plan ?? null;
  const planSetDuration = searchParams?.duration ?? null;
  const planSetUnit = searchParams?.unit ?? null;
  const aiMsg = getAiMessage(searchParams?.ai, searchParams?.confidence, searchParams?.aiReason, searchParams?.aiStatus);

  return (
    <div className="space-y-5">
      {aiMsg ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            aiMsg.tone === "green"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : aiMsg.tone === "red"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {aiMsg.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/labs" className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
            Back to labs
          </Link>
          <h1 className="mt-1 text-base font-semibold text-gray-900">{organization.name}</h1>
          <p className="text-xs text-gray-400">{organization.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <form action={syncLabCatalogAction}>
            <input type="hidden" name="organizationId" value={organization.id} />
            <button className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-100">
              Sync Test Catalog
            </button>
          </form>
          <form action={enrichLabProfileAction}>
            <input type="hidden" name="organizationId" value={organization.id} />
            <button className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100">
              Enrich Lab Data (AI)
            </button>
          </form>
          <form action={forceEnrichLabProfileAction}>
            <input type="hidden" name="organizationId" value={organization.id} />
            <button className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100">
              Force Enrich (Bypass 1h)
            </button>
          </form>
          {organization.status === "SUSPENDED" ? (
            <form action={activateLabAction}>
              <input type="hidden" name="organizationId" value={organization.id} />
              <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-100">
                Activate Lab
              </button>
            </form>
          ) : (
            <form action={suspendLabAction}>
              <input type="hidden" name="organizationId" value={organization.id} />
              <button className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-100">
                Suspend Lab
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Plan</p>
          <p className="mt-2 text-xl font-semibold text-gray-900">{organization.plan}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Status</p>
          <p className="mt-2 text-xl font-semibold text-gray-900">{organization.status}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Created</p>
          <p className="mt-2 text-xl font-semibold text-gray-900">{formatDateTime(organization.createdAt)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Last Activity</p>
          <p className="mt-2 text-xl font-semibold text-gray-900">{stats.lastActivity ? formatDateTime(stats.lastActivity) : "-"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total Users</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.totalUsers}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total Patients</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.totalPatients}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total Test Requests</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.totalTestRequests}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Public Profile & AI</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
          <p><span className="font-medium text-gray-700">Slug:</span> {organization.slug}</p>
          <p><span className="font-medium text-gray-700">City:</span> {organization.city ?? "-"}</p>
          <p><span className="font-medium text-gray-700">State:</span> {organization.state ?? "-"}</p>
          <p><span className="font-medium text-gray-700">Country:</span> {organization.country ?? "-"}</p>
          <p><span className="font-medium text-gray-700">Website:</span> {organization.website ?? "-"}</p>
          <p><span className="font-medium text-gray-700">AI Confidence:</span> {organization.aiConfidence?.toFixed(2) ?? "-"}</p>
          <p><span className="font-medium text-gray-700">AI Source:</span> {organization.aiSource ?? "-"}</p>
          <p><span className="font-medium text-gray-700">Last Fetched:</span> {organization.lastFetchedAt ? formatDateTime(organization.lastFetchedAt) : "-"}</p>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Description:</span>{" "}
          {organization.description?.trim() ? organization.description : "No description yet"}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Billing</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="font-medium text-gray-500">Trial</p>
            <p className="mt-1 text-gray-700">Start: {organization.trialStartedAt ? formatDateTime(organization.trialStartedAt) : "-"}</p>
            <p className="text-gray-700">End: {organization.trialEndsAt ? formatDateTime(organization.trialEndsAt) : "-"}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="font-medium text-gray-500">Subscription</p>
            <p className="mt-1 text-gray-700">Start: {organization.subscriptionStartedAt ? formatDateTime(organization.subscriptionStartedAt) : "-"}</p>
            <p className="text-gray-700">End: {organization.subscriptionEndsAt ? formatDateTime(organization.subscriptionEndsAt) : "-"}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="font-medium text-gray-500">Current Controls</p>
            <p className="mt-1 text-gray-700">Watermark: {organization.watermarkEnabled ? "Enabled" : "Disabled"}</p>
            <p className="text-gray-700">Staff Limit: {organization.staffLimit ?? "Unlimited"}</p>
            <p className="text-gray-700">Last Payment: {organization.lastPaymentAt ? formatDateTime(organization.lastPaymentAt) : "-"}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800">Set Plan / Duration</h3>
          <p className="mt-2 text-xs text-gray-500">Assign a plan and optionally set how long it should last.</p>
            {planSetSuccess && (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Plan updated: <strong>{planSetName}</strong>
                {planSetDuration ? ` for ${planSetDuration} ${planSetUnit?.toLowerCase() || "days"}` : ""}
              </div>
            )}

            <form action={setOrganizationPlanAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3" method="post">
            <input type="hidden" name="organizationId" value={organization.id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Plan</label>
              <select name="plan" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm">
                <option value="STARTER">STARTER</option>
                <option value="ADVANCED">ADVANCED</option>
                <option value="TRIAL">TRIAL</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Duration</label>
              <input name="duration" type="number" min={0} placeholder="0" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Unit</label>
              <select name="unit" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm">
                <option value="DAYS">Days</option>
                <option value="MONTHS">Months</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Set Plan
              </button>
            </div>
          </form>
        </div>
        {organization.billingLockReason ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Billing lock: {organization.billingLockReason}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-semibold text-gray-700">Payment Requests</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Requested Plan</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3">Proof</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Submitted</th>
                <th className="px-5 py-3">Reviewed</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paymentRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                    No payment requests found for this lab
                  </td>
                </tr>
              ) : (
                paymentRequests.map((request) => (
                  <tr key={request.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-700">{request.requestedPlan}</td>
                    <td className="px-5 py-3 text-gray-700">{formatCurrency(asNumber(request.amount))}</td>
                    <td className="px-5 py-3 text-gray-500">{request.transactionReference ?? "-"}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {request.proofUrl ? (
                        <a className="text-blue-600 hover:underline" href={request.proofUrl} target="_blank" rel="noreferrer">
                          View proof
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          request.status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700"
                            : request.status === "REJECTED"
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{formatDateTime(request.createdAt)}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {request.reviewedAt
                        ? `${formatDateTime(request.reviewedAt)}${request.reviewedBy ? ` by ${request.reviewedBy.fullName}` : ""}`
                        : "-"}
                    </td>
                    <td className="px-5 py-3">
                      {request.status === "PENDING" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={approvePaymentRequestAction}>
                            <input type="hidden" name="organizationId" value={organization.id} />
                            <input type="hidden" name="paymentRequestId" value={request.id} />
                            <button className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50">
                              Approve
                            </button>
                          </form>
                          <form action={rejectPaymentRequestAction} className="flex items-center gap-1">
                            <input type="hidden" name="organizationId" value={organization.id} />
                            <input type="hidden" name="paymentRequestId" value={request.id} />
                            <input
                              name="rejectionNote"
                              placeholder="Reason"
                              className="h-7 rounded border border-gray-200 px-2 text-xs text-gray-700"
                            />
                            <button className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50">
                              Reject
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No action</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-semibold text-gray-700">Users</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Last Seen</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                    No users found for this lab
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{user.fullName}</td>
                    <td className="px-5 py-3 text-gray-400">{user.email}</td>
                    <td className="px-5 py-3 text-gray-600">{user.role}</td>
                    <td className="px-5 py-3 text-xs text-gray-400">{user.lastSeen ? formatDateTime(user.lastSeen) : "-"}</td>
                    <td className="px-5 py-3 text-xs text-gray-400">{formatDateTime(user.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
