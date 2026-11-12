import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { readSecret } from './secrets.js';
const client=new Client({name:'wowci-release-smoke',version:'0.2.0-beta.1'});
const c=loadConfig();
const transport=process.argv.includes('--http')?new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${c.http.port}/mcp`),{requestInit:{headers:{Authorization:'Bearer '+await readSecret(c.secretDirectory,c.http.tokenSecret)}}}):
  new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./cli.js',import.meta.url)),'stdio'],stderr:'pipe'});
try{
  await client.connect(transport);const list=await client.listTools();const characters=await client.callTool({name:'list_characters',arguments:{}});
  const structured=characters.structuredContent as {characters:{characterKey:string}[]}|undefined;
  const key=structured?.characters[0]?.characterKey;if(!key)throw new Error('No character available for smoke call');
  const quest=await client.callTool({name:'get_quest_details',arguments:{characterKey:key,questId:1740}});
  if(characters.isError||quest.isError)throw new Error('MCP returned tool error');
  console.log(JSON.stringify({transport:process.argv.includes('--http')?'streamable-http':'stdio',toolCount:list.tools.length,characters:characters.structuredContent,quest:quest.structuredContent,chatgptVerified:false},null,2));
}finally{await client.close();}
