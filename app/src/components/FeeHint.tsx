import { useEffect, useState } from "react";
import { AssembledTx, feeStroops } from "../lib/fees";
import { fromStroops } from "../lib/tributary";
import { useTranslation } from "../lib/i18n";

/**
 * Simulates the transaction the caller is about to sign and shows its fee.
 * Pass `assemble: null` while the form is incomplete to hide the hint.
 */
export default function FeeHint({
  assemble,
  labelKey = "estimatedFee",
}: {
  assemble: (() => Promise<AssembledTx>) | null;
  labelKey?: string;
}) {
  const { t } = useTranslation();
  const [fee, setFee] = useState<bigint | null>(null);

  useEffect(() => {
    setFee(null);
    if (!assemble) return;
    let active = true;
    const timer = setTimeout(() => {
      assemble()
        .then((tx) => {
          if (active) setFee(feeStroops(tx));
        })
        .catch(() => {});
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [assemble]);

  if (fee === null) return null;
  return (
    <p className="hint">
      {t(labelKey)}: ~{fromStroops(fee)} XLM
    </p>
  );
}
