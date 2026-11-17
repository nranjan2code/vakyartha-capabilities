import { isIP } from "node:net";
import { object, text } from "./evidence.ts";

export const AREAS = [
  ["billing", "Billing and subscription ownership"], ["identity", "Identity and privileged access"],
  ["organization", "Management groups and subscriptions"], ["network", "Network connectivity and DNS"],
  ["security", "Security and recovery"], ["management", "Monitoring and operations"],
  ["governance", "Policy and exceptions"], ["automation", "Deployment pipeline"],
] as const;
export const REVIEW = ["Pending", "Verified", "Gap", "Exception"] as const;
export type Finding = { status: string; evidence: string };
export type Landing = { name: string; kind: string; region: string; managementGroup: string; network: string; cidr: string; owner: string; change: string };
export const landingBlank = (): Landing => ({ name: "", kind: "Application", region: "", managementGroup: "", network: "Hub and spoke", cidr: "", owner: "", change: "" });

export function landing(input: unknown, ready = false): Landing {
  const r = object(input);
  const out = Object.fromEntries(Object.keys(landingBlank()).map(k => [k, text(r[k], 150, k).trim()])) as Landing;
  if (!["Platform", "Application"].includes(out.kind) || !["Hub and spoke", "Virtual WAN", "Isolated"].includes(out.network)) throw Error("Select a valid landing zone type and topology.");
  if (ready && (!out.name || !out.region || !out.managementGroup || !out.cidr || !out.owner || !out.change)) {
    throw Error("Enter the plan name, primary region, management group, CIDR, owner, and change reference.");
  }
  if (out.region && !/^[a-z][a-z0-9]{1,40}$/.test(out.region)) throw Error("Use the Azure region code, such as centralindia.");
  if (out.managementGroup && !/^[A-Za-z0-9._()-]{1,90}$/.test(out.managementGroup)) throw Error("Enter a valid management group ID.");
  if (out.cidr) {
    const [address, prefix, extra] = out.cidr.split("/");
    if (!address || !prefix || extra !== undefined || isIP(address) !== 4 || !/^([0-9]|[12][0-9]|3[0-2])$/.test(prefix)) throw Error("Enter an IPv4 CIDR, such as 10.10.0.0/16.");
    const hostBits = BigInt(32 - Number(prefix));
    const addr = address.split(".").reduce((total, part) => (total << 8n) + BigInt(part), 0n);
    if ((addr & ((1n << hostBits) - 1n)) !== 0n) throw Error("Use the network address for the entered CIDR prefix.");
  }
  return out;
}

export function finding(input: unknown, publishing = false): Finding {
  const r = object(input);
  const status = REVIEW.find(k => k === r.status);
  const evidence = text(r.evidence, 750, "finding evidence").trim();
  if (!status) throw Error("Select a finding status.");
  if (publishing && status !== "Pending" && !evidence) throw Error("Record evidence for this finding.");
  return { status, evidence };
}

export const STRATEGIES = ["Rehost", "Replatform", "Refactor", "Replace", "Retain", "Retire"] as const;
export const STAGES = ["Discovery", "Assessed", "Tested", "Approved", "Cut over", "Verified", "Rolled back"] as const;
export type Workload = {
  key: string; name: string; source: string; owner: string; target: string; strategy: string; wave: string;
  dependencies: string; blocker: string; rollback: string; test: string; approval: string; outcome: string; stage: string;
};
export const workloadBlank = (): Workload => ({
  key: "", name: "", source: "", owner: "", target: "", strategy: "Rehost", wave: "1", dependencies: "",
  blocker: "", rollback: "", test: "", approval: "", outcome: "", stage: "Discovery",
});
export const keyPattern = /^[a-z][a-z0-9-]{0,39}$/;
export const dependencies = (w: Workload) => w.dependencies.split(",").map(k => k.trim()).filter(Boolean);
const moving = (w: Workload) => w.strategy !== "Retain" && w.strategy !== "Retire";

