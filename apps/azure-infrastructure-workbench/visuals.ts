import type { Asset } from "./evidence.ts";
import { dependencies, type Workload } from "./plan.ts";

const compact = (label: string, max = 32) => label.length > max ? label.slice(0, max - 1) + "…" : label;
const groupOf = (asset: Asset) => asset.group.toLowerCase();
const mapPageSize = 8;

export function inventoryVisuals(assets: Asset[], selected: string, page: number) {
  const regions = new Map<string, number>();
  const groups = new Map<string, { label: string; assets: Asset[] }>();
  for (const asset of assets) {
    const region = asset.location || "Global or unknown";
    regions.set(region, (regions.get(region) ?? 0) + 1);
    const key = groupOf(asset);
    const group = groups.get(key) ?? { label: asset.group || "Subscription-level", assets: [] };
    group.assets.push(asset);
    groups.set(key, group);
  }
  const ranked = [...regions].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const byRegion = ranked.slice(0, 6).map(([label, count]) => ({ label, count }));
  if (ranked.length > 6) byRegion.push({ label: "Other regions", count: ranked.slice(6).reduce((sum, [, n]) => sum + n, 0) });
  const options = [...groups].sort((a, b) => b[1].assets.length - a[1].assets.length || a[1].label.localeCompare(b[1].label)).map(([key, group]) => ({
    value: "group/" + key, label: group.label + " · " + group.assets.length,
  }));
  const chosen = options.find(x => x.value === selected)?.value ?? options[0]?.value ?? "";
  const group = groups.get(chosen.slice("group/".length));
  const shown = group?.assets ?? [];
  const pages = Math.ceil(shown.length / mapPageSize);
  const index = Math.min(Math.max(page, 0), Math.max(pages - 1, 0));
  const start = index * mapPageSize;
  const sample = shown.slice(start, start + mapPageSize);
  const nodes = group ? [
    { id: "group", label: compact(group.label), note: `${group.label}. ${shown.length} resources in the loaded capture.`, group: "Resource group" },
    ...sample.map((asset, i) => ({ id: `resource-${i}`, label: compact(asset.name), note: `${asset.name} · ${asset.type} · ${asset.location || "Unknown region"} · ${asset.id}`, group: "Resource" })),
  ] : [];
  const edges = sample.map((_, i) => ({ from: "group", to: `resource-${i}` }));
  return {
    byRegion, options, chosen, index, pages, nodes, edges,
    summary: group ? `${group.label} · showing resources ${start + 1}–${start + sample.length} of ${shown.length}. Lines show membership from the inventory.` : "",
  };
}
export function dependencyVisual(workloads: Workload[], selected: string) {
  const target = workloads.find(w => w.key === selected) ?? workloads.find(w => dependencies(w).length > 0) ?? workloads[0];
  if (!target) return { target: "", nodes: [], edges: [] };
  const keys = new Set(dependencies(target));
  const prerequisites = workloads.filter(w => keys.has(w.key));
  const nodes = [target, ...prerequisites].map(w => ({
    id: w.key, label: compact(w.name), note: `${w.name} · Wave ${w.wave} · ${w.stage}`,
    group: w.key === target.key ? "Selected workload" : "Prerequisite",
  }));
  return { target: target.key, nodes, edges: prerequisites.map(w => ({ from: w.key, to: target.key })) };
}
