//! Verify a release artifact using the same public key and signature library as the updater.
use anyhow::{bail, Context};
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use std::{env, fs};

fn main() -> anyhow::Result<()> {
    let artifact = env::args()
        .nth(1)
        .context("usage: cargo run --example verify_update -- /path/to/artifact")?;
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))?;
    let public_key = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .context("missing updater public key")?;
    let public_key = PublicKey::decode(&String::from_utf8(STANDARD.decode(public_key)?)?)?;
    let encoded_signature = fs::read_to_string(format!("{artifact}.sig"))?;
    let signature = Signature::decode(&String::from_utf8(
        STANDARD.decode(encoded_signature.trim())?,
    )?)?;
    let data = fs::read(&artifact)?;
    if data.is_empty() {
        bail!("empty release artifact");
    }
    public_key.verify(&data, &signature, true)?;
    println!("Verified updater signature: {artifact}");
    Ok(())
}
