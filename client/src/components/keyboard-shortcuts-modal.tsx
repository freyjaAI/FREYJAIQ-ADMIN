import { useEffect, useState } from "react";
import { Keyboard, Command, Search, Bug, Moon, Sun, Sidebar, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShortcutItem {
  keys: string[];
  description: string;
  icon: typeof Command;
  category: "navigation" | "actions" | "ui";
}

const shortcuts: ShortcutItem[] = [
  {
    keys: ["⌘", "K"],
    description: "Focus search bar",
    icon: Search,
    category: "navigation",
  },
  {
    keys: ["⌘", "Shift", "B"],
    description: "Open bug report",
    icon: Bug,
    category: "actions",
  },
  {
    keys: ["⌘", "/"],
    description: "Toggle sidebar",
    icon: Sidebar,
    category: "ui",
  },
  {
    keys: ["?"],
    description: "Show keyboard shortcuts",
    icon: Keyboard,
    category: "ui",
  },
  {
    keys: ["Esc"],
    description: "Close modal / Cancel",
    icon: X,
    category: "ui",
  },
];

const categoryLabels = {
  navigation: "Navigation",
  actions: "Actions",
  ui: "Interface",
};

function KeyBadge({ children }: { children: string }) {
  return (
    <Badge
      variant="outline"
      className="bg-zinc-800/80 border-white/20 text-white font-mono text-xs px-2 py-0.5 min-w-[28px] justify-center"
    >
      {children}
    </Badge>
  );
}

export function KeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on ? without modifiers (except shift for ?)
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Don't trigger if typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsOpen(true);
      }

      // Close on Escape
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);

  return (
    <>
      {/* Trigger Button - shown in header or footer */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="text-muted-foreground"
        aria-label="Keyboard shortcuts"
        data-testid="button-keyboard-shortcuts"
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[480px] bg-zinc-900/98 backdrop-blur-xl border-white/10 rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-3 text-lg">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-600 to-zinc-700">
                <Keyboard className="h-5 w-5 text-white" />
              </div>
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-5">
            {(Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>).map((category) => {
              const categoryShortcuts = groupedShortcuts[category];
              if (!categoryShortcuts?.length) return null;

              return (
                <div key={category}>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    {categoryLabels[category]}
                  </h3>
                  <div className="space-y-2">
                    {categoryShortcuts.map((shortcut, idx) => {
                      const Icon = shortcut.icon;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-white/5"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{shortcut.description}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, keyIdx) => (
                              <KeyBadge key={keyIdx}>{key}</KeyBadge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="pt-2 text-center">
              <p className="text-xs text-muted-foreground">
                Press <KeyBadge>?</KeyBadge> anytime to see this guide
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
