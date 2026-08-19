// Reading an OpenAPI document down to the part that is a promise.
//
// A spec file is mostly prose, examples and vendor extensions. The part that
// binds a caller is small: which operations exist, which properties each
// schema has, which of them are required, and which enum values are legal.
// This module reduces a document to exactly that — a "surface" — so that two
// snapshots of the *same* api-version can be compared without a reformat, a
// reworded description or a new example registering as a change.
//
// Comparing a surface to itself over time is the whole point. Comparing one
// api-version to another is not done anywhere here: two versions differing is
// them doing their job, one version differing from itself last week is the
// story (ADR 0004).
//
// The Azure OpenAI inference specs are OpenAPI 3.x, so schemas live under
// `components.schemas` — and the dialect itself moves: 2024-06-01 through
// 2025-01-01-preview are 3.0.0, 2025-04-01-preview is 3.1.0. Swagger 2.0's
// `definitions` is read too, because other Azure data-plane specs still use it
// and a watcher that silently saw zero schemas would report "nothing changed"
// forever rather than failing loudly.

/** Schemas, whichever dialect the document is written in. */
function schemasOf(doc) {
  return doc?.definitions ?? doc?.components?.schemas ?? {};
}

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

/**
 * Reduce a parsed spec document to its comparable surface.
 *
 * Descriptions, examples, titles and `x-` extensions are deliberately dropped.
 * They change constantly and bind nobody; keeping them would bury one real
 * breaking change under a hundred rewordings.
 *
 * @param {object} doc parsed spec document
 * @param {{version?: string, channel?: string}} [meta]
 * @returns {object} surface
 */
export function contractSurface(doc, meta = {}) {
  const operations = {};
  for (const [route, item] of Object.entries(doc?.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op) continue;
      const key = `${method.toUpperCase()} ${route}`;
      operations[key] = {
        operationId: op.operationId ?? null,
        // Required parameters only. An optional parameter appearing is not a
        // promise anyone was relying on.
        required: (op.parameters ?? [])
          .filter((p) => p?.required)
          .map((p) => p?.name)
          .filter(Boolean)
          .sort(),
      };
    }
  }

  const schemas = {};
  for (const [name, schema] of Object.entries(schemasOf(doc))) {
    const properties = Object.keys(schema?.properties ?? {}).sort();
    const enums = {};
    for (const [prop, def] of Object.entries(schema?.properties ?? {})) {
      if (Array.isArray(def?.enum)) enums[prop] = [...def.enum].map(String).sort();
    }
    // A schema that is itself an enum (a named string union) carries its
    // values at the top level rather than per property.
    if (Array.isArray(schema?.enum)) enums[''] = [...schema.enum].map(String).sort();

    schemas[name] = {
      required: [...(schema?.required ?? [])].sort(),
      properties,
      enums,
    };
  }

  return {
    version: meta.version ?? null,
    channel: meta.channel ?? null,
    title: doc?.info?.title ?? null,
    specVersion: doc?.info?.version ?? null,
    // Recorded, not diffed. A version changing its own OpenAPI dialect in
    // place is worth seeing on the page, but it moves nothing a caller sends.
    dialect: doc?.openapi ?? (doc?.swagger ? `swagger ${doc.swagger}` : null),
    operations,
    schemas,
  };
}

/**
 * How a change lands on the people who already wrote code against this version.
 *
 * Recorded, but it does not decide what gets reported: a pinned api-version
 * gaining an operation is not harmful, and is still evidence that the version
 * is not frozen — which is the promise the rest of this rests on.
 */
export const BREAKING = {
  required_added: 'caller',
  operation_removed: 'caller',
  enum_removed: 'caller',
  schema_removed: 'consumer',
  property_removed: 'consumer',
  required_removed: null,
  operation_added: null,
  schema_added: null,
  property_added: null,
  enum_added: null,
};

const added = (before, after) => after.filter((x) => !before.includes(x));

/**
 * Compare two surfaces of the same api-version.
 *
 * Returns a flat list of changes rather than a nested tree: everything
 * downstream wants to count them, group them and render them as rows, and a
 * tree would have to be flattened at every one of those points.
 *
 * @param {object} before previous surface, or null on first sight
 * @param {object} after current surface
 * @returns {Array<object>} changes, stably ordered
 */
