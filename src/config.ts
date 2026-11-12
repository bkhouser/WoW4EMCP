import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import { sourceConfigSchema, strictJson } from './acquisition.js';
import { identitySchema } from './model.js';
export const configSchema=z.object({
  database:z.string().min(1),mode:z.enum(['real','sample']).default('real'),
  pollSeconds:z.number().int().min(5).max(3600).default(15),staleSeconds:z.number().int().min(60).max(604800).default(900),
  sources:z.array(sourceConfigSchema).max(100).default([]),
  savedVariablesEnabled:z.boolean().default(true),
  optical:z.object({enabled:z.boolean().default(false),executablePath:z.string().min(1).nullable().default(null),sourceId:z.string().min(1).nullable().default(null)}).strict().default({enabled:false,executablePath:null,sourceId:null}),
  http:z.object({port:z.number().int().min(1).max(65535).default(18794),tokenSecret:z.string().regex(/^[a-zA-Z0-9_-]+$/).default('mcp-bearer')}).default({port:18794,tokenSecret:'mcp-bearer'}),
  secretDirectory:z.string().default('data/secrets'),
  blizzard:z.object({clientId:z.string().min(1),clientSecretName:z.string().default('blizzard-client-secret'),characters:z.array(identitySchema).max(100)}).optional(),
}).strict();
export type Config=z.infer<typeof configSchema>;
export function loadConfig(path=process.env.WOW_MCP_CONFIG??'config.local.json'):Config {
  const c=configSchema.parse(strictJson(readFileSync(path,'utf8'))),base=dirname(resolve(path));
  c.database=resolve(base,c.database);c.secretDirectory=resolve(base,c.secretDirectory);
  c.sources=c.sources.map(s=>({...s,path:resolve(base,s.path)}));
  if(new Set(c.sources.map(s=>s.id)).size!==c.sources.length)throw new Error('Duplicate source id');
  return c;
}
