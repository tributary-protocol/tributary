# Glossary

Core terms used throughout Tributary.

| Term | Definition |
| --- | --- |
| **Split** | A routing rule stored on-chain. It holds a list of recipients and the share each one gets. Once created, anyone can push a payment through it. |
| **Share** | The fraction of a payment a recipient receives, expressed in **basis points** (hundredths of a percent). All shares in a split must sum to exactly 10,000 (100%). |
| **Basis point** | One hundredth of one percent (0.01%). 10,000 basis points = 100%. Shares are stored in basis points so they can be represented as integers with no rounding errors. |
| **Recipient** | An entry in a split that receives a portion of every payment. A recipient is either an account address or another split (enabling nested routing). |
| **Controller** | The address allowed to edit a split's recipients and shares after creation. If a split has no controller, it is **locked** and can never be changed. |
| **Escrow** | Funds held inside the contract and credited to a specific split. Created by `deposit`, paid out by `distribute`. Useful when money arrives over time and payouts happen on a schedule. |
| **Distribute** | A permissionless call that pays out a split's entire escrowed balance to its recipients according to their shares. |
| **Dust** | The tiny leftover when a payment cannot be divided evenly among recipients. Tributary always gives the dust to the last recipient so the full amount lands somewhere. |
| **Pay** | A direct, one-shot payment that splits an amount across all recipients in a single transaction. Nothing is held by the contract. |
| **Deposit** | Moves funds into the contract and credits them to a split's escrow balance without paying out immediately. |
