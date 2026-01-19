import React, { createContext, useContext, useState, type ReactNode } from "react";

interface PageContextValue {
  title: string;
  setTitle: (title: string) => void;
  subtitle?: string;
  setSubtitle: (subtitle?: string) => void;
}

const PageContext = createContext<PageContextValue | undefined>(undefined);

export function PageProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState("Home");
  const [subtitle, setSubtitle] = useState<string | undefined>();

  return (
    <PageContext.Provider value={{ title, setTitle, subtitle, setSubtitle }}>
      {children}
    </PageContext.Provider>
  );
}

export function usePageTitle() {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error("usePageTitle must be used within PageProvider");
  }
  return context;
}
