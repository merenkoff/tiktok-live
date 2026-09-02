import { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  children: ReactNode;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
  delay?: number;
}

/** A small white card that floats over a bolder background — real UI fragments
 * presented as a collage element instead of one flat screenshot rectangle. */
export function FloatingCard({ children, rotate = 0, className = '', style, delay = 0 }: Props) {
  return (
    <motion.div
      className={`bg-paper rounded-2xl shadow-2xl overflow-hidden ${className}`}
      style={style}
      initial={{ opacity: 0, y: 30, rotate: rotate - 4 }}
      whileInView={{ opacity: 1, y: 0, rotate }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
