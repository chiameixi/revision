// short random ID, prefixed by record type
import { nanoid } from "nanoid";

const PREFIX = {
  project: "p",
  node: "n",
  edge: "e",
  collection: "c",
  image: "i",
  run: "r",
  event: "ev",
} as const;

export function newId(kind: keyof typeof PREFIX): string {
  return `${PREFIX[kind]}_${nanoid(10)}`;
}

export function now(): string {
  return new Date().toISOString();
}
