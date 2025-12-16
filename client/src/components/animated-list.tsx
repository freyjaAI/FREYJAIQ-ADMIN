import { motion, AnimatePresence, Variants } from "framer-motion";
import { ReactNode, useRef, useEffect, useState } from "react";

const listItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.2,
      ease: "easeOut",
    },
  }),
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.15,
    },
  },
};

interface AnimatedListProps<T> {
  items: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  itemClassName?: string;
}

export function AnimatedList<T>({
  items,
  keyExtractor,
  renderItem,
  className = "",
  itemClassName = "",
}: AnimatedListProps<T>) {
  return (
    <div className={className}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={keyExtractor(item, index)}
            custom={index}
            variants={listItemVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout
            className={itemClassName}
          >
            {renderItem(item, index)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface HighlightOnUpdateProps {
  children: ReactNode;
  updateKey: string | number;
  highlightColor?: string;
  className?: string;
}

export function HighlightOnUpdate({
  children,
  updateKey,
  highlightColor = "hsl(var(--primary) / 0.15)",
  className = "",
}: HighlightOnUpdateProps) {
  const [isHighlighted, setIsHighlighted] = useState(false);
  const prevKeyRef = useRef(updateKey);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevKeyRef.current = updateKey;
      return;
    }

    if (prevKeyRef.current !== updateKey) {
      setIsHighlighted(true);
      prevKeyRef.current = updateKey;

      const timer = setTimeout(() => {
        setIsHighlighted(false);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [updateKey]);

  return (
    <motion.div
      className={className}
      animate={{
        backgroundColor: isHighlighted ? highlightColor : "transparent",
      }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

export function FadeIn({
  children,
  delay = 0,
  duration = 0.3,
  className = "",
}: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SlideInProps {
  children: ReactNode;
  direction?: "left" | "right" | "up" | "down";
  delay?: number;
  duration?: number;
  className?: string;
}

export function SlideIn({
  children,
  direction = "up",
  delay = 0,
  duration = 0.3,
  className = "",
}: SlideInProps) {
  const directionOffset = {
    left: { x: -20, y: 0 },
    right: { x: 20, y: 0 },
    up: { x: 0, y: 20 },
    down: { x: 0, y: -20 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...directionOffset[direction] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ delay, duration, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps {
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
}

export function StaggerContainer({
  children,
  staggerDelay = 0.05,
  className = "",
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface ScaleOnHoverProps {
  children: ReactNode;
  scale?: number;
  className?: string;
}

export function ScaleOnHover({ children, scale = 1.02, className = "" }: ScaleOnHoverProps) {
  return (
    <motion.div
      whileHover={{ scale }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
