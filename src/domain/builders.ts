// Builders for new entities with fresh IDs and timestamps.

import { newId, now } from "./ids";
import type { Collection, Edge, EdgeKind, IdeaNode, ImageRef, NodeId, Origin, Region, Relation, Role, RoleDetails } from "./types";

export interface NewNodeInput {
  role: Role;
  title: string;
  body?: string;
  image?: ImageRef;
  details?: RoleDetails;
}

export function makeNode(input: NewNodeInput, origin: Origin = { kind: "user" }): IdeaNode {
  return { id: newId("node"), ...input, origin, createdAt: now() };
}

export function makeEdge(
  from: NodeId,
  to: NodeId,
  kind: EdgeKind,
  opts: { origin?: Origin; relation?: Relation; region?: Region | "whole" } = {},
): Edge {
  return {
    id: newId("edge"),
    from,
    to,
    kind,
    relation: opts.relation,
    region: opts.region,
    origin: opts.origin ?? { kind: "user" },
    createdAt: now(),
  };
}

export function makeCollection(title: string, color: string, nodeIds: NodeId[] = []): Collection {
  return { id: newId("collection"), title, color, nodeIds, createdAt: now() };
}
