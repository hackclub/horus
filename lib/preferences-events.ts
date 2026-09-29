// Lets any component open the Preferences dialog (owned by the navbar) on a
// given tab, e.g. the "Set up AI" button inside a ticket peek.

export type PreferencesTab = "general" | "ai";

export const OPEN_PREFERENCES_EVENT = "horus:open-preferences";

export function openPreferences(tab: PreferencesTab = "general") {
  window.dispatchEvent(
    new CustomEvent<PreferencesTab>(OPEN_PREFERENCES_EVENT, { detail: tab }),
  );
}

/** Fired after a key is saved or removed, so open views can refetch. */
export const KEYS_CHANGED_EVENT = "horus:keys-changed";
