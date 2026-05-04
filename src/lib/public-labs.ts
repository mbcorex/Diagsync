import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAllRankings } from "@/lib/ranking/get-all-rankings";

export function locationToSlug(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "-");
}

export function slugToLocation(value: string) {
  return value.replace(/-/g, " ").trim();
}

export function normalizeLocation(input: string) {
  return slugToLocation(input).toLowerCase();
}

export async function getCachedRankings(period: "weekly" | "monthly" = "weekly") {
  const loader = unstable_cache(
    async () => getAllRankings(period),
    [`public-rankings-${period}`],
    { revalidate: 600, tags: [`public-rankings-${period}`] }
  );
  return loader();
}

export async function getPublicLabsByLocation(locationSlug: string) {
  const normalized = normalizeLocation(locationSlug);
  const rankings = await getCachedRankings("monthly");
  const items = rankings.items.filter((item) => item.city.toLowerCase() === normalized);
  if (items.length === 0) return [];

  const orgs = await prisma.organization.findMany({
    where: {
      id: { in: items.map((i) => i.organizationId) },
    },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      country: true,
      slug: true,
      description: true,
      website: true,
      logoUrl: true,
      images: true,
      aiConfidence: true,
    },
  });
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  return items
    .map((r) => {
      const org = orgMap.get(r.organizationId);
      if (!org) return null;
      return { ranking: r, org };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
}

export async function getPublicLabProfile(locationSlug: string, slug: string) {
  const normalized = normalizeLocation(locationSlug);
  const lab = await prisma.organization.findFirst({
    where: {
      slug,
      city: { equals: normalized, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      state: true,
      country: true,
      address: true,
      phone: true,
      description: true,
      website: true,
      logoUrl: true,
      images: true,
      aiConfidence: true,
      aiSource: true,
    },
  });
  if (!lab) return null;

  const rankings = await getCachedRankings("monthly");
  const ranking = rankings.items.find((x) => x.organizationId === lab.id) ?? null;
  return { lab, ranking };
}

export async function getPublicLabLocations() {
  const rankings = await getCachedRankings("monthly");
  const grouped = new Map<
    string,
    { city: string; count: number; avgScore: number; topLabName: string | null; topScore: number }
  >();

  for (const item of rankings.items) {
    const key = item.city.trim().toLowerCase();
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        city: item.city,
        count: 1,
        avgScore: item.finalScore,
        topLabName: item.labName,
        topScore: item.finalScore,
      });
      continue;
    }
    const nextCount = existing.count + 1;
    existing.avgScore = (existing.avgScore * existing.count + item.finalScore) / nextCount;
    existing.count = nextCount;
    if (item.finalScore > existing.topScore) {
      existing.topScore = item.finalScore;
      existing.topLabName = item.labName;
    }
    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      slug: locationToSlug(entry.city),
      avgScore: Math.round(entry.avgScore * 100) / 100,
      topScore: Math.round(entry.topScore * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore);
}
