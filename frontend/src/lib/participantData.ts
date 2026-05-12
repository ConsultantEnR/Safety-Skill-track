type ParticipantBundleView = "dashboard" | "tests" | "names";

type ParticipantBundle<TProfile = any, TAssignment = any> = {
  profile: TProfile;
  tests: TAssignment[];
};

const CACHE_TTL_MS = 30_000;

const bundleCache = new Map<string, { at: number; value: ParticipantBundle }>();
const bundleInflight = new Map<string, Promise<ParticipantBundle>>();
const profileCache = new Map<string, { at: number; value: any }>();
const profileInflight = new Map<string, Promise<any>>();

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function cacheKey(accessToken: string, view: ParticipantBundleView) {
  return `${accessToken}:${view}`;
}

async function fetchProfile(accessToken: string, force = false) {
  const key = accessToken;
  const now = Date.now();
  const cached = profileCache.get(key);

  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  if (!force && profileInflight.has(key)) {
    return profileInflight.get(key)!;
  }

  const request = fetch("/api/participant/profile", {
    headers: authHeaders(accessToken),
  }).then((r) => r.json()).then((profile) => {
    profileCache.set(key, { at: Date.now(), value: profile });
    return profile;
  }).finally(() => {
    profileInflight.delete(key);
  });

  profileInflight.set(key, request);
  return request;
}

export function clearParticipantDataCache() {
  bundleCache.clear();
  bundleInflight.clear();
  profileCache.clear();
  profileInflight.clear();
}

export async function loadParticipantProfile<TProfile = any>(
  accessToken: string,
  options?: { force?: boolean }
): Promise<TProfile> {
  return fetchProfile(accessToken, options?.force ?? false) as Promise<TProfile>;
}

export async function loadParticipantBundle<TProfile = any, TAssignment = any>(
  accessToken: string,
  options?: { force?: boolean; view?: ParticipantBundleView }
): Promise<ParticipantBundle<TProfile, TAssignment>> {
  const force = options?.force ?? false;
  const view = options?.view ?? "tests";
  const key = cacheKey(accessToken, view);
  const now = Date.now();
  const cached = bundleCache.get(key);

  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value as ParticipantBundle<TProfile, TAssignment>;
  }

  if (!force && bundleInflight.has(key)) {
    return bundleInflight.get(key)! as Promise<ParticipantBundle<TProfile, TAssignment>>;
  }

  const request = Promise.all([
    fetchProfile(accessToken, force),
    fetch(`/api/participant/tests?view=${view}`, { headers: authHeaders(accessToken) }).then((r) => r.json()),
  ]).then(([profile, tests]) => {
    const bundle = {
      profile,
      tests: Array.isArray(tests) ? tests : [],
    };
    bundleCache.set(key, { at: Date.now(), value: bundle });
    return bundle;
  }).finally(() => {
    bundleInflight.delete(key);
  });

  bundleInflight.set(key, request);
  return request as Promise<ParticipantBundle<TProfile, TAssignment>>;
}
