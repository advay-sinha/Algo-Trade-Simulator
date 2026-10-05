// Lazily loads the offline symbol catalog (a separate hashed chunk) the first time a symbol field
// is focused, builds the search index once, and shares it across every field on the page.
import { useCallback, useEffect, useState } from "react";
import { buildIndex, type CatalogFile, type SymbolIndex } from "./symbolSearch";

type Status = "idle" | "loading" | "ready" | "error";

let cached: SymbolIndex | null = null;
let pending: Promise<SymbolIndex> | null = null;

function loadIndex(): Promise<SymbolIndex> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = import("@shared/symbols.json?raw")
      .then((module) => {
        cached = buildIndex(JSON.parse(module.default) as CatalogFile);
        return cached;
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

export function useSymbolCatalog() {
  const [index, setIndex] = useState<SymbolIndex | null>(cached);
  const [status, setStatus] = useState<Status>(cached ? "ready" : "idle");

  const ensure = useCallback(() => {
    if (cached) {
      setIndex(cached);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    loadIndex()
      .then((loaded) => {
        setIndex(loaded);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (!cached && pending) ensure();
  }, [ensure]);

  return { index, status, ensure };
}
