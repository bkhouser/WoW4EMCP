import { z } from 'zod';

export const text = z.string().max(2000);
export const integer = z.number().int().nonnegative();
export const timestamp = z.string().datetime();
export const identitySchema = z.object({
  gameVersion: z.enum(['forever', 'retail', 'classic-era', 'mists-classic']),
  region: z.enum(['us', 'eu', 'kr', 'tw']),
  scope: z.string().min(1).max(100), // ruleset or realm; always explicitly configured
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
}).strict();
export type Identity = z.infer<typeof identitySchema>;
export function characterKey(i: Identity): string {
  return [i.gameVersion, i.region, i.scope, i.slug].map(v => encodeURIComponent(v.toLowerCase())).join(':');
}
export const coverageSchema = z.enum(['observed', 'partial', 'unknown', 'unavailable', 'not_observed']);
export const domainSchema = z.enum(['identity', 'quests', 'quest_history', 'equipment', 'bags', 'bank',
  'reagent_bank', 'account_bank', 'talents', 'stats', 'spells', 'professions', 'reputations',
  'achievements', 'currencies', 'dungeons', 'travel', 'collections']);
export type Domain = z.infer<typeof domainSchema>;
export const domains = domainSchema.options;
export const objectiveSchema = z.object({
  text, type: text.nullable().default(null), current: integer.nullable().default(null),
  required: integer.nullable().default(null), complete: z.boolean().nullable().default(null),
  countEvidence: z.enum(['api_fields', 'parsed_text', 'unknown']).default('unknown'),
});
export const questSchema = z.object({
  id: integer.positive(), name: text, level: integer.nullable().default(null), zone: text.nullable().default(null),
  objectivesComplete: z.boolean().nullable().default(null),
  turnedIn: z.enum(['observed', 'unknown']).default('unknown'),
  objectives: z.array(objectiveSchema).max(100),
  objectivesCoverage: coverageSchema.default('unknown'),
  classification: text.nullable().default(null), canAbandon: z.boolean().nullable().default(null),
  rewards: z.array(z.object({ itemId: integer.positive(), quantity: integer.nullable(), name: text.nullable() })).max(100).default([]),
  rewardsCoverage: coverageSchema.default('not_observed'),
});
export type Quest = z.infer<typeof questSchema>;
export const itemSchema = z.object({
  itemId: integer.positive(), name: text.nullable().default(null), quantity: integer.nullable().default(null),
  bag: z.number().int().nullable().default(null), slot: integer.nullable().default(null),
  quality: integer.nullable().default(null), bound: z.boolean().nullable().default(null),
  link: text.nullable().default(null), itemLevel: integer.nullable().default(null),
  stats: z.record(z.string(),z.number().finite()).default({}),
  enchantmentId: integer.nullable().default(null),
});
export type Item = z.infer<typeof itemSchema>;
export const talentSchema = z.object({ id: integer.positive(), name: text, rank: integer, maxRank: integer.nullable().default(null), tree: text.nullable().default(null) });
export const payloadSchemas = {
  identity: z.object({ level: integer.nullable(), race: text.nullable(), class: text.nullable(),
    specialization: text.nullable().default(null), xp: integer.nullable().default(null), xpMax: integer.nullable().default(null),
    restedXp: integer.nullable().default(null), goldCopper: integer.nullable().default(null),
    location: text.nullable().default(null), build: text.nullable().default(null) }),
  quests: z.object({ entries: z.array(questSchema).max(1000), capacity: integer.nullable(), used: integer.nullable(),
    enumerationComplete: z.boolean().default(false) }),
  quest_history: z.object({ entries: z.array(z.object({ id: integer.positive(),
    kind: z.enum(['turned_in', 'completion_flag', 'removed_unknown', 'accepted']),
    at: timestamp.nullable(), evidence: text })).max(100000) }),
  equipment: z.object({ items: z.array(itemSchema).max(50) }),
  bags: z.object({ items: z.array(itemSchema).max(5000) }),
  bank: z.object({ items: z.array(itemSchema).max(5000), open: z.boolean().default(false) }),
  reagent_bank: z.object({ items: z.array(itemSchema).max(5000), open: z.boolean().default(false) }),
  account_bank: z.object({ items: z.array(itemSchema).max(5000), open: z.boolean().default(false) }),
  talents: z.object({ entries: z.array(talentSchema).max(1000), unspent: integer.nullable(), specialization: text.nullable() }),
  stats: z.object({ values: z.record(z.string(),z.number().finite()) }),
  spells: z.object({ entries: z.array(z.object({ id: integer.positive(), name: text, rank: text.nullable().default(null) })).max(5000) }),
  professions: z.object({ entries: z.array(z.object({ id: integer.positive(), name: text,
    skill: integer.nullable(), cap: integer.nullable(), observedAt: timestamp.nullable(),
    needsRefresh: z.boolean(), recipesTruncated: z.boolean(),
    recipes: z.array(z.object({ id: integer.positive(), name: text, learned: z.boolean().nullable(),
      craftable: integer.nullable().default(null) })).max(5000) })).max(30) }),
  reputations: z.object({ entries: z.array(z.object({ id: integer.positive(), name: text, standing: integer.nullable(), value: z.number().nullable() })).max(1000) }),
  achievements: z.object({ entries: z.array(z.object({ id: integer.positive(), name: text.nullable(), completed: z.boolean().nullable() })).max(50000) }),
  currencies: z.object({ entries: z.array(z.object({ id: integer.positive(), name: text, quantity: integer.nullable() })).max(1000) }),
  dungeons: z.object({ entries: z.array(z.object({ name: text, id: integer.nullable(), locked: z.boolean().nullable(), resetSeconds: integer.nullable(), encounters: integer.nullable(), completedEncounters: integer.nullable() })).max(500) }),
  travel: z.object({ hearthLocation: text.nullable(), flightNodes: z.array(z.object({ name: text, state: text })).max(1000), hearthCooldownSeconds: z.number().nonnegative().nullable() }),
  collections: z.object({ entries: z.array(z.object({ id: integer.positive(), name: text.nullable(), kind: text })).max(50000) }),
} satisfies Record<Domain, z.ZodTypeAny>;
export type Payload<D extends Domain> = z.infer<(typeof payloadSchemas)[D]>;
export const observationSchema = z.object({
  transport: z.enum(['savedvariables','optical']).optional(),
  domain: domainSchema, coverage: coverageSchema, observedAt: timestamp.nullable(),
  basis: z.enum(['direct', 'derived', 'unknown']), notes: z.array(text).max(40).default([]), payload: z.unknown(),
}).superRefine((o, ctx) => {
  if (o.payload === null && !['observed', 'partial'].includes(o.coverage)) return;
  const result = payloadSchemas[o.domain].safeParse(o.payload);
  if (!result.success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid ${o.domain} payload: ${result.error.message}` });
  if (['observed','partial'].includes(o.coverage) && o.payload == null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Observed payload required' });
});
export type Observation = z.infer<typeof observationSchema>;
export const snapshotSchema = z.object({
  schemaVersion: z.literal(1), identity: identitySchema,
  subject: z.object({playerName:text,realm:text}).optional(),
  source: z.enum(['addon', 'wowadvisor', 'blizzard', 'sample']),
  sample: z.boolean(), capturedAt: timestamp, observations: z.array(observationSchema).max(40),
}).strict().superRefine((s,c) => {
  if (s.sample !== (s.source === 'sample')) c.addIssue({code:'custom',message:'Sample provenance mismatch'});
  if (new Set(s.observations.map(o=>o.domain)).size !== s.observations.length) c.addIssue({code:'custom',message:'Duplicate domain'});
  for (const o of s.observations) if (o.observedAt && Date.parse(o.observedAt)>Date.parse(s.capturedAt)) c.addIssue({code:'custom',message:'Observation postdates capture'});
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export function validateSnapshot(value: unknown, now = new Date()): Snapshot {
  const s = snapshotSchema.parse(value);
  if (Date.parse(s.capturedAt) > now.getTime() + 300_000) throw new Error('Snapshot clock is more than five minutes in the future');
  return s;
}
export function observation<D extends Domain>(domain: D, payload: Payload<D>, observedAt: string | null,
  coverage: Observation['coverage'] = 'observed', notes: string[] = [], basis: Observation['basis'] = 'direct'): Observation {
  return observationSchema.parse({ domain, payload: payloadSchemas[domain].parse(payload), observedAt, coverage, notes, basis });
}
