import { useEffect } from "react";
import { usePageTitle } from "@/contexts/page-context";

export function useSetPageTitle(title: string, subtitle?: string) {
  const { setTitle, setSubtitle } = usePageTitle();

  useEffect(() => {
    setTitle(title);
    setSubtitle(subtitle);
    return () => {
      setSubtitle(undefined);
    };
  }, [title, subtitle, setTitle, setSubtitle]);
}
