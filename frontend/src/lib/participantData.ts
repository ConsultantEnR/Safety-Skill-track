type ParticipantBundle<TProfile = any, TAssignment = any> = {
  profile: TProfile;
  tests: TAssignment[];
};

const CACHE_TTL_MS = 30_000;

let cachedToken: string | null = null;
let cachedAt = 0;
let cachedBundle: ParticipantBundle | null = null;
let inFlightBundle: Promise<ParticipantBundle> | null = null;

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export function clearParticipantDataCache() {
  cachedToken = null;
  cachedAt = 0;
  cachedBundle = null;
  inFlightBundle = null;
}

export async function loadParticipantBundle<TProfile = any, TAssignment = any>(
  accessToken: string,
  options?: { force?: boolean }
): Promise<ParticipantBundle<TProfile, TAssignment>> {
  const force = options?.force ?? false;
  const now = Date.now();

  if (
    !force &&
    cachedBundle &&
    cachedToken === accessToken &&
    now - cachedAt < CACHE_TTL_MS
  ) {
    return cachedBundle as ParticipantBundle<TProfile, TAssignment>;
  }

  if (!force && inFlightBundle && cachedToken === accessToken) {
    return inFlightBundle as Promise<ParticipantBundle<TProfile, TAssignment>>;
  }

  cachedToken = accessToken;
  inFlightBundle = Promise.all([
    fetch("/api/participant/profile", { headers: authHeaders(accessToken) }).then((r) => r.json()),
    fetch("/api/participant/tests", { headers: authHeaders(accessToken) }).then((r) => r.json()),
  ]).then(([profile, tests]) => {
    const bundle = {
      profile,
      tests: Array.isArray(tests) ? tests : [],
    };
    cachedBundle = bundle;
    cachedAt = Date.now();
    return bundle;
  }).finally(() => {
    inFlightBundle = null;
  });

  return inFlightBundle as Promise<ParticipantBundle<TProfile, TAssignment>>;
}
