import { listPortListeners, listRunningItems, logPortLookupFailure, toPort } from "./list.ts";
import type { RunningItem } from "./list.ts";

// Long enough that typing "3000" doesn't look up ports 3, 30 and 300 on the way.
const PORT_LOOKUP_DELAY_MS = 120;

export interface ProcessSearch {
  /** Reads everything again for this text, and resolves once the results are in. */
  reload: (query: string) => Promise<void>;
  setQuery: (query: string) => void;
  getResults: () => readonly RunningItem[];
  isSearching: () => boolean;
  /** The port the text is asking about, if it is. */
  getPort: () => number | undefined;
  /** Set while a list is showing, because a port's results land after the keystroke. */
  setOnChange: (listener: (() => void) | undefined) => void;
  stop: () => void;
}

interface ProcessSearchOptions {
  loadAll?: () => Promise<readonly RunningItem[]>;
  loadPort?: (port: number) => Promise<readonly RunningItem[]>;
  delayMs?: number;
}

export const createProcessSearch = ({
  loadAll = listRunningItems,
  loadPort = listPortListeners,
  delayMs = PORT_LOOKUP_DELAY_MS,
}: ProcessSearchOptions = {}): ProcessSearch => {
  let everything: readonly RunningItem[] = [];
  let listeners: readonly RunningItem[] = [];
  let port: number | undefined;
  let isLookingUp = false;
  let timer: NodeJS.Timeout | undefined;
  // A slower, older lookup must not replace the answer for what's typed now.
  let latestLookup = 0;
  let onChange: (() => void) | undefined;

  const startLookup = (): number => {
    clearTimeout(timer);
    latestLookup += 1;
    return latestLookup;
  };

  const lookUp = async (target: number, lookup: number): Promise<void> => {
    let found: readonly RunningItem[] = [];
    try {
      found = await loadPort(target);
    } catch (error) {
      logPortLookupFailure(error);
    }
    if (lookup === latestLookup) {
      listeners = found;
      isLookingUp = false;
    }
  };

  const applyQuery = (query: string): number | undefined => {
    port = toPort(query);
    listeners = [];
    isLookingUp = port !== undefined;
    return port;
  };

  return {
    reload: async (query) => {
      const lookup = startLookup();
      const target = applyQuery(query);
      const [all] = await Promise.all([
        loadAll(),
        target === undefined ? undefined : lookUp(target, lookup),
      ]);
      everything = all;
    },
    setQuery: (query) => {
      // The list reports its opening text as a change, and that port has just been looked up.
      if (toPort(query) === port) {
        return;
      }
      const lookup = startLookup();
      const target = applyQuery(query);
      if (target === undefined) {
        return;
      }
      timer = setTimeout(async () => {
        await lookUp(target, lookup);
        if (lookup === latestLookup) {
          onChange?.();
        }
      }, delayMs);
    },
    getResults: () => (port === undefined ? everything : listeners),
    isSearching: () => isLookingUp,
    getPort: () => port,
    setOnChange: (listener) => {
      onChange = listener;
    },
    stop: () => {
      startLookup();
      onChange = undefined;
    },
  };
};
