@echo off
echo [TRIBUTARY FIX] Stashing current changes...
git stash

echo [TRIBUTARY FIX] Checking out main branch...
git checkout main

echo [TRIBUTARY FIX] Applying fix to SECURITY.md...
git checkout stash -- SECURITY.md 2>nul
:: Alternatively, overwrite SECURITY.md with the correct content directly
(
echo # Security
echo.
echo Tributary moves money, so bugs here can cost people funds. The contract is not audited yet and only testnet deployments exist. Treat mainnet use as out of bounds until an audit lands.
echo.
echo ## Reporting a vulnerability
echo.
echo Do not open a public issue for anything exploitable. Email afolabiayomide870@gmail.com with a description, reproduction steps and the affected component. You will get an answer within a few days.
echo.
echo Valid reports get credited in the release notes once a fix ships, if you want the credit.
echo.
echo ## Scope
echo.
echo - `contracts/splitter`: highest severity, anything that misroutes, locks or loses funds
echo - `sdk` and `app`: transaction construction bugs that could trick a signer
echo - Infrastructure (CI, deploy scripts): supply chain concerns
echo.
echo ## Threat Model ^& Security Architecture
echo.
echo For detailed information on trust assumptions, escrow risks, token assumptions, and known limitations, please refer to the [Security ^& Threat Model](docs/security-threat-model.md) documentation.
) > SECURITY.md

echo [TRIBUTARY FIX] Committing the fix...
git add SECURITY.md
git commit -m "Fix absolute local file link in SECURITY.md to relative path"

echo [TRIBUTARY FIX] Pushing changes to Olamidepy/tributary:main...
git push origin main

echo [TRIBUTARY FIX] Checking out original branch (feature/pay-live-preview)...
git checkout feature/pay-live-preview

echo [TRIBUTARY FIX] Restoring stashed changes...
git stash pop

echo [TRIBUTARY FIX] Done!
pause