export function diffSurfaces(before, after) {
  // No previous snapshot is not "everything was added" — it is the first time
  // we looked. Reporting a whole spec as new on day one would drown the real
  // signal and would be a claim about Microsoft that we cannot support.
  if (!before) return [];

  const changes = [];
  const push = (type, target, detail) =>
    changes.push({ type, target, breaking: BREAKING[type] ?? null, ...detail });

  const beforeOps = before.operations ?? {};
  const afterOps = after.operations ?? {};
  for (const key of Object.keys(beforeOps)) {
    if (!(key in afterOps)) push('operation_removed', key, {});
  }
  for (const key of Object.keys(afterOps)) {
    if (!(key in beforeOps)) push('operation_added', key, {});
  }

  const beforeSchemas = before.schemas ?? {};
  const afterSchemas = after.schemas ?? {};
  for (const name of Object.keys(beforeSchemas)) {
    if (!(name in afterSchemas)) push('schema_removed', name, {});
  }
  for (const name of Object.keys(afterSchemas)) {
    if (!(name in beforeSchemas)) {
      push('schema_added', name, {});
      continue;
    }
    const b = beforeSchemas[name];
    const a = afterSchemas[name];

    for (const field of added(b.required ?? [], a.required ?? [])) {
      push('required_added', name, { field });
    }
    for (const field of added(a.required ?? [], b.required ?? [])) {
      push('required_removed', name, { field });
    }
    for (const field of added(b.properties ?? [], a.properties ?? [])) {
      push('property_added', name, { field });
    }
    for (const field of added(a.properties ?? [], b.properties ?? [])) {
      push('property_removed', name, { field });
    }

    const beforeEnums = b.enums ?? {};
    const afterEnums = a.enums ?? {};
    for (const field of Object.keys({ ...beforeEnums, ...afterEnums })) {
      // A property that gained or lost its enum entirely is reported through
      // the property lists above; only compare where both sides constrain it.
      if (!beforeEnums[field] || !afterEnums[field]) continue;
      for (const value of added(beforeEnums[field], afterEnums[field])) {
        push('enum_added', name, { field, value });
      }
      for (const value of added(afterEnums[field], beforeEnums[field])) {
        push('enum_removed', name, { field, value });
      }
    }
  }

  return changes;
}

/** Human wording for one change, used by the pipeline log and the page. */
export function describeChange(change) {
  const { type, target, field, value } = change ?? {};
  switch (type) {
    case 'required_added': return `${target}.${field} became required`;
    case 'required_removed': return `${target}.${field} is no longer required`;
    case 'property_added': return `${target}.${field} was added`;
    case 'property_removed': return `${target}.${field} was removed`;
    case 'enum_added': return `${target}.${field} accepts a new value “${value}”`;
    case 'enum_removed': return `${target}.${field} no longer accepts “${value}”`;
    case 'operation_added': return `${target} was added`;
    case 'operation_removed': return `${target} was removed`;
    case 'schema_added': return `schema ${target} was added`;
    case 'schema_removed': return `schema ${target} was removed`;
    default: return `${target} changed`;
  }
}

/** The symbols a change touches, for correlating against documentation. */
export function changeSymbols(change) {
  const out = [];
  if (change?.target) out.push(String(change.target));
  if (change?.field) out.push(String(change.field));
  if (change?.value) out.push(String(change.value));
  return [...new Set(out)];
}

/**
 * Thresholds for holding an implausible contract diff.
 *
 * A *pinned* api-version is supposed to be frozen, so its honest diff is
 * almost always zero and occasionally a handful. Hundreds of changes against
 * one version does not mean Microsoft rewrote it overnight — it means the
 * document we read is not the document we compared against: a truncated
 * fetch, a dialect migration, or a snapshot written by a different run.
 */
export const CONTRACT_ANOMALY_DEFAULTS = {
  /** Never hold a diff smaller than this, whatever the ratio says. */
  minChanges: 40,
  /** Hold when more of the version's own surface moved than this share. */
  maxRatio: 0.2,
};

/**
 * Should this version's diff be refused?
 *
 * Same reasoning as the roadmap's anomaly guard, and the same bluntness: the
 * change log is append-only and a spec that was mis-read once cannot be
 * re-read as it was, so a run that looks wrong is dropped rather than
 * interpreted. Held per version, not per run — one malformed document should
 * not cost the other twenty-six their comparison.
 *
 * @param {Array<object>} changes
 * @param {object|null} previous the surface being compared against
 * @param {object} [options]
 * @returns {{held: boolean, reason?: string}}
 */
export function implausibleContractDiff(changes, previous, options = {}) {
  const { minChanges, maxRatio } = { ...CONTRACT_ANOMALY_DEFAULTS, ...options };
  const count = changes?.length ?? 0;
  if (count < minChanges) return { held: false };

  const size = Object.keys(previous?.operations ?? {}).length
    + Object.keys(previous?.schemas ?? {}).length;
  // Nothing to measure against: a diff this large with no previous surface to
  // size it by is exactly the case worth refusing.
  if (size === 0) {
    return { held: true, reason: `${count} changes against an empty previous surface` };
  }

  const ratio = count / size;
  if (ratio > maxRatio) {
    return {
      held: true,
      reason: `${count} changes across a surface of ${size} (${Math.round(ratio * 100)}%)`,
    };
  }
  return { held: false };
}
