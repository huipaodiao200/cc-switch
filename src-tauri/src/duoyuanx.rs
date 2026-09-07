//! Built-in Duoyuanx provider bootstrap for the branded distribution.
//!
//! The database intentionally remains the shared `~/.cc-switch` database so
//! the branded build and upstream CC Switch see and edit the same providers.

use crate::app_config::AppType;
use crate::database::Database;
use crate::provider::{Provider, ProviderMeta};
use serde_json::json;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DuoyuanxConfig {
    usage: RouteConfig,
    subscription: SubscriptionConfig,
    codingPlan: CodingPlanConfig,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RouteConfig { name: String, baseUrl: String, keyHint: String }
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscriptionConfig { name: String, claudeBaseUrl: String, codexBaseUrl: String, claudeKeyHint: String, codexKeyHint: String }
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodingPlanConfig { name: String, baseUrl: String, keyHint: String, models: Vec<String> }

fn config() -> DuoyuanxConfig {
    serde_json::from_str(include_str!("../../src/config/duoyuanxConfig.json"))
        .expect("invalid duoyuanxConfig.json")
}

const USAGE_ID: &str = "duoyuanx-usage";
const SUBSCRIPTION_ID: &str = "duoyuanx-subscription";
const CODING_PLAN_ID: &str = "duoyuanx-subscription-coding-plan";

const USAGE_NAME: &str = "duoyuanx-按量";
const SUBSCRIPTION_NAME: &str = "duoyuanx-订阅套餐";
const CODING_PLAN_NAME: &str = "duoyuanx-订阅套餐-coding_plan";

fn claude_provider(id: &str, name: &str, base_url: &str, hint: &str) -> Provider {
    let mut p = Provider::with_id(
        id.to_string(),
        name.to_string(),
        json!({"env": {
            "ANTHROPIC_BASE_URL": base_url,
            "ANTHROPIC_AUTH_TOKEN": ""
        }}),
        Some("https://duoyuanx.com".to_string()),
    );
    p.category = Some("third_party".to_string());
    p.notes = Some(hint.to_string());
    p.icon = Some("generic".to_string());
    p.icon_color = Some("#2563EB".to_string());
    p.meta = Some(ProviderMeta { api_format: Some("anthropic".to_string()), ..Default::default() });
    p
}

fn codex_provider(id: &str, name: &str, base_url: &str, hint: &str, chat: bool, models: &[String]) -> Provider {
    let config = format!(
        "model_provider = \"custom\"\nmodel = \"gpt-5.6-sol\"\nmodel_reasoning_effort = \"high\"\ndisable_response_storage = true\n\n[model_providers.custom]\nname = \"{name}\"\nbase_url = \"{base_url}\"\nwire_api = \"responses\"\nrequires_openai_auth = true"
    );
    let settings = if !models.is_empty() {
        json!({
            "auth": {"OPENAI_API_KEY": ""},
            "config": config,
            "modelCatalog": {"models": [
                {"model":models[0]}, {"model":models.get(1).cloned().unwrap_or_default()}, {"model":models.get(2).cloned().unwrap_or_default()}
            ]}
        })
    } else {
        json!({"auth": {"OPENAI_API_KEY": ""}, "config": config})
    };
    let mut p = Provider::with_id(id.to_string(), name.to_string(), settings, Some("https://duoyuanx.com".to_string()));
    p.category = Some("third_party".to_string());
    p.notes = Some(hint.to_string());
    p.icon = Some("generic".to_string());
    p.icon_color = Some("#2563EB".to_string());
    p.meta = Some(ProviderMeta { api_format: Some(if chat { "openai_chat" } else { "openai_responses" }.to_string()), ..Default::default() });
    p
}

pub fn ensure_default_providers(db: &Database) -> Result<usize, crate::error::AppError> {
    let cfg = config();
    let mut inserted = 0;
    let seeds = [
        (AppType::Claude, claude_provider(USAGE_ID, &cfg.usage.name, &cfg.usage.baseUrl, &cfg.usage.keyHint)),
        (AppType::Codex, codex_provider(USAGE_ID, &cfg.usage.name, &cfg.usage.baseUrl, &cfg.usage.keyHint, false, &[])),
        (AppType::Claude, claude_provider(SUBSCRIPTION_ID, &cfg.subscription.name, &cfg.subscription.claudeBaseUrl, &cfg.subscription.claudeKeyHint)),
        (AppType::Codex, codex_provider(SUBSCRIPTION_ID, &cfg.subscription.name, &cfg.subscription.codexBaseUrl, &cfg.subscription.codexKeyHint, false, &[])),
        (AppType::Codex, codex_provider(CODING_PLAN_ID, &cfg.codingPlan.name, &cfg.codingPlan.baseUrl, &cfg.codingPlan.keyHint, true, &cfg.codingPlan.models)),
    ];
    for (app, provider) in seeds {
        if db.get_provider_by_id(&provider.id, app.as_str())?.is_none() {
            db.save_provider(app.as_str(), &provider)?;
            inserted += 1;
        }
    }
    // On a completely new profile, make the usage providers the initial choice.
    for app in [AppType::Claude, AppType::Codex] {
        if db.get_current_provider(app.as_str())?.is_none() {
            db.set_current_provider(app.as_str(), USAGE_ID)?;
            crate::settings::set_current_provider(&app, Some(USAGE_ID))?;
        }
    }
    Ok(inserted)
}
