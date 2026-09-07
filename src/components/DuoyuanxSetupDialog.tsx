import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { providersApi } from "@/lib/api/providers";
import { useProvidersQuery } from "@/lib/query";
import type { Provider } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const USAGE_ID = "duoyuanx-usage";
const SUBSCRIPTION_ID = "duoyuanx-subscription";
const CODING_PLAN_ID = "duoyuanx-subscription-coding-plan";

function keyOf(provider: Provider, app: "claude" | "codex") {
  if (app === "claude") {
    const env = provider.settingsConfig?.env ?? {};
    return env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || "";
  }
  return provider.settingsConfig?.auth?.OPENAI_API_KEY || "";
}

function withKey(provider: Provider, app: "claude" | "codex", key: string): Provider {
  const settingsConfig = structuredClone(provider.settingsConfig ?? {});
  if (app === "claude") {
    settingsConfig.env = { ...(settingsConfig.env ?? {}), ANTHROPIC_AUTH_TOKEN: key };
  } else {
    settingsConfig.auth = { ...(settingsConfig.auth ?? {}), OPENAI_API_KEY: key };
  }
  return { ...provider, settingsConfig };
}

export function DuoyuanxSetupDialog() {
  const queryClient = useQueryClient();
  const { data: claudeData } = useProvidersQuery("claude");
  const { data: codexData } = useProvidersQuery("codex");
  const claude = claudeData?.providers ?? {};
  const codex = codexData?.providers ?? {};
  const entries = useMemo(
    () => [
      { app: "claude" as const, id: USAGE_ID, label: "duoyuanx-按量（Claude）", hint: "请填写 duoyuanx.com 站点令牌管理处密钥。", provider: claude[USAGE_ID] },
      { app: "codex" as const, id: USAGE_ID, label: "duoyuanx-按量（Codex）", hint: "请填写 duoyuanx.com 站点令牌管理处密钥。", provider: codex[USAGE_ID] },
      { app: "claude" as const, id: SUBSCRIPTION_ID, label: "duoyuanx-订阅套餐（Claude）", hint: "请填写 chat.duoyuanx.com 站点 Claude 端侧代码处 duoyuanx 分组密钥。", provider: claude[SUBSCRIPTION_ID] },
      { app: "codex" as const, id: SUBSCRIPTION_ID, label: "duoyuanx-订阅套餐（Codex）", hint: "请填写 chat.duoyuanx.com 站点 Codex 端侧代码处 Codex 分组密钥。", provider: codex[SUBSCRIPTION_ID] },
      { app: "codex" as const, id: CODING_PLAN_ID, label: "duoyuanx-订阅套餐-coding_plan", hint: "请填写 chat.duoyuanx.com 站点 Codex 端侧代码处 CodingPlan 分组密钥。", provider: codex[CODING_PLAN_ID] },
    ],
    [claude, codex],
  );
  const missing = entries.filter((entry) => entry.provider && !keyOf(entry.provider, entry.app));
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = missing.length > 0 && !dismissed;

  const save = async () => {
    setSaving(true);
    try {
      for (const entry of missing) {
        const key = (values[`${entry.app}:${entry.id}`] ?? "").trim();
        if (!key || !entry.provider) continue;
        await providersApi.update(withKey(entry.provider, entry.app, key), entry.app);
      }
      // Key 保存后立即让两套 CLI 使用按量供应商；如果用户只填写了部分 Key，
      // 仍只切换已填写且可用的应用。
      if ((values[`claude:${USAGE_ID}`] ?? "").trim()) {
        await providersApi.switch(USAGE_ID, "claude");
      }
      if ((values[`codex:${USAGE_ID}`] ?? "").trim()) {
        await providersApi.switch(USAGE_ID, "codex");
      }
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      setDismissed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && setDismissed(true)}>
      <DialogContent className="max-w-lg" zIndex="top">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-blue-500" />配置多元探索 API Key</DialogTitle>
          <DialogDescription>首次使用前填写对应分组密钥。已填写的项目不会被覆盖，之后可在供应商编辑页面修改。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-3">
          {missing.map((entry) => {
            const field = `${entry.app}:${entry.id}`;
            return <div key={field} className="space-y-1.5"><label className="text-sm font-medium">{entry.label}</label><Input type="password" value={values[field] ?? ""} onChange={(e) => setValues((old) => ({ ...old, [field]: e.target.value }))} placeholder={entry.hint} autoComplete="off" /></div>;
          })}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setDismissed(true)}>稍后填写</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : "保存并生效"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
