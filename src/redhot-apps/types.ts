export interface LauncherItem {
  /** Saved aliases and hotkeys use this, so it must not change. Apps use "<app id>:<item id>". */
  value: string;
  name: string;
  icon: string;
  kind: string;
  /** Six columns drawn in hotkey lists, picturing what the item does. */
  diagram?: string;
  /** A few words for hotkey lists, for what a diagram can't show. */
  hint?: string;
  /** True when the item asks for input, so a hotkey has to open a window for it first. */
  needsWindow?: boolean;
  /** Replaces the list's key hints while this item is focused. */
  footer?: string;
  /** Resolves to a line to show above the search bar, or "" for none. */
  run: () => Promise<string>;
}

export interface SettingsAction {
  label: string;
  /** Resolves to false when the settings menu should close. */
  run: () => Promise<boolean>;
}

/** A feature that adds its own items to search and its own actions to their settings. */
export interface RedhotApp {
  /** Built-in apps start with "redhot-", so a third-party app can't clash with one. */
  id: string;
  /** Called on every keystroke, so anything saved in another window shows straight away. */
  listItems: () => LauncherItem[];
  listSettingsActions: (itemValue: string) => SettingsAction[];
}
