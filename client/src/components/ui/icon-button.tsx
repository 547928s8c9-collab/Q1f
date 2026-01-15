import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface IconButtonProps extends Omit<ButtonProps, "size"> {
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "icon" as const,
  md: "icon" as const,
  lg: "icon" as const,
};

const iconSizeClasses = {
  sm: "[&_svg]:h-4 [&_svg]:w-4",
  md: "[&_svg]:h-[18px] [&_svg]:w-[18px]",
  lg: "[&_svg]:h-5 [&_svg]:w-5",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "md", variant = "ghost", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size="icon"
        variant={variant}
        className={cn(iconSizeClasses[size], className)}
        {...props}
      />
    );
  }
);

IconButton.displayName = "IconButton";
