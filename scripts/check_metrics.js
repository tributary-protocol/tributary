const fs = require('fs');
const path = require('path');

const TOLERANCE = 0.05; // 5%

function main() {
    const baselinePath = process.argv[2] || 'contracts/splitter/baseline.json';
    const costsPath = process.argv[3] || 'contracts/splitter/costs.json';

    if (!fs.existsSync(baselinePath)) {
        console.error(`Baseline not found at ${baselinePath}. Cannot check metrics.`);
        process.exit(1);
    }
    if (!fs.existsSync(costsPath)) {
        console.error(`Costs file not found at ${costsPath}. Run benchmark first.`);
        process.exit(1);
    }

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const costs = JSON.parse(fs.readFileSync(costsPath, 'utf8'));

    let regression = false;

    for (const [scenario, metrics] of Object.entries(costs)) {
        if (!baseline[scenario]) {
            console.log(`[NEW] ${scenario}: cpu=${metrics.cpu}, mem=${metrics.mem}`);
            continue;
        }
        
        const base = baseline[scenario];
        
        // Check CPU
        if (metrics.cpu > base.cpu * (1 + TOLERANCE)) {
            console.error(`[REGRESSION] ${scenario} CPU increased from ${base.cpu} to ${metrics.cpu} (+${((metrics.cpu / base.cpu - 1) * 100).toFixed(2)}%)`);
            regression = true;
        } else if (metrics.cpu < base.cpu * (1 - TOLERANCE)) {
            console.log(`[IMPROVEMENT] ${scenario} CPU decreased from ${base.cpu} to ${metrics.cpu} (${((metrics.cpu / base.cpu - 1) * 100).toFixed(2)}%)`);
        } else {
            console.log(`[OK] ${scenario} CPU: ${metrics.cpu} (baseline: ${base.cpu})`);
        }

        // Check Memory
        if (metrics.mem > base.mem * (1 + TOLERANCE)) {
            console.error(`[REGRESSION] ${scenario} Memory increased from ${base.mem} to ${metrics.mem} (+${((metrics.mem / base.mem - 1) * 100).toFixed(2)}%)`);
            regression = true;
        } else if (metrics.mem < base.mem * (1 - TOLERANCE)) {
            console.log(`[IMPROVEMENT] ${scenario} Memory decreased from ${base.mem} to ${metrics.mem} (${((metrics.mem / base.mem - 1) * 100).toFixed(2)}%)`);
        } else {
            console.log(`[OK] ${scenario} Mem: ${metrics.mem} (baseline: ${base.mem})`);
        }
    }

    if (regression) {
        console.error('\nMetrics regression detected. If this is a legitimate baseline update, commit the new costs.json as baseline.json.');
        process.exit(1);
    } else {
        console.log('\nAll metrics within tolerance.');
    }
}

main();
