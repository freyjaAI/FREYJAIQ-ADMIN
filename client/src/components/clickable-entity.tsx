import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { User, Building2, Home, Loader2, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ClickableEntityProps {
  name: string;
  type?: "individual" | "entity" | "property" | string;
  id?: string;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  /** Address hint for contact enrichment filtering (e.g., from property context) */
  addressHint?: string;
}

export function ClickableEntity({
  name,
  type = "entity",
  id,
  className,
  showIcon = true,
  size = "md",
  addressHint,
}: ClickableEntityProps) {
  const [, navigate] = useLocation();

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/owners/resolve-by-name", {
        name,
        type: type === "individual" ? "individual" : "entity",
        addressHint: addressHint || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.owner?.id) {
        navigate(`/owners/${data.owner.id}`);
      }
    },
  });

  const isIndividual = type === "individual";
  const isProperty = type === "property";
  const Icon = isProperty ? Home : isIndividual ? User : Building2;

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg font-medium",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  if (id) {
    const href = isProperty ? `/properties/${id}` : `/owners/${id}`;
    return (
      <Link href={href}>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 cursor-pointer hover:underline text-foreground font-medium",
            sizeClasses[size],
            className
          )}
          data-testid={`link-entity-${id}`}
        >
          {showIcon && (
            <Icon
              className={cn(
                iconSizes[size],
                isIndividual ? "text-green-600" : "text-muted-foreground",
                "flex-shrink-0"
              )}
            />
          )}
          <span className="truncate">{name}</span>
        </span>
      </Link>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!resolveMutation.isPending) {
          resolveMutation.mutate();
        }
      }}
      disabled={resolveMutation.isPending}
      className={cn(
        "inline-flex items-center gap-1.5 cursor-pointer hover:underline text-foreground font-medium bg-transparent border-none p-0 text-left",
        sizeClasses[size],
        resolveMutation.isPending && "opacity-50 cursor-wait",
        className
      )}
      data-testid={`button-resolve-entity-${name.replace(/\s+/g, "-").toLowerCase()}`}
    >
      {resolveMutation.isPending ? (
        <Loader2 className={cn(iconSizes[size], "animate-spin flex-shrink-0")} />
      ) : showIcon ? (
        <Icon
          className={cn(
            iconSizes[size],
            isIndividual ? "text-green-600" : "text-muted-foreground",
            "flex-shrink-0"
          )}
        />
      ) : null}
      <span className="truncate">{name}</span>
    </button>
  );
}

interface ClickablePropertyProps {
  address: string;
  city?: string | null;
  state?: string | null;
  id?: string;
  className?: string;
  showIcon?: boolean;
}

export function ClickableProperty({
  address,
  city,
  state,
  id,
  className,
  showIcon = true,
}: ClickablePropertyProps) {
  const fullAddress = [address, city, state].filter(Boolean).join(", ");

  if (id) {
    return (
      <Link href={`/properties/${id}`}>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 cursor-pointer hover:underline text-foreground",
            className
          )}
          data-testid={`link-property-${id}`}
        >
          {showIcon && <Home className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          <span className="truncate">{fullAddress}</span>
        </span>
      </Link>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {showIcon && <Home className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      <span className="truncate">{fullAddress}</span>
    </span>
  );
}

interface EntityLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function EntityLink({ href, children, className }: EntityLinkProps) {
  return (
    <Link href={href}>
      <span
        className={cn(
          "inline-flex items-center gap-1 cursor-pointer hover:underline text-foreground font-medium",
          className
        )}
      >
        {children}
        <ExternalLink className="h-3 w-3 opacity-50" />
      </span>
    </Link>
  );
}
