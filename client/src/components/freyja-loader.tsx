import { motion } from "framer-motion";

interface FreyjaLoaderProps {
  message?: string;
  submessage?: string;
  size?: "sm" | "md" | "lg";
}

export function FreyjaLoader({ 
  message = "Enriching through proprietary FreyjaIQ waterfall",
  submessage,
  size = "md" 
}: FreyjaLoaderProps) {
  const sizeConfig = {
    sm: { logo: "h-8 w-8", text: "text-sm", gap: "gap-3" },
    md: { logo: "h-12 w-12", text: "text-base", gap: "gap-4" },
    lg: { logo: "h-16 w-16", text: "text-lg", gap: "gap-5" },
  };

  const config = sizeConfig[size];

  return (
    <div className="flex flex-col items-center justify-center" data-testid="freyja-loader">
      <div className={`flex flex-col items-center ${config.gap}`}>
        <div className="relative">
          <motion.div
            className={`${config.logo} rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25`}
            animate={{
              boxShadow: [
                "0 10px 25px -5px rgba(139, 92, 246, 0.25)",
                "0 10px 40px -5px rgba(139, 92, 246, 0.4)",
                "0 10px 25px -5px rgba(139, 92, 246, 0.25)",
              ],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <span className="text-white font-bold text-lg">F</span>
          </motion.div>
          
          <div className="absolute -inset-3">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-2xl border border-purple-500/30"
                initial={{ opacity: 0, scale: 1 }}
                animate={{
                  opacity: [0, 0.5, 0],
                  scale: [1, 1.5, 2],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.5,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <motion.p
            className={`${config.text} text-muted-foreground font-medium`}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          >
            {message}
          </motion.p>
          
          {submessage && (
            <p className="text-xs text-muted-foreground/70">{submessage}</p>
          )}

          <div className="flex gap-1 mt-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-6 rounded-full bg-gradient-to-b from-purple-400 to-violet-600"
                animate={{
                  scaleY: [0.3, 1, 0.3],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FreyjaFullPageLoader({ 
  message,
  submessage 
}: { 
  message?: string;
  submessage?: string;
}) {
  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center z-50" data-testid="freyja-fullpage-loader">
      <FreyjaLoader message={message} submessage={submessage} size="lg" />
    </div>
  );
}

export function FreyjaInlineLoader({ 
  message = "Loading...",
  className = ""
}: { 
  message?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="freyja-inline-loader">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-400 to-violet-600"
            animate={{
              scaleY: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.1,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}

export function FreyjaCardLoader() {
  return (
    <div className="p-8 flex items-center justify-center" data-testid="freyja-card-loader">
      <FreyjaLoader size="sm" message="Loading data..." />
    </div>
  );
}
