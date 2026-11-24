import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface ShareButtonProps {
  splitId: string;
}

export function ShareButton({ splitId }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?split=${splitId}`
      : `?split=${splitId}`;

  // Generate QR code whenever the popover opens
  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(shareUrl, {
      width: 200,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setQrDataUrl);
  }, [open, shareUrl]);

  // Close when clicking outside the popover
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation(); // don't bubble to the split card's onClick
    setOpen((v) => !v);
    setCopied(false);
  }

  async function copyUrl(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API not available in some envs */
    }
  }

  return (
    <span className="share-wrapper" ref={popoverRef}>
      <button
        className="share-btn"
        aria-label={`Share split #${splitId}`}
        onClick={toggle}
        title="Share"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      {open && (
        <div
          className="share-popover"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={`Share split #${splitId}`}
        >
          <p className="share-title">Share split #{splitId}</p>

          {qrDataUrl && (
            <img
              className="share-qr"
              src={qrDataUrl}
              alt={`QR code for split #${splitId}`}
              width={200}
              height={200}
            />
          )}

          <div className="share-url-row">
            <span className="share-url mono" title={shareUrl}>
              {shareUrl}
            </span>
            <button className="share-copy-btn" onClick={copyUrl}>
              {copied ? "Copied!" : "Copy URL"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
