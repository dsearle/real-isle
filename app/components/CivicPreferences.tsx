"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

export const CONSTITUENCY_INTEREST_STORAGE_KEY = "peoples-isle.constituency.v1";

const validConstituencyIds = new Set([
  "ayre-michael",
  "ramsey",
  "garff",
  "onchan",
  "douglas-north",
  "douglas-east",
  "douglas-central",
  "douglas-south",
  "middle",
  "glenfaba-peel",
  "arbory-castletown-malew",
  "rushen",
]);

type CivicPreferencesValue = {
  selectedConstituencyId: string | null;
  setSelectedConstituencyId: (constituencyId: string | null) => void;
};

const CivicPreferencesContext = createContext<CivicPreferencesValue | null>(null);

function validSelection(value: string | null) {
  return value && validConstituencyIds.has(value) ? value : null;
}

const constituencyChangeEvent = "peoples-isle:constituency-change";
let fallbackSelection: string | null = null;
let selectionInitialised = false;

function getSelectionSnapshot() {
  if (!selectionInitialised) {
    try {
      fallbackSelection = validSelection(
        window.localStorage.getItem(CONSTITUENCY_INTEREST_STORAGE_KEY),
      );
    } catch {
      // The in-memory value remains authoritative when storage is unavailable.
    }
    selectionInitialised = true;
  }
  return fallbackSelection;
}

function subscribeToSelection(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSTITUENCY_INTEREST_STORAGE_KEY) {
      fallbackSelection = validSelection(event.newValue);
      selectionInitialised = true;
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(constituencyChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(constituencyChangeEvent, onStoreChange);
  };
}

export function CivicPreferencesProvider({ children }: { children: React.ReactNode }) {
  const selectedConstituencyId = useSyncExternalStore(
    subscribeToSelection,
    getSelectionSnapshot,
    () => null,
  );

  const setSelectedConstituencyId = useCallback((constituencyId: string | null) => {
    const nextSelection = validSelection(constituencyId);
    fallbackSelection = nextSelection;
    selectionInitialised = true;
    try {
      if (nextSelection) {
        window.localStorage.setItem(CONSTITUENCY_INTEREST_STORAGE_KEY, nextSelection);
      } else {
        window.localStorage.removeItem(CONSTITUENCY_INTEREST_STORAGE_KEY);
      }
    } catch {
      // Preference persistence is an enhancement; in-memory selection still works.
    }
    window.dispatchEvent(new Event(constituencyChangeEvent));
  }, []);

  const value = useMemo(
    () => ({ selectedConstituencyId, setSelectedConstituencyId }),
    [selectedConstituencyId, setSelectedConstituencyId],
  );

  return (
    <CivicPreferencesContext.Provider value={value}>
      {children}
    </CivicPreferencesContext.Provider>
  );
}

export function useCivicPreferences() {
  const value = useContext(CivicPreferencesContext);
  if (!value) throw new Error("useCivicPreferences must be used within CivicPreferencesProvider");
  return value;
}
