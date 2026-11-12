# Private ChatGPT connection

The supported beta route is **Secure MCP Tunnel with stdio**. Your Windows PC keeps the database and initiates outbound HTTPS; no public data listener is necessary. This workflow was verified on one installation, not guaranteed for all accounts. Account access and product availability can vary. Consult the [official tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) and [custom MCP guide](https://developers.openai.com/api/docs/guides/custom-mcp-server).

## Set up your own connection

1. Finish the README's local capture setup. Confirm `npm run doctor` and `npm run smoke` succeed for your intended configuration.
2. Run `.\scripts\Install-TunnelClient.ps1`. It downloads official **v0.0.20 Windows x64**, checks the release checksum and the fixed SHA256 in the script, and preserves the upstream license files. It does not create account resources.
3. In [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels), create a dedicated tunnel associated only with your intended personal ChatGPT workspace. Creation requires Tunnels Read + Manage; runtime access uses Tunnels Read + Use. Record your tunnel ID privately.
4. Create a dedicated runtime key with only Tunnels Read + Use permissions. Store it using `.\scripts\Set-Secret.ps1 -Name openai-tunnel-runtime`, which prompts locally without echoing. Never paste keys in issues or chats. No model API calls are made by this project.
5. Start the managed runtime, substituting your actual ID:

```powershell
.\scripts\Connect-Tunnel.ps1 -TunnelId 'YOUR_TUNNEL_ID'
.\tools\tunnel-client\tunnel-client.exe runtimes status wow-character-intelligence --json
```

`Connect-Tunnel.ps1` reads current-user DPAPI into the child environment and uses an environment reference in the profile. The runtime continues after the setup command exits. Use this command after reboot; companion startup alone does not restart the tunnel. Inspect status in your normal Windows host, since an isolated sandbox may misreport process/network availability.

6. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select **+ → Add custom MCP server**, name your plugin, choose **Tunnel**, and select your dedicated tunnel.
7. For this owner-private stdio setup, select **No authentication** at the upstream MCP layer. The surrounding tunnel is authenticated and stdio uses private inherited pipes. This choice is **not appropriate for a public HTTP endpoint**. Review the account's connection/data-sharing dialog before connecting.
8. Keep the plugin private and owner-only. Start a chat with it and request `list_characters`, then `get_quest_details` for your actual character key and a known quest ID. Confirm a real tool invocation, `sample:false`, observation timestamp, objective counts and unknown/unobserved fields. Installation alone is not proof of successful connectivity.

## Reliability and troubleshooting

Tunnel-client 0.0.20 can return `mcp_initialization_required` for overlapping startup calls. Both launch scripts set the upstream documented `MCP_STDIO_SEND_INITIALIZED_NOTIFICATION=true` compatibility option. Parallel verification batches succeeded after this mitigation, but a later cold restart produced one network timeout; a sequential retry succeeded. See [upstream deployment limits](https://github.com/openai/tunnel-client/blob/v0.0.20/docs/configuration.md#stdio-deployment-limits).

Retry a failed read-only call once sequentially. If it still fails, inspect the runtime's local health/UI and logs. Never interpret a transport failure as missing game data. Availability across reboot or network interruption is not certified. Keep only one poller for this tunnel, and do not reuse another application's tunnel or key.

```powershell
# Stop only this runtime; this does not stop the collector:
.\tools\tunnel-client\tunnel-client.exe runtimes stop wow-character-intelligence
```

Revoke the plugin, tunnel and runtime key separately in account settings when retiring the installation. Local uninstall cannot revoke remote resources or erase tool results already returned to ChatGPT.

## Alternative clients and hosting

Any authorized local MCP client can use stdio with `node dist/src/cli.js stdio --config config.local.json`. The local `plugin.json`/`mcp.json` package expects dependencies and the compiled `dist` directory; initialize it first. Uploading source alone does not make a Windows PC reachable from ChatGPT.

The loopback Streamable HTTP server is authenticated but is **not** a public OAuth resource server. Remote public hosting would need HTTPS, OAuth discovery/PKCE, verified issuer/audience/expiry/scopes, per-owner subject authorization, secure synchronization and operational monitoring. Those are outside this beta.
