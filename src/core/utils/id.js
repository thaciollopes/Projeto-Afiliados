import { randomUUID, randomBytes } from 'node:crypto';

export const uuid = () => randomUUID();

/** ID curto e legivel, com prefixo por entidade: "prd_k3f9a2b1" */
export function newId(prefix = 'id') {
  return `${prefix}_${randomBytes(5).toString('hex')}`;
}

export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
