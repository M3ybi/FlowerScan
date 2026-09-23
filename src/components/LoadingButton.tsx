import type { ButtonHTMLAttributes, ReactNode } from "react";

type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  loadingLabel?: ReactNode;
};

export const LoadingButton = ({
  children,
  disabled,
  isLoading = false,
  loadingLabel,
  type = "button",
  ...buttonProps
}: LoadingButtonProps) => (
  <button {...buttonProps} type={type} disabled={disabled || isLoading} aria-busy={isLoading || undefined}>
    <span className="button-spinner" aria-hidden="true" />
    <span className="button-label">{isLoading && loadingLabel ? loadingLabel : children}</span>
  </button>
);