export function availableStages(current: string, strategy: string): string[] {
  const willMove = strategy !== "Retain" && strategy !== "Retire";
  const next: Record<string, string[]> = {
    Discovery: ["Assessed"], Assessed: willMove ? ["Discovery", "Tested"] : ["Discovery", "Verified"],
    Tested: ["Assessed", "Approved"], Approved: ["Assessed", "Cut over"], "Cut over": ["Verified", "Rolled back"],
    Verified: willMove ? ["Rolled back"] : ["Assessed"], "Rolled back": ["Assessed"],
  };
  return [current, ...(next[current] ?? [])];
}

export function workload(value: unknown): Workload {
  const r = object(value);
  const out = Object.fromEntries(Object.keys(workloadBlank()).map(k => [
    k, text(r[k], ["blocker", "rollback", "test", "approval", "outcome"].includes(k) ? 750 : 160, k).trim(),
  ])) as Workload;
  if (!(STRATEGIES as readonly string[]).includes(out.strategy) || !(STAGES as readonly string[]).includes(out.stage)) throw Error("Select a valid strategy and stage.");
  return out;
}

export function saveWorkload(draft: Workload, existing: Workload[], editing: string): Workload[] {
  const next = workload(draft);
  if (!keyPattern.test(next.key) || !next.name || !next.owner || !next.source || !/^[1-9]\d?$/.test(next.wave)) {
    throw Error("Enter a unique workload key, name, owner, source reference and wave from 1 to 99.");
  }
  const prior = existing.find(w => w.key === editing);
  if (editing && (!prior || editing !== next.key)) throw Error("The saved workload key is fixed.");
  if (!prior && existing.some(w => w.key === next.key)) throw Error("This workload key is already in use.");
  if (!prior && existing.length >= 150) throw Error("This subscription supports up to 150 workloads.");
  const peers = new Map(existing.map(w => [w.key, w]));
  const deps = dependencies(next);
  if (deps.length > 12 || new Set(deps).size !== deps.length || deps.some(k => k === next.key || !peers.has(k))) {
    throw Error("Dependencies must be distinct saved workload keys in this migration plan.");
  }
  if (deps.some(k => Number(peers.get(k)!.wave) > Number(next.wave))) throw Error("A dependency cannot be scheduled in a later wave.");
  if (existing.some(w => w.key !== next.key && dependencies(w).includes(next.key) && Number(w.wave) < Number(next.wave))) {
    throw Error("This wave would move a prerequisite after its dependent workload.");
  }
  const visited = new Set<string>();
  const reaches = (key: string): boolean => {
    if (key === next.key) return true;
    if (visited.has(key)) return false;
    visited.add(key);
    return dependencies(peers.get(key)!).some(reaches);
  };
  if (deps.some(reaches)) throw Error("These dependencies create a cycle.");
  next.dependencies = deps.join(", ");

  const from = prior?.stage ?? "Discovery";
  if (!availableStages(from, next.strategy).includes(next.stage)) throw Error(`Move this workload to a stage available after ${from}.`);
  if (prior && ["Approved", "Cut over", "Verified"].includes(prior.stage) && next.stage !== "Assessed") {
    for (const key of ["source", "target", "wave", "strategy", "dependencies", "rollback", "test", "approval"] as const) {
      if (next[key] !== prior[key]) throw Error("Return for assessment before changing approved inputs.");
    }
  }
  if (next.stage !== "Discovery" && moving(next) && !next.target) throw Error("Record the assessed migration target.");
  if (["Tested", "Approved", "Cut over", "Verified", "Rolled back"].includes(next.stage) && moving(next) && (!next.test || !next.rollback)) {
    throw Error("Record the test result and rollback plan before proceeding.");
  }
  if (["Approved", "Cut over", "Verified", "Rolled back"].includes(next.stage) && !next.approval) {
    throw Error("Record the reviewed approval or sign-off reference.");
  }
  if (from !== next.stage && ["Approved", "Cut over"].includes(next.stage) && next.blocker) throw Error("Resolve the blocker before proceeding.");
  if (from !== next.stage && next.stage === "Cut over" && deps.some(k => !["Cut over", "Verified"].includes(peers.get(k)!.stage))) {
    throw Error("Complete prerequisite workload cutovers or validations first.");
  }
  if (["Verified", "Rolled back"].includes(next.stage) && !next.outcome) throw Error("Record validation or rollback evidence.");
  return prior ? existing.map(w => w.key === editing ? next : w) : [...existing, next];
}
