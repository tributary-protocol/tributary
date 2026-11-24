use soroban_spec::read::from_wasm;
use std::env;
use std::fs;
use stellar_xdr::curr::ScSpecEntry;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: spec-extractor <path-to-wasm>");
        return;
    }
    let wasm = fs::read(&args[1]).unwrap();
    let entries: Vec<ScSpecEntry> = from_wasm(&wasm).unwrap();

    for entry in &entries {
        // Try different serialization approaches
        // Approach 1: via serde
        let json = serde_json::to_value(entry).unwrap();
        println!("JSON: {}", serde_json::to_string(&json).unwrap());
    }
    eprintln!("--- {} entries total ---", entries.len());
}
