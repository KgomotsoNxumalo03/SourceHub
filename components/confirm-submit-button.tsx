"use client";

import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui";

export function ConfirmSubmitButton({
  confirmMessage,
  children,
  onClick,
  ...props
}: Omit<ButtonProps, "children"> & {
  confirmMessage: string;
  children: ReactNode;
}) {
  return (
    <Button
      {...props}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
    >
      {children}
    </Button>
  );
}
