import { motion } from "motion/react";

export default function RefreshError({
  error,
  onRetry,
  onDismiss,
}: {
  error: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      className="refresh-error"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      <div className="refresh-error-content">
        <span className="refresh-error-icon">⚠</span>
        <div className="refresh-error-text">
          <p className="refresh-error-message">{error}</p>
          <p className="refresh-error-hint">The app will try again automatically.</p>
        </div>
      </div>
      <div className="refresh-error-actions">
        <button className="refresh-error-retry" onClick={onRetry}>
          Retry
        </button>
        <button className="refresh-error-dismiss" onClick={onDismiss}>
          ✕
        </button>
      </div>
    </motion.div>
  );
}
