import { motion } from "motion/react";
import { Link } from "react-router-dom";

export default function SplitNotFound({ id }: { id: string }) {
  return (
    <motion.section
      className="card split-state"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <span className="badge">404</span>
      <h2>Split not found</h2>
      <p className="note">
        Split <span className="mono">#{id}</span> does not exist or is not
        reachable on this contract.
      </p>
      <Link className="ghost-link" to="/">
        Back to the list
      </Link>
    </motion.section>
  );
}
